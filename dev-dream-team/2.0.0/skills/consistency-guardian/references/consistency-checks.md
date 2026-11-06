# Consistency Checks — Catalog & Recipes

Run these against the standards hub. Detect cheaply first (use the `product-knowledge`
maps and `git grep`); open code only to confirm. Report by severity with a concrete
fix.

## Cross-repo checks

### 1. Contract field mismatch (bug-risk)
A producer defines a field; a consumer reads a different name/type/shape.

Detect:
- Take each field in `contracts/<group>.md`. `git grep` the canonical name and its
  known aliases across producer and consumer repos.
- Mismatch if a consumer references an alias, a missing field, or a different type
  (e.g. `total` float vs `total_cents` int) with no mapping layer.

Report:
```
[Bug-risk] Contract mismatch — Order.customer_id
  producer  D:/myrepo/api/orders.serializer.ts  -> "customer_id"
  consumer  D:/myrepo/web/api/orders.ts:31       -> reads "userId" (undefined at runtime)
  Fix: rename consumer to customer_id (canonical), or add an explicit mapper at the
       API boundary. Update contracts/myrepo.md if the canonical name is wrong.
```

### 2. Naming / term drift (should)
Same concept, different names across repos.

Detect: for each glossary row, `git grep` the rejected aliases across all repos in
the group. Any hit outside a mapping layer is drift.

Fix: rename to the canonical term; if a rename is risky (public API), add the alias
to the boundary mapper and schedule the rename.

### 3. Enum / status drift (bug-risk)
Allowed values diverge (backend adds `refunded`; frontend switch doesn't handle it).

Detect: extract the enum from the contract; `git grep` the value set in each repo;
diff the sets. Also flag `switch`/`match` on the enum that lacks a default or misses
a value.

Fix: sync the value set from the contract; add handling for new values; keep a single
enum source (generate or share it) where possible.

## Over-time checks (same repo)

### 4. Convention violation (should)
New code breaks a rule in `conventions.md`.

Detect: for each rule, grep for violations in changed files (e.g. auto-increment PK
when the rule is UUID; `camelCase` JSON keys when the rule is snake_case; error
responses not matching the envelope; timestamp fields not ending in `_at`).

Fix: bring the code to the rule. If the rule itself is wrong/outdated, change the
rule in the hub deliberately (one edit, everyone follows) — don't fork it per repo.

### 5. Decision reversal (bug-risk)
Current code contradicts an accepted ADR.

Detect: read `decisions/` for accepted ADRs with checkable claims (ID strategy,
datastore, sync-vs-async, auth model). Compare against what the changed code does.

Handle:
- If unintentional → flag, point to the ADR, fix the code.
- If intentional → **supersede the ADR**: write a new ADR (`Status: Accepted`,
  `Supersedes ADR-XXXX`), mark the old one `Superseded by ADR-YYYY`. Never leave code
  and an accepted ADR in silent disagreement.

### 6. Divergent duplication (should)
The same logic implemented two different ways (two date formatters, two auth guards).

Detect: look for near-duplicate helpers/utilities with differing behavior across the
diff and the map's key files.

Fix: consolidate to one implementation (extract to a shared module/package); if two
behaviors are genuinely needed, name them distinctly and document why.

## Report format

```
# Consistency report — <scope: group / repo / change>
Checked against: D:/dev-standards (hub)  ·  <N> repos  ·  <date>

## Bug-risk
- <finding: canonical rule -> divergence repo:file -> concrete fix>

## Should
- <finding>

## Nits
- <finding>

## Clean
- <what was verified consistent, briefly>

Next: <the one or two fixes with the highest bug-risk-per-effort>
```

## Guardrails

- Prefer the smallest safe fix: a rename or a boundary mapper over a broad refactor.
- Never silently rename a public/wire field — that itself breaks consumers. Change
  the contract + all sides together, or map at the edge.
- When unsure whether two things are "the same concept," ask rather than merging.
- Keep the sweep bounded: drive it from the maps and `git grep`, not full re-reads,
  so cost stays proportional to the surface being checked.

## Scheduled weekly sweep

After the `product-knowledge` refresh, for the connected repos:
1. Load the hub and `registry.yaml`; determine which groups are present.
2. Run cross-repo checks (1–3) within each present group, and over-time checks (4–6)
   per repo against `conventions.md` and `decisions/`.
3. Emit one consolidated report; list bug-risk items first. Do not auto-apply fixes
   in the scheduled run — report and let the user approve.
