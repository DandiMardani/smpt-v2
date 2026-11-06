---
name: product-knowledge
description: >
  This skill should be used to build or refresh a repo's "product knowledge" map —
  "map this repo", "generate product knowledge", "document the features end to
  end", "onboard to this codebase", "refresh the knowledge map", "explain how this
  repo works", or during a scheduled knowledge refresh. Produces a standing,
  token-cheap map of active features (entry point → flow → data → failure points)
  that every other dev-dream-team skill reads first to understand the repo and
  locate bugs fast.
---

# Product Knowledge

Build and maintain concise **Product Knowledge** for a repo: durable business
behavior, domain semantics, rationale, and known failure modes. It is canonical
under `.ddt/product-knowledge/` through `update-repository-context`. File location,
topology, and relationships belong to the Repository Graph, not Product Knowledge.

Optimize the map to be **cheap to read and accurate**, not exhaustive. It is an
index and a set of flow-maps, not a copy of the source code.

## When this runs

- **On demand** — the user asks to map/refresh a repo.
- **Scheduled** — a weekly task prepares evidence-backed update candidates when
  durable repository context is in use.
- **Bootstrapped by another skill** — e.g. `project-orchestrator` finds no map and
  generates one before working.

## Canonical location and legacy fallback

Canonical DDT v2 Product Knowledge records live under:

```text
.ddt/product-knowledge/<topic>.json
```

Only `update-repository-context` writes these records. This role prepares concise,
evidence-backed candidates with `summary`, `behavior`, `why`, and provenance.

`PRODUCT_KNOWLEDGE.md` and `.dev-dream-team/knowledge/` are readable migration or
bootstrap sources when `.ddt` is absent or lacks the relevant topic. Do not update
them automatically and do not use them as canonical WHERE/navigation data.

## Mode 1 — Build Product Knowledge candidates (no usable `.ddt` coverage)

1. **Survey the repo.** Read manifests (`package.json`, `pyproject.toml`, `go.mod`,
   `composer.json`, `pubspec.yaml`), the directory tree, entry points (`main`,
   route files, `App`/router, CLI, workers), config, and CI. Identify the stack,
   the architecture shape, and the module/domain boundaries.
2. **Enumerate active features.** A "feature" is a user-visible capability or a
   distinct backend responsibility (e.g. Authentication, Checkout, Notifications,
   Search). Prefer the routing table, menu/nav, and job registry as the feature
   inventory. Exclude dead/commented-out code; mark experimental/deprecated ones.
3. **Trace each feature end-to-end.** For each, follow the real path and record it
   as file:symbol steps:
   - Entry point(s): route/verb, UI page, CLI command, queue/event, cron.
   - Flow: controller/handler → service/domain → data access → response/side effect.
   - Data touched: tables/models/collections; the source of truth.
   - External calls: third-party APIs, other services, queues.
   - **Failure points**: where this feature commonly breaks and the symptom→cause
     mapping (e.g. "500 on checkout → payment webhook not verified → `billing/webhook.ts`").
   - Tests that cover it (or a gap note if none).
4. **Separate the outputs** — prepare Product Knowledge candidates for behavior
   and rationale; send locations, topology, and relations as Graph candidates; send
   repeatable procedures as Playbook candidates.
5. **Attach honest provenance** — record the commit that actually contains each
   cited current-code path. If relevant behavior exists only in staged, unstaged,
   or untracked files, keep it task-local and do not stamp it with `HEAD`.

Keep each feature entry tight (roughly 10–25 lines). Link by path; do not paste
code blocks. If something is uncertain, say so — never invent behavior.

Before proposing coverage, compare the candidate inventory with active routing,
menu, handler, job, or command registries. A route may belong to an existing
domain node, but it must be reachable through that node's paths or relations.
Report uncovered entries separately; do not manufacture one node per route.

When migrating legacy knowledge, retain its source date/SHA and stale status
until each claim is checked against current code. Preserve specific, evidenced
failure notes and unresolved cross-repo mismatches. Drop generic failure claims
that could apply to any application rather than restamping them as current.

## Mode 2 — Incremental refresh (usable `.ddt` knowledge exists)

Do NOT re-scan the whole repo. Only touch what changed:

1. Read the relevant record evidence/provenance to get `last_verified_sha`.
2. Compute changes: `git diff --name-only <last_refreshed_sha>..HEAD` (and
   `git log --oneline <last_refreshed_sha>..HEAD` for context). If git or the SHA
   is unavailable, fall back to files modified since the map's date, or do a full
   build if the map is very stale.
3. Use affected graph nodes to identify relevant Product Knowledge topics. Only
   those topics (plus new behavior) get re-analyzed.
4. Submit only changed Product Knowledge candidates to the updater; leave unrelated
   records untouched. Graph topology updates remain separate.
5. Attach new verification provenance only to claims supported by committed
   current code. Preserve older provenance for untouched or unverified claims.

See `references/refresh-algorithm.md` for the exact steps, git commands, and
staleness rules.

## Quality bar

- **Accurate over complete.** A correct map of the 12 real features beats a padded
  list. Verify flows against code; don't guess.
- **Cheap to read.** Concise entries, path links, no pasted source. A skill should
  grasp a feature from its entry in a few lines.
- **Honest provenance.** Every map states when it was refreshed and against which
  commit, and flags sections that may be stale.
- **Bug-oriented.** The "failure points" notes and the debugging index are the most
  valuable part — invest there. Aim them at how *this* codebase actually breaks.

## Output

After a build/refresh, report which Product Knowledge candidates were prepared,
which graph/playbook candidates were separated out, and any stale or uncovered
areas. Promotion requires the updater workflow and authorized write scope.

## How other skills use the map

Any DDT skill starts with graph index/navigation, then reads only linked Product
Knowledge for behavior or Playbooks for procedure, and verifies against current
code. If legacy knowledge is all that exists, it may bootstrap discovery but does
not become canonical. A discovered durable correction is submitted to the updater,
not edited directly by the executor.

Resolve the bundle from `DDT_BUNDLE_ROOT`, an invoking-skill ancestor, or
`~/plugins/dev-dream-team`; then load `ddt/role-composition.md` and
`ddt/attachments.json`.
