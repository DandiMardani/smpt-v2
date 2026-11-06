# Knowledge Grounding

Before domain conclusions or mutation, use available context progressively:

1. if present, the local `.ddt/graph/index.json` Level-1 index or a bounded read-only discovery;
2. relevant graph node and necessary neighbors;
3. linked Product Knowledge and Playbook;
4. current code and narrow evidence queries.

Resolve the complete DDT bundle before loading attachments or helpers. A copied
skill folder without the bundle-level `ddt/` and `scripts/` directories is not a
valid attachment root. Use `scripts/ddt_bundle.py`; unresolved or ambiguous roots
block the dependent phase rather than authorizing a manual context substitute.

Product Knowledge explains durable WHAT and WHY. The graph identifies WHERE and related areas. Playbooks explain reusable HOW. Code remains current implementation evidence. The graph is a navigation hint, never behavioral truth.

Do not initialize or refresh the overlay merely to read it. Select a candidate from
the Level-1 index, run `ddt_context.py validate` before relying on an affected
node, then read only that node. Classify it as fresh, dirty-task-local, stale,
legacy-only, or absent. Follow `knowledge_refs` or `playbook_refs` only
when they answer the active question. An `external_ref` identifies a boundary in
another repository; it does not copy that repository's context or authorize access.

Explicitly determine whether `.ddt/graph/index.json` exists. If it does, load only
the relevant Level-1 entry, validated graph neighborhood, and linked Product
Knowledge or Playbook before drawing domain conclusions. If it is absent or does
not cover the active question, record that state and use legacy/repository
discovery as bounded fallback; never silently skip the graph decision. For a known
file typo, minimal relevant grounding is sufficient. For money, auth, concurrency,
idempotency, workers, schedulers, or cross-service state, relevant domain
grounding is mandatory before conclusions or mutation.

For unmapped or vague tasks, bounded read-only discovery is allowed. Once an anchor is found, narrow the search. A stale graph node is selectively revalidated from its tracked paths and provenance; code wins on conflict.

Treat Database MCP as read-only evidence. Query schema or metadata first, select explicit required columns, use a small limit (normally 5–10), truncate long values, and expand only for a stated uncertainty. Prefer structured output—status, code, identifier, timestamp, environment, schema/migration version, base SHA when available, and a bounded excerpt—over raw rows, logs, or payloads. If DB state and current branch expectations conflict, classify a DB/schema compatibility mismatch and investigate it; do not silently privilege either source. Do not use `SELECT *`, DML, DDL, bulk dumps, or equivalent queries as substitute for a hypothesis.
