from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "ddt_context.py"


class DDTContextTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.repo = Path(self.temp.name) / "repo"
        self.repo.mkdir()
        self.git("init")
        self.git("config", "user.email", "ddt@example.test")
        self.git("config", "user.name", "DDT Test")
        (self.repo / "src").mkdir()
        (self.repo / "src" / "report.py").write_text("VALUE = 1\n", encoding="utf-8")
        self.git("add", ".")
        self.git("commit", "-m", "initial")

    def tearDown(self) -> None:
        self.temp.cleanup()

    def git(self, *args: str) -> str:
        return subprocess.run(["git", *args], cwd=self.repo, text=True, capture_output=True, check=True).stdout.strip()

    def command(self, *args: str, expected: int = 0) -> dict:
        result = subprocess.run([sys.executable, str(SCRIPT), "--repo", str(self.repo), *args], text=True, capture_output=True)
        self.assertEqual(result.returncode, expected, result.stderr or result.stdout)
        return json.loads(result.stdout)

    def record(self, value: dict) -> Path:
        path = self.repo / "record.json"
        path.write_text(json.dumps(value), encoding="utf-8")
        return path

    def graph_record(self) -> dict:
        return {
            "record_type": "graph-node",
            "schema_version": 1,
            "id": "my-report",
            "scope": "owned",
            "summary": "MY report calculation entry point.",
            "paths": ["src/report.py"],
            "evidence": [{"source": "verified commit", "reference": self.git("rev-parse", "HEAD")}],
            "last_verified_sha": self.git("rev-parse", "HEAD"),
        }

    def test_init_is_idempotent_and_local(self) -> None:
        first = self.command("init")
        second = self.command("init")
        self.assertTrue(first["ok"])
        self.assertFalse(second["exclude_updated"])
        exclude = Path(first["exclude"])
        self.assertEqual(exclude.read_text(encoding="utf-8").count(".ddt/"), 1)
        self.assertTrue((self.repo / ".ddt" / "graph" / "nodes").is_dir())

    def test_graph_freshness_is_selective_and_dirty_aware(self) -> None:
        self.command("init")
        self.command("write", "--writer-role", "update-repository-context", "--record", str(self.record(self.graph_record())))
        index = json.loads((self.repo / ".ddt" / "graph" / "index.json").read_text(encoding="utf-8"))
        self.assertEqual(index["nodes"][0]["id"], "my-report")
        self.assertEqual(index["nodes"][0]["scope"], "owned")
        self.assertEqual(index["nodes"][0]["path_hints"], ["src/report.py"])
        fresh = self.command("validate")
        self.assertEqual(fresh["nodes"][0]["state"], "fresh")
        (self.repo / "src" / "report.py").write_text("VALUE = 2\n", encoding="utf-8")
        stale = self.command("validate")
        self.assertEqual(stale["nodes"][0]["state"], "dirty-task-local")
        self.assertIn("src/report.py", stale["nodes"][0]["changed_paths"])

    def test_writer_rejects_dirty_or_uncommitted_provenance(self) -> None:
        self.command("init")
        (self.repo / "src" / "report.py").write_text("VALUE = 2\n", encoding="utf-8")
        self.command(
            "write", "--writer-role", "update-repository-context",
            "--record", str(self.record(self.graph_record())), expected=2,
        )
        knowledge = {
            "record_type": "knowledge", "schema_version": 1, "id": "reporting",
            "title": "Reporting", "summary": "A report is generated.",
            "behavior": "The report reads the current calculation.", "why": "Verified path.",
            "evidence": [{
                "source": "current-code", "kind": "current-code",
                "reference": "src/report.py", "base_sha": self.git("rev-parse", "HEAD"),
            }],
        }
        self.command(
            "write", "--writer-role", "update-repository-context",
            "--record", str(self.record(knowledge)), expected=2,
        )

    def test_validate_reports_graph_presence_explicitly(self) -> None:
        self.assertEqual(self.command("validate")["graph"], "absent")
        self.command("init")
        self.command("write", "--writer-role", "update-repository-context", "--record", str(self.record(self.graph_record())))
        self.assertEqual(self.command("validate")["graph"], "present")

    def test_writer_redacts_text_and_rejects_path_escape(self) -> None:
        self.command("init")
        knowledge = {
            "record_type": "knowledge",
            "schema_version": 1,
            "id": "vendor-auth",
            "title": "Vendor authentication",
            "summary": "Vendor returned Bearer eyJabc.def.ghi after a refresh attempt.",
            "behavior": "Refresh can return 401.",
            "why": "The development evidence shows an invalid credential response.",
            "evidence": [{"source": "targeted test"}],
        }
        self.command("write", "--writer-role", "update-repository-context", "--record", str(self.record(knowledge)))
        stored = (self.repo / ".ddt" / "product-knowledge" / "vendor-auth.json").read_text(encoding="utf-8")
        self.assertIn("[REDACTED_SECRET]", stored)
        escaped = self.graph_record()
        escaped["paths"] = ["../outside.py"]
        self.command("write", "--writer-role", "update-repository-context", "--record", str(self.record(escaped)), expected=2)
        oversized = dict(knowledge)
        oversized["id"] = "vendor-auth-long"
        oversized["evidence"] = [{"source": "vendor", "excerpt": "x" * 513}]
        self.command("write", "--writer-role", "update-repository-context", "--record", str(self.record(oversized)), expected=2)

    def test_guard_detects_tracked_ddt_content(self) -> None:
        (self.repo / ".ddt").mkdir()
        (self.repo / ".ddt" / "tracked.txt").write_text("user content", encoding="utf-8")
        self.git("add", "-f", ".ddt/tracked.txt")
        guarded = self.command("guard-git", expected=2)
        self.assertFalse(guarded["ok"])
        self.assertEqual(guarded["tracked"], [".ddt/tracked.txt"])

    def test_write_rejects_tracked_overlay_and_stale_replace(self) -> None:
        self.command("init")
        knowledge = {
            "record_type": "knowledge", "schema_version": 1, "id": "reporting",
            "title": "Reporting", "summary": "A report is generated.",
            "behavior": "The report reads the calculation.", "why": "Verified path.",
            "evidence": [{"source": "targeted test"}],
        }
        self.command("write", "--writer-role", "update-repository-context", "--record", str(self.record(knowledge)))
        self.command("write", "--writer-role", "update-repository-context", "--record", str(self.record(knowledge)), expected=2)
        tracked = self.repo / ".ddt" / "manual.txt"
        tracked.write_text("tracked", encoding="utf-8")
        self.git("add", "-f", ".ddt/manual.txt")
        self.command("write", "--writer-role", "update-repository-context", "--record", str(self.record(knowledge)), expected=2)

    def test_graph_edges_and_task_state_are_bound_to_context(self) -> None:
        self.command("init")
        bad_case_edge = self.graph_record()
        bad_case_edge["scope"] = "case_edge"
        self.command("write", "--writer-role", "update-repository-context", "--record", str(self.record(bad_case_edge)), expected=2)
        state = {
            "record_type": "task-state", "schema_version": 1, "task_id": "report-fix",
            "repository": str(self.repo), "worktree": str(self.repo), "branch": "wrong-branch",
            "base_sha": self.git("rev-parse", "HEAD"), "objective": "Fix reporting.", "status": "active",
        }
        self.command("write", "--writer-role", "update-repository-context", "--record", str(self.record(state)), expected=2)

    def test_external_graph_node_requires_a_pointer_without_copying_foreign_context(self) -> None:
        self.command("init")
        external = self.graph_record()
        external.update({
            "id": "billing-service", "scope": "external",
            "paths": [],
            "external_ref": {"repository": "services/billing", "reference": "invoice webhook contract"},
        })
        self.command("write", "--writer-role", "update-repository-context", "--record", str(self.record(external)))
        index = json.loads((self.repo / ".ddt" / "graph" / "index.json").read_text(encoding="utf-8"))
        self.assertEqual(index["nodes"][0]["external_ref"]["repository"], "services/billing")
        self.assertEqual(self.command("validate")["nodes"][0]["state"], "external")
        invalid = self.graph_record()
        invalid["scope"] = "external"
        self.command("write", "--writer-role", "update-repository-context", "--record", str(self.record(invalid)), expected=2)

    def test_validate_reports_broken_knowledge_links(self) -> None:
        self.command("init")
        node = self.graph_record()
        node["knowledge_refs"] = ["missing-report-contract"]
        self.command("write", "--writer-role", "update-repository-context", "--record", str(self.record(node)))
        result = self.command("validate")
        self.assertFalse(result["ok"])
        self.assertEqual(result["nodes"][0]["broken_links"], ["knowledge:missing-report-contract:missing"])

    def test_pressure_and_sol_to_terra_handoff_are_compact_and_bound(self) -> None:
        self.command("init")
        node = self.graph_record()
        node["architecture_pressure"] = {"level": "elevated", "signals": ["Reporting and reconciliation repeatedly changed this node."]}
        self.command("write", "--writer-role", "update-repository-context", "--record", str(self.record(node)))
        index = json.loads((self.repo / ".ddt" / "graph" / "index.json").read_text(encoding="utf-8"))
        self.assertEqual(index["nodes"][0]["architecture_pressure"]["level"], "elevated")
        context = self.command("context")
        state = {
            "record_type": "task-state", "schema_version": 1, "task_id": "report-fix",
            "repository": context["repository"], "worktree": context["worktree"], "branch": context["branch"],
            "base_sha": self.git("rev-parse", "HEAD"), "objective": "Verify report.", "status": "active",
            "reasoning_owner": "sol", "execution_owner": "terra", "handoff_state": "bounded_execution",
        }
        self.command("write", "--writer-role", "update-repository-context", "--record", str(self.record(state)))
        invalid = dict(state)
        invalid["task_id"] = "report-fix-invalid"
        invalid["execution_owner"] = "sol"
        self.command("write", "--writer-role", "update-repository-context", "--record", str(self.record(invalid)), expected=2)


if __name__ == "__main__":
    unittest.main()
