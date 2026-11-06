---
name: update-repository-context
description: Maintain local DDT repository context after verified work by updating Product Knowledge, graph navigation data, or Playbooks with evidence and provenance. Use only for durable knowledge maintenance.
---

# Update Repository Context

This is the only DDT workflow that may write durable `.ddt` knowledge. Before
writing, resolve the complete bundle through `scripts/ddt_bundle.py`, load its
`ddt/attachments.json`, confirm an authorized update scope, and use that bundle's
`scripts/ddt_context.py` for supported records. A copied skill folder does not
own the shared resources. If resolution or the helper fails, stop the durable
update; never hand-author replacement JSON. The workflow boundary is not a claim
of OS-level access control.

Locate the resolver through `DDT_BUNDLE_ROOT`, an invoking-skill ancestor, or
`~/plugins/dev-dream-team`; the explicit environment value takes precedence.

## Promote only durable evidence

Promote facts after verified committed work or another explicitly verified
source. The claimed commit must contain every cited current-code path; staged,
unstaged, and untracked observations remain task-local. Legacy evidence retains
its original date/SHA and stale status until current code revalidation. Keep the
layers separate:

- Product Knowledge: durable WHAT and WHY.
- Graph: WHERE to start and evidence-backed relations.
- Playbook: reusable HOW to operate, reproduce, debug, or verify.

Do not persist raw logs, raw database rows, credentials, failed hypotheses, temporary experiments, speculative edges, or generic command history.

## Graph update

Start from explicit ownership, verified merged changes, and direct dependencies. Inspect changed files/symbols and useful nearby references only. Use deterministic facts such as path existence, Git diff, imports, exports, route/decorator references, or changed files where cheap. Semantic edges require cited evidence and are marked `inferred` until corroborated.

Every internal node records paths, evidence, confidence, and verification
provenance. The helper derives compact Level-1 index metadata so consumers can
select a node before loading it. Nodes may link to local `knowledge_refs` and
`playbook_refs`. An external node has no local-path requirement: it requires only
an `external_ref` with the foreign repository identifier and boundary reference.
It is a pointer, not copied foreign context. A case edge includes its trigger. Do
not map the full repository.

Cross-repository contracts that affect durable behavior use an external graph
node plus an evidenced relation. A free-text evidence string naming another repo
does not create a navigable boundary.

After verified changes, retain a compact `architecture_pressure` summary only when
evidence shows responsibility drift or repeated unrelated touches. Use an
interpretable level plus short signals; do not invent a numeric score or retain
raw history. This is a reviewer inspection trigger, never an automatic refactor.

Validate freshness and linked records selectively before reuse. Distinguish
malformed data, broken links, stale committed changes, dirty task-local changes,
and semantic coverage gaps. If current code conflicts with a graph relation,
code wins and the node is marked for targeted refresh.

## Local overlay

Initialize a repository overlay with `ddt_context.py init` when needed. It adds `.ddt/` to the repository-local exclude file and checks for tracked or staged contamination. Do not modify the repository's tracked `.gitignore` for personal DDT memory.
