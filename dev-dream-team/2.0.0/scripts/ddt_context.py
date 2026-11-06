#!/usr/bin/env python3
"""Small deterministic helper for the local DDT repository overlay."""

from __future__ import annotations

import argparse
import contextlib
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any, Iterator


SCHEMA_VERSION = 1
WRITER_ROLES = {"update-repository-context"}
SCOPES = {"owned", "observed", "adjacent", "case_edge", "external"}
STATUS = {"active", "inactive", "blocked", "complete"}
HANDOFF_STATES = {"executing", "reasoning_escalated", "bounded_execution", "completed", "human_blocked"}
PRESSURE_LEVELS = {"none", "observed", "elevated"}
ID_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{0,79}$")
SECRET_KEY_RE = re.compile(r"(?:token|secret|password|credential|connection|string|raw[_-]?log|raw[_-]?payload|authorization)", re.I)
REDACTIONS = [
    (re.compile(r"(?i)bearer\s+[a-z0-9._~+\-/=]+"), "Bearer [REDACTED_SECRET]"),
    (re.compile(r"\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b"), "[REDACTED_SECRET]"),
    (re.compile(r"-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z]+)? PRIVATE KEY-----"), "[REDACTED_SECRET]"),
    (re.compile(r"(?i)\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis)://[^\s'\"]+"), "[REDACTED_SECRET]"),
    (re.compile(r"(?i)\b(?:api[_-]?key|password|secret|token)\s*[:=]\s*[^\s,;]+"), "[REDACTED_SECRET]"),
]


class DDTError(RuntimeError):
    pass


def emit(value: Any) -> None:
    print(json.dumps(value, indent=2, sort_keys=True))


def git(repo: Path, *args: str, allow_failure: bool = False) -> str:
    result = subprocess.run(
        ["git", *args], cwd=repo, text=True, capture_output=True, check=False
    )
    if result.returncode and not allow_failure:
        detail = result.stderr.strip() or result.stdout.strip() or "unknown Git error"
        raise DDTError(f"git {' '.join(args)} failed: {detail}")
    return result.stdout.strip()


def lines(value: str) -> list[str]:
    return [line for line in value.splitlines() if line]


def repository_info(repo_hint: str | None) -> dict[str, Any]:
    start = Path(repo_hint or os.getcwd()).resolve()
    root = Path(git(start, "rev-parse", "--show-toplevel")).resolve()
    head = git(root, "rev-parse", "HEAD", allow_failure=True)
    branch = git(root, "symbolic-ref", "--quiet", "--short", "HEAD", allow_failure=True)
    if not branch:
        branch = f"detached:{head[:12]}" if head else "unborn"
    worktree = str(root)
    git_dir_raw = git(root, "rev-parse", "--git-dir")
    git_dir = (root / git_dir_raw).resolve() if not Path(git_dir_raw).is_absolute() else Path(git_dir_raw).resolve()
    return {
        "repository": str(root),
        "worktree": worktree,
        "git_dir": str(git_dir),
        "branch": branch,
        "head": head,
        "staged": lines(git(root, "diff", "--cached", "--name-only")),
        "unstaged": lines(git(root, "diff", "--name-only")),
        "untracked": lines(git(root, "ls-files", "--others", "--exclude-standard")),
    }


def overlay_root(info: dict[str, Any]) -> Path:
    return Path(info["repository"]) / ".ddt"


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes()) if path.exists() else sha256_bytes(b"")


def reject_reparse_path(root: Path, target: Path) -> None:
    current = root
    while current != target.parent:
        current = current / target.relative_to(root).parts[len(current.relative_to(root).parts)]
        if current.exists() and current.is_symlink():
            raise DDTError(f"symlink path is not allowed: {current}")


def safe_path(root: Path, relative: str) -> Path:
    candidate = Path(relative)
    if candidate.is_absolute() or ".." in candidate.parts:
        raise DDTError(f"unsafe relative path: {relative}")
    destination = root / candidate
    parent_real = Path(os.path.realpath(destination.parent))
    root_real = Path(os.path.realpath(root))
    if os.path.commonpath([str(parent_real), str(root_real)]) != str(root_real):
        raise DDTError(f"path escapes DDT overlay: {relative}")
    if root.exists():
        for part in [root, *[root.joinpath(*candidate.parts[:index]) for index in range(1, len(candidate.parts))]]:
            if part.exists() and part.is_symlink():
                raise DDTError(f"symlink path is not allowed: {part}")
    return destination


def redact(value: Any) -> Any:
    if isinstance(value, str):
        for pattern, replacement in REDACTIONS:
            value = pattern.sub(replacement, value)
        return value
    if isinstance(value, list):
        return [redact(item) for item in value]
    if isinstance(value, dict):
        return {key: redact(item) for key, item in value.items()}
    return value


def validate_text(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise DDTError(f"{field} must be a non-empty string")
    if len(value) > 12000:
        raise DDTError(f"{field} is too long; persist a concise semantic summary")
    return value.strip()


def validate_bounded_text(value: Any, field: str, maximum: int) -> str:
    text = validate_text(value, field)
    if len(text) > maximum:
        raise DDTError(f"{field} exceeds the {maximum}-character structured context bound")
    return text


def validate_id(value: Any, field: str = "id") -> str:
    if not isinstance(value, str) or not ID_RE.fullmatch(value):
        raise DDTError(f"{field} must match {ID_RE.pattern}")
    return value


def reject_sensitive_keys(record: dict[str, Any]) -> None:
    for key, value in record.items():
        if SECRET_KEY_RE.search(key):
            raise DDTError(f"field is not allowed in persisted record: {key}")
        if isinstance(value, dict):
            reject_sensitive_keys(value)
        elif isinstance(value, list):
            for item in value:
                if isinstance(item, dict):
                    reject_sensitive_keys(item)


def allowed(record: dict[str, Any], names: set[str]) -> None:
    extra = set(record) - names
    if extra:
        raise DDTError(f"unsupported persisted fields: {', '.join(sorted(extra))}")


def validate_evidence(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list) or not value:
        raise DDTError("evidence must be a non-empty list")
    output: list[dict[str, Any]] = []
    for item in value:
        if not isinstance(item, dict):
            raise DDTError("evidence entries must be objects")
        allowed(item, {"source", "kind", "reference", "observed_at", "environment", "schema_version", "base_sha", "excerpt"})
        source = validate_text(item.get("source"), "evidence.source")
        entry = {"source": source}
        for field in ("kind", "observed_at", "environment", "schema_version", "base_sha"):
            if field in item:
                entry[field] = validate_bounded_text(item[field], f"evidence.{field}", 256)
        for field in ("reference", "excerpt"):
            if field in item:
                entry[field] = validate_bounded_text(item[field], f"evidence.{field}", 512)
        output.append(entry)
    return output


def relative_repo_path(value: Any) -> str:
    text = validate_text(value, "path")
    path = Path(text)
    if path.is_absolute() or ".." in path.parts:
        raise DDTError(f"unsafe repository path: {text}")
    return path.as_posix()


def validate_relations(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        raise DDTError("relations must be a list")
    relations: list[dict[str, Any]] = []
    for relation in value:
        if not isinstance(relation, dict):
            raise DDTError("relation entries must be objects")
        allowed(relation, {"target", "kind", "confidence", "evidence", "trigger"})
        clean = {
            "target": validate_id(relation.get("target"), "relation.target"),
            "kind": validate_text(relation.get("kind"), "relation.kind"),
            "confidence": relation.get("confidence", "observed"),
            "evidence": validate_evidence(relation.get("evidence")),
        }
        if clean["confidence"] not in {"observed", "inferred"}:
            raise DDTError("relation.confidence must be observed or inferred")
        if "trigger" in relation:
            clean["trigger"] = validate_text(relation["trigger"], "relation.trigger")
        relations.append(clean)
    return relations


def validate_link_ids(value: Any, field: str) -> list[str]:
    if not isinstance(value, list) or not value:
        raise DDTError(f"{field} must be a non-empty list")
    return [validate_id(item, field) for item in value]


def validate_external_ref(value: Any) -> dict[str, str]:
    if not isinstance(value, dict):
        raise DDTError("external_ref must be an object")
    allowed(value, {"repository", "reference", "description"})
    result = {
        "repository": validate_text(value.get("repository"), "external_ref.repository"),
        "reference": validate_text(value.get("reference"), "external_ref.reference"),
    }
    if "description" in value:
        result["description"] = validate_text(value["description"], "external_ref.description")
    return result


def validate_architecture_pressure(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise DDTError("architecture_pressure must be an object")
    allowed(value, {"level", "signals"})
    level = value.get("level")
    if level not in PRESSURE_LEVELS:
        raise DDTError("architecture_pressure.level must be none, observed, or elevated")
    signals = value.get("signals", [])
    if not isinstance(signals, list):
        raise DDTError("architecture_pressure.signals must be a list")
    if level == "none" and signals:
        raise DDTError("architecture_pressure none cannot carry signals")
    if level != "none" and not signals:
        raise DDTError("architecture_pressure observed/elevated requires signals")
    return {"level": level, "signals": [validate_text(item, "architecture_pressure.signals") for item in signals]}


def validate_record(record: Any) -> tuple[str, dict[str, Any], str]:
    if not isinstance(record, dict):
        raise DDTError("record must be a JSON object")
    record = redact(record)
    reject_sensitive_keys(record)
    kind = record.get("record_type")
    if kind not in {"graph-node", "task-state", "knowledge", "playbook", "evidence"}:
        raise DDTError("record_type must be graph-node, task-state, knowledge, playbook, or evidence")
    if record.get("schema_version") != SCHEMA_VERSION:
        raise DDTError(f"schema_version must be {SCHEMA_VERSION}")

    if kind == "graph-node":
        allowed(record, {"record_type", "schema_version", "id", "scope", "summary", "paths", "relations", "evidence", "confidence", "last_verified_sha", "last_verified_date", "triggers", "knowledge_refs", "playbook_refs", "external_ref", "architecture_pressure"})
        node_id = validate_id(record.get("id"))
        scope = record.get("scope")
        if scope not in SCOPES:
            raise DDTError(f"scope must be one of {', '.join(sorted(SCOPES))}")
        paths = record.get("paths", [])
        if not isinstance(paths, list) or (scope != "external" and not paths):
            raise DDTError("paths must be a non-empty list for non-external graph nodes")
        result: dict[str, Any] = {"schema_version": 1, "id": node_id, "scope": scope, "summary": validate_text(record.get("summary"), "summary"), "paths": [relative_repo_path(path) for path in paths], "evidence": validate_evidence(record.get("evidence")), "confidence": record.get("confidence", "observed")}
        if result["confidence"] not in {"observed", "inferred"}:
            raise DDTError("confidence must be observed or inferred")
        for field in ("last_verified_sha", "last_verified_date"):
            if field in record:
                result[field] = validate_text(record[field], field)
        if "relations" in record:
            result["relations"] = validate_relations(record["relations"])
        for field in ("knowledge_refs", "playbook_refs"):
            if field in record:
                result[field] = validate_link_ids(record[field], field)
        if "external_ref" in record:
            if scope != "external":
                raise DDTError("external_ref is allowed only on external graph nodes")
            result["external_ref"] = validate_external_ref(record["external_ref"])
        if "architecture_pressure" in record:
            result["architecture_pressure"] = validate_architecture_pressure(record["architecture_pressure"])
        if "triggers" in record:
            if not isinstance(record["triggers"], list) or not record["triggers"]:
                raise DDTError("triggers must be a non-empty list")
            result["triggers"] = [validate_text(item, "triggers") for item in record["triggers"]]
        if scope == "case_edge" and not result.get("triggers"):
            raise DDTError("case_edge graph nodes require non-empty triggers")
        if scope == "external" and not result.get("external_ref"):
            raise DDTError("external graph nodes require external_ref")
        return kind, result, f"graph/nodes/{node_id}.json"

    if kind == "task-state":
        allowed(record, {"record_type", "schema_version", "task_id", "repository", "worktree", "branch", "base_sha", "objective", "status", "confirmed", "eliminated", "current_hypothesis", "open_unknowns", "next_action", "reasoning_owner", "execution_owner", "handoff_state"})
        task_id = validate_id(record.get("task_id"), "task_id")
        result = {"schema_version": 1, "task_id": task_id, "repository": validate_text(record.get("repository"), "repository"), "worktree": validate_text(record.get("worktree"), "worktree"), "branch": validate_text(record.get("branch"), "branch"), "base_sha": validate_text(record.get("base_sha"), "base_sha"), "objective": validate_text(record.get("objective"), "objective"), "status": record.get("status")}
        if result["status"] not in STATUS:
            raise DDTError(f"status must be one of {', '.join(sorted(STATUS))}")
        for field in ("confirmed", "eliminated", "open_unknowns"):
            if field in record:
                if not isinstance(record[field], list):
                    raise DDTError(f"{field} must be a list")
                result[field] = [validate_text(item, field) for item in record[field]]
        for field in ("current_hypothesis", "next_action"):
            if field in record:
                result[field] = validate_text(record[field], field)
        owners = {"terra", "sol"}
        for field in ("reasoning_owner", "execution_owner"):
            if field in record:
                if record[field] not in owners:
                    raise DDTError(f"{field} must be terra or sol")
                result[field] = record[field]
        if "handoff_state" in record:
            if record["handoff_state"] not in HANDOFF_STATES:
                raise DDTError(f"handoff_state must be one of {', '.join(sorted(HANDOFF_STATES))}")
            result["handoff_state"] = record["handoff_state"]
        if result.get("execution_owner") == "sol":
            raise DDTError("execution_owner must remain terra")
        return kind, result, f"state/{task_id}.json"

    if kind == "knowledge":
        allowed(record, {"record_type", "schema_version", "id", "title", "summary", "behavior", "why", "evidence"})
        record_id = validate_id(record.get("id"))
        result = {"schema_version": 1, "id": record_id, "title": validate_text(record.get("title"), "title"), "summary": validate_text(record.get("summary"), "summary"), "behavior": validate_text(record.get("behavior"), "behavior"), "why": validate_text(record.get("why"), "why"), "evidence": validate_evidence(record.get("evidence"))}
        return kind, result, f"product-knowledge/{record_id}.json"

    if kind == "playbook":
        allowed(record, {"record_type", "schema_version", "id", "title", "purpose", "preconditions", "steps", "verification", "evidence"})
        record_id = validate_id(record.get("id"))
        steps = record.get("steps")
        if not isinstance(steps, list) or not steps:
            raise DDTError("steps must be a non-empty list")
        result = {"schema_version": 1, "id": record_id, "title": validate_text(record.get("title"), "title"), "purpose": validate_text(record.get("purpose"), "purpose"), "preconditions": [validate_text(item, "preconditions") for item in record.get("preconditions", [])], "steps": [validate_text(item, "steps") for item in steps], "verification": validate_text(record.get("verification"), "verification"), "evidence": validate_evidence(record.get("evidence"))}
        return kind, result, f"playbooks/{record_id}.json"

    allowed(record, {"record_type", "schema_version", "task_id", "claim", "source", "confidence", "implication"})
    task_id = validate_id(record.get("task_id"), "task_id")
    result = {"schema_version": 1, "task_id": task_id, "claim": validate_text(record.get("claim"), "claim"), "source": validate_text(record.get("source"), "source"), "confidence": validate_text(record.get("confidence"), "confidence"), "implication": validate_text(record.get("implication"), "implication")}
    return kind, result, f"evidence/{task_id}.jsonl"


@contextlib.contextmanager
def exclusive_lock(root: Path, timeout_seconds: float = 8.0) -> Iterator[None]:
    lock = root / ".ddt-context.lock"
    deadline = time.monotonic() + timeout_seconds
    descriptor: int | None = None
    while descriptor is None:
        try:
            descriptor = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(descriptor, str(os.getpid()).encode("ascii"))
        except FileExistsError:
            if time.monotonic() >= deadline:
                raise DDTError("timed out waiting for a DDT context write lock")
            time.sleep(0.05)
    try:
        yield
    finally:
        os.close(descriptor)
        with contextlib.suppress(FileNotFoundError):
            lock.unlink()


def atomic_write(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix=f".{path.name}.", delete=False) as handle:
        handle.write(content)
        temp = Path(handle.name)
    try:
        os.replace(temp, path)
    finally:
        with contextlib.suppress(FileNotFoundError):
            temp.unlink()


def merge_graph_index(overlay: Path, node: dict[str, Any]) -> None:
    """Upsert compact Level-1 navigation metadata without loading other nodes."""
    index_path = safe_path(overlay, "graph/index.json")
    index = {"schema_version": SCHEMA_VERSION, "nodes": []}
    if index_path.exists():
        try:
            loaded = json.loads(index_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as error:
            raise DDTError(f"unable to merge graph index: {error}") from error
        if not isinstance(loaded, dict) or loaded.get("schema_version") != SCHEMA_VERSION or not isinstance(loaded.get("nodes"), list):
            raise DDTError("unable to merge graph index: expected schema_version 1 and nodes list")
        index = loaded
    entry = {
        "id": node["id"],
        "scope": node["scope"],
        "summary": node["summary"][:240],
        "path_hints": node["paths"][:3],
        "confidence": node["confidence"],
    }
    if "last_verified_sha" in node:
        entry["last_verified_sha"] = node["last_verified_sha"]
    if "external_ref" in node:
        entry["external_ref"] = node["external_ref"]
    if node.get("architecture_pressure", {}).get("level") in {"observed", "elevated"}:
        entry["architecture_pressure"] = node["architecture_pressure"]
    index["nodes"] = [item for item in index["nodes"] if not isinstance(item, dict) or item.get("id") != node["id"]]
    index["nodes"].append(entry)
    index["nodes"].sort(key=lambda item: item["id"])
    atomic_write(index_path, json.dumps(index, indent=2, sort_keys=True).encode("utf-8") + b"\n")


def git_contamination(root: Path) -> dict[str, list[str]]:
    return {
        "tracked": lines(git(root, "ls-files", "--", ".ddt")),
        "staged": lines(git(root, "diff", "--cached", "--name-only", "--", ".ddt")),
    }


def command_init(args: argparse.Namespace) -> int:
    info = repository_info(args.repo)
    root = Path(info["repository"])
    contamination = git_contamination(root)
    if contamination["tracked"] or contamination["staged"]:
        emit({"ok": False, "reason": "tracked-or-staged-ddt-content", **contamination})
        return 2
    overlay = overlay_root(info)
    for name in ("graph/nodes", "product-knowledge", "playbooks", "state", "evidence"):
        (overlay / name).mkdir(parents=True, exist_ok=True)
    exclude_raw = git(root, "rev-parse", "--git-path", "info/exclude")
    exclude = Path(exclude_raw)
    if not exclude.is_absolute():
        exclude = root / exclude
    existing = exclude.read_text(encoding="utf-8") if exclude.exists() else ""
    entries = {line.strip() for line in existing.splitlines() if line.strip() and not line.lstrip().startswith("#")}
    changed = ".ddt/" not in entries and ".ddt" not in entries
    if changed:
        suffix = "" if not existing or existing.endswith("\n") else "\n"
        atomic_write(exclude, (existing + suffix + ".ddt/\n").encode("utf-8"))
    emit({"ok": True, "overlay": str(overlay), "exclude": str(exclude), "exclude_updated": changed, "context": info})
    return 0


def command_context(args: argparse.Namespace) -> int:
    info = repository_info(args.repo)
    if args.task:
        info["task_id"] = validate_id(args.task, "task")
    emit(info)
    return 0


def node_status(root: Path, info: dict[str, Any], node: dict[str, Any]) -> dict[str, Any]:
    status = {"id": node.get("id"), "state": "fresh", "changed_paths": [], "missing_paths": []}
    if node.get("scope") == "external":
        status["state"] = "external"
        status["external_ref"] = node.get("external_ref")
        return status
    paths = node.get("paths", [])
    for relative in paths:
        if not (root / relative).exists():
            status["missing_paths"].append(relative)
    if status["missing_paths"]:
        status["state"] = "missing"
        return status
    sha = node.get("last_verified_sha")
    if not sha:
        status["state"] = "unknown"
        return status
    if git(root, "cat-file", "-e", f"{sha}^{{commit}}", allow_failure=True) == "":
        # git cat-file emits no output on success; inspect status through rev-parse instead.
        if not git(root, "rev-parse", "--verify", sha, allow_failure=True):
            status["state"] = "unknown"
            return status
    changed = lines(git(root, "diff", "--name-only", f"{sha}..HEAD", "--", *paths, allow_failure=True))
    dirty = set(info["staged"] + info["unstaged"] + info["untracked"])
    dirty_paths = sorted(path for path in paths if path in dirty)
    if dirty_paths:
        status["state"] = "dirty-task-local"
        status["changed_paths"] = sorted(set(changed + dirty_paths))
    elif changed:
        status["state"] = "stale"
        status["changed_paths"] = sorted(set(changed))
    return status


def validate_link_target(overlay: Path, kind: str, record_id: str) -> str | None:
    folder = "product-knowledge" if kind == "knowledge" else "playbooks"
    path = safe_path(overlay, f"{folder}/{record_id}.json")
    if not path.exists():
        return f"{kind}:{record_id}:missing"
    try:
        stored = json.loads(path.read_text(encoding="utf-8"))
        validate_record({"record_type": kind, **stored})
    except (json.JSONDecodeError, DDTError) as error:
        return f"{kind}:{record_id}:invalid:{error}"
    return None


def enforce_committed_provenance(root: Path, info: dict[str, Any], kind: str, record: dict[str, Any]) -> None:
    dirty = set(info["staged"] + info["unstaged"] + info["untracked"])
    if kind == "graph-node" and record.get("scope") != "external" and record.get("last_verified_sha"):
        sha = record["last_verified_sha"]
        changed = lines(git(root, "diff", "--name-only", f"{sha}..HEAD", "--", *record["paths"], allow_failure=True))
        changed.extend(path for path in record["paths"] if path in dirty)
        if changed:
            raise DDTError(
                "last_verified_sha does not contain the current cited graph paths: "
                + ", ".join(sorted(set(changed)))
            )

    for evidence in record.get("evidence", []):
        evidence_kind = str(evidence.get("kind", evidence.get("source", ""))).lower()
        if evidence_kind not in {"current-code", "verified-code"}:
            continue
        base_sha = evidence.get("base_sha")
        reference = evidence.get("reference")
        if not base_sha or not reference:
            raise DDTError("current-code evidence requires base_sha and a repository-relative reference")
        if not git(root, "rev-parse", "--verify", f"{base_sha}^{{commit}}", allow_failure=True):
            raise DDTError("current-code evidence base_sha is not an available commit")
        relative = relative_repo_path(reference)
        if relative in dirty:
            raise DDTError(f"current-code evidence is dirty and remains task-local: {relative}")
        committed_paths = lines(git(root, "ls-tree", "-r", "--name-only", base_sha, "--", relative, allow_failure=True))
        if relative not in committed_paths:
            raise DDTError(f"current-code evidence is absent from base_sha: {relative}")


def command_validate(args: argparse.Namespace) -> int:
    info = repository_info(args.repo)
    root = Path(info["repository"])
    overlay = overlay_root(info)
    index = overlay / "graph" / "index.json"
    findings: list[dict[str, Any]] = []
    if not index.exists():
        emit({"ok": True, "overlay": str(overlay), "graph": "absent", "nodes": [], "context": info})
        return 0
    try:
        data = json.loads(index.read_text(encoding="utf-8"))
        nodes = data.get("nodes") if isinstance(data, dict) else None
        if not isinstance(data, dict) or data.get("schema_version") != SCHEMA_VERSION or not isinstance(nodes, list):
            raise DDTError("graph/index.json must contain schema_version 1 and a nodes list")
        for entry in nodes:
            if not isinstance(entry, dict) or not isinstance(entry.get("id"), str):
                raise DDTError("graph index node entries require id")
            node_file = safe_path(overlay, f"graph/nodes/{entry['id']}.json")
            if not node_file.exists():
                findings.append({"id": entry["id"], "state": "missing-node-file"})
                continue
            node = json.loads(node_file.read_text(encoding="utf-8"))
            _, clean, _ = validate_record({"record_type": "graph-node", **node})
            status = node_status(root, info, clean)
            broken_links: list[str] = []
            for record_id in clean.get("knowledge_refs", []):
                finding = validate_link_target(overlay, "knowledge", record_id)
                if finding:
                    broken_links.append(finding)
            for record_id in clean.get("playbook_refs", []):
                finding = validate_link_target(overlay, "playbook", record_id)
                if finding:
                    broken_links.append(finding)
            if broken_links:
                status["broken_links"] = broken_links
            findings.append(status)
    except (json.JSONDecodeError, DDTError) as error:
        emit({"ok": False, "reason": str(error), "overlay": str(overlay)})
        return 2
    emit({"ok": not any(item["state"] in {"missing", "missing-node-file"} or item.get("broken_links") for item in findings), "overlay": str(overlay), "graph": "present", "nodes": findings, "context": info})
    return 0


def command_write(args: argparse.Namespace) -> int:
    if args.writer_role not in WRITER_ROLES:
        raise DDTError("writer-role must be update-repository-context")
    info = repository_info(args.repo)
    root = Path(info["repository"])
    contamination = git_contamination(root)
    if contamination["tracked"] or contamination["staged"]:
        raise DDTError("tracked or staged .ddt content blocks durable writes; resolve the contamination first")
    overlay = overlay_root(info)
    if not overlay.exists():
        raise DDTError("DDT overlay is absent; run init first")
    try:
        record = json.loads(Path(args.record).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise DDTError(f"unable to read record: {error}") from error
    kind, clean, relative = validate_record(record)
    enforce_committed_provenance(root, info, kind, clean)
    if kind == "graph-node" and clean["scope"] != "external":
        missing = [path for path in clean["paths"] if not (root / path).exists()]
        if missing:
            raise DDTError(f"graph node paths do not exist in current repository: {', '.join(missing)}")
        verified = clean.get("last_verified_sha")
        if verified and not git(root, "rev-parse", "--verify", f"{verified}^{{commit}}", allow_failure=True):
            raise DDTError("last_verified_sha is not an available commit")
    if kind == "task-state":
        for field in ("repository", "worktree", "branch"):
            if clean[field] != info[field]:
                raise DDTError(f"task-state {field} does not match the current repository context")
        if not git(root, "rev-parse", "--verify", f"{clean['base_sha']}^{{commit}}", allow_failure=True):
            raise DDTError("task-state base_sha is not an available commit")
    destination = safe_path(overlay, relative)
    with exclusive_lock(overlay):
        actual = sha256_file(destination)
        if destination.exists() and not args.expected_hash:
            raise DDTError("destination exists; provide expected-hash after re-reading before replacing it")
        if args.expected_hash and args.expected_hash != actual:
            raise DDTError("destination changed since expected-hash; re-read and merge instead of overwriting")
        if kind == "evidence" and destination.exists():
            content = destination.read_bytes() + json.dumps(clean, sort_keys=True).encode("utf-8") + b"\n"
        else:
            content = json.dumps(clean, indent=2, sort_keys=True).encode("utf-8") + b"\n"
        atomic_write(destination, content)
        if kind == "graph-node":
            merge_graph_index(overlay, clean)
    emit({"ok": True, "record_type": kind, "path": str(destination), "sha256": sha256_file(destination), "writer_role": args.writer_role})
    return 0


def command_guard_git(args: argparse.Namespace) -> int:
    info = repository_info(args.repo)
    contamination = git_contamination(Path(info["repository"]))
    ok = not contamination["tracked"] and not contamination["staged"]
    emit({"ok": ok, **contamination})
    return 0 if ok else 2


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    root.add_argument("--repo", help="repository root or a path within it")
    sub = root.add_subparsers(dest="command", required=True)
    sub.add_parser("init", help="create the local overlay and local Git exclusion").set_defaults(handler=command_init)
    context_parser = sub.add_parser("context", help="show repository/worktree/task context")
    context_parser.add_argument("--task", help="optional task id")
    context_parser.set_defaults(handler=command_context)
    sub.add_parser("validate", help="validate graph files and report selective freshness").set_defaults(handler=command_validate)
    write_parser = sub.add_parser("write", help="write a validated durable record")
    write_parser.add_argument("--record", required=True, help="JSON record to persist")
    write_parser.add_argument("--writer-role", required=True, help="authorized DDT updater role")
    write_parser.add_argument("--expected-hash", help="current destination hash to protect against stale overwrite")
    write_parser.set_defaults(handler=command_write)
    sub.add_parser("guard-git", help="detect tracked or staged .ddt contamination").set_defaults(handler=command_guard_git)
    return root


def main() -> int:
    args = parser().parse_args()
    try:
        return args.handler(args)
    except DDTError as error:
        emit({"ok": False, "reason": str(error)})
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
