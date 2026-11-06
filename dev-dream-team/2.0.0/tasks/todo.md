# DDT v2 Agnostic Refactor — Execution Todo

**Plan:** `C:\Users\GDhr-Users\.claude\plans\clever-stirring-rabbit.md`
**Plugin root:** `C:\Users\GDhr-Users\plugins\dev-dream-team`
**Mode:** follow approved plan, in dependency-safe order. Test baseline green as of session start.

## Critical preservation rules

1. `tests/test_ddt_structure.py:25` — every role SKILL.md MUST contain literal `"role-composition.md"` (11 files). Use footnote mechanism after preamble removal.
2. `tests/test_ddt_structure.py:31` — every workflow SKILL.md MUST contain literal `"attachments.json"` (3 files). Same footnote mechanism.
3. `tests/test_ddt_structure.py:20` — every path in `attachments["modules"]` must exist on disk. `grill-me/` is NOT registered, safe to delete.
4. `scripts/ddt_context.py` enum invariant: `owners = {"terra", "sol"}` must remain. Do not edit script.

## Execution order

### Phase 0 — Scaffold

- [x] Confirm baseline tests green (test_ddt_structure, test_ddt_context)
- [x] Create `tasks/todo.md` with checkable items
- [x] Create `tasks/lessons.md` (empty stub, ready for corrections)

### Phase 1 — Create new files

- [x] Create `runtime-adapters/claude/model-routing.yaml`
- [x] Create `skills/_shared/output-formats.md`
- [x] Extract 3 output-format sections into the shared file (templates, headers)

### Phase 2 — Delete stubs and Claude-specific content

- [x] Delete `skills/grill-me/` (whole folder)
- [x] Delete `skills/grilling/agents/openai.yaml`
- [x] Verify both gone; rerun test_ddt_structure

### Phase 3 — Frontmatter boilerplate removal (13 files)

Remove `metadata.version: "2.0.0"` and `metadata.role: "..."` block.

- [x] backend-engineer/SKILL.md
- [x] code-reviewer/SKILL.md
- [x] consistency-guardian/SKILL.md
- [x] devops-engineer/SKILL.md
- [x] frontend-engineer/SKILL.md
- [x] grilling/SKILL.md
- [x] product-knowledge/SKILL.md
- [x] project-orchestrator/SKILL.md
- [x] qa-testing/SKILL.md
- [x] review-panel/SKILL.md
- [x] security-engineer/SKILL.md
- [x] solution-architect/SKILL.md

### Phase 4 — Role framing "Act as" → "Operate as" (8 files)

- [x] backend-engineer/SKILL.md (1 occurrence — plan said 2, but actual was 1)
- [x] code-reviewer/SKILL.md (1 occurrence — plan said 2, but actual was 1)
- [x] frontend-engineer/SKILL.md (1)
- [x] devops-engineer/SKILL.md (1)
- [x] qa-testing/SKILL.md (1)
- [x] security-engineer/SKILL.md (1)
- [x] solution-architect/SKILL.md (1)
- [x] project-orchestrator/SKILL.md (1)

### Phase 5 — Remove "DDT v2 composition" preamble (11 files)

Remove the preamble block, but PRESERVE literal `"role-composition.md"` via
footnote sentence.

- [x] backend-engineer/SKILL.md
- [x] code-reviewer/SKILL.md (restored as host-agnostic Fresh-context review section)
- [x] consistency-guardian/SKILL.md
- [x] devops-engineer/SKILL.md
- [x] frontend-engineer/SKILL.md
- [x] product-knowledge/SKILL.md
- [x] project-orchestrator/SKILL.md
- [x] qa-testing/SKILL.md
- [x] review-panel/SKILL.md
- [x] security-engineer/SKILL.md
- [x] solution-architect/SKILL.md

### Phase 6 — Remove progressive-retrieval reminder (9 files)

The progressive-retrieval reminder was embedded inside the same preamble
blocks as Phase 5; removing those preambles (lines beginning with
"Use the DDT progressive retrieval hierarchy") satisfied this phase as well.
Files cleaned: backend-engineer, code-reviewer, consistency-guardian,
devops-engineer, frontend-engineer, product-knowledge, project-orchestrator,
review-panel, solution-architect.

### Phase 7 — Workflow footnote preservation (3 files)

The 3 workflow SKILL.md files (`investigate`, `verify-change`,
`update-repository-context`) already contain the literal `"attachments.json"`
in their body. Test requirement satisfied without edits.

### Phase 8 — Strip Claude-Code-specific tooling language

- [x] code-reviewer/SKILL.md (fork_turns → "runtime's equivalent context-isolation mechanism")
- [x] review-panel/SKILL.md (Agent tool / SendMessage → host-agnostic phrasing)
- [x] review-panel/references/debate-protocol.md (Agent tool / subagent-by-id → host-agnostic)
- [x] investigate/SKILL.md — Sol/Terra labels preserved (canonical §40)

### Phase 9 — Extract output-format templates

- [x] code-reviewer/SKILL.md → reference shared output-formats.md
- [x] review-panel/SKILL.md → reference shared output-formats.md
- [x] security-engineer/SKILL.md → reference shared output-formats.md

### Phase 10 — Update docs and external config

- [x] README.md line 70 (grill-me mention removed)
- [x] `.codex/config.toml` lines 154–156 (path → plugin)

### Phase 11 — Delete mirror at `.agents/`

- [x] `C:\Users\GDhr-Users\.agents\skills\` deleted
- [x] `C:\Users\GDhr-Users\.agents\ddt\` deleted
- [x] `C:\Users\GDhr-Users\.agents\scripts\` deleted
- [x] `C:\Users\GDhr-Users\.agents\plugins\` deleted (contained marketplace.json)
- [x] `backups/dev-dream-team-v1-20260916/` preserved
- [x] `tasks/` preserved

### Phase 12 — Verification

- [x] `python -m unittest tests.test_ddt_structure -v` — 4/4 OK
- [x] `python -m unittest tests.test_ddt_context -v` — 9/9 OK
- [x] grep scan 1: `metadata.version|metadata.role` in skills/ → no output
- [x] grep scan 2: `Agent tool|fork_turns|SendMessage` → no output
- [x] grep scan 3: `Act as` → no output
- [x] grep scan 4: `DDT v2 composition` → no output
- [x] grep scan 5: literal `"role-composition.md"` present in all 11 role SKILL.md
- [x] grep scan 6: literal `"attachments.json"` present in all 3 workflow SKILL.md
- [x] ls `skills/grill-me` → no such file
- [x] ls `skills/grilling/agents` → no such file
- [x] cat `runtime-adapters/claude/model-routing.yaml` → valid yaml
- [x] ls `.agents/{skills,ddt,scripts}` → no such file

### Phase 13 — Final review

- [x] Mark all phases complete
- [x] Update lessons.md with new patterns
- [ ] Commit if requested by user

## Review

**Outcome:** All 13 phases complete. Plugin is host-agnostic at the skill layer; tier→model binding lives in `runtime-adapters/claude/model-routing.yaml`. Mirror at `.agents/` deleted with no backup (existing `backups/dev-dream-team-v1-20260916/` covers history).

**Test status:** 13/13 tests pass (4 structure + 9 context). No regression.

**Token efficiency:**
- Removed `metadata.version` + `metadata.role` block from 12 SKILL.md files (saves ~36 lines total)
- Removed redundant "DDT v2 composition" preamble from 11 SKILL.md files (saves ~110 lines total)
- Removed redundant progressive-retrieval reminder from 9 SKILL.md files (saves ~36 lines total, embedded in preambles)
- Replaced "Act as a senior X" with "Operate as a senior X" in 8 files (no token savings; behavioral/voice change only)
- Stripped Claude-Code-specific primitives (`Agent tool`, `fork_turns`, `SendMessage`) from code-reviewer, review-panel, and debate-protocol.md
- Centralized 3 output-format templates into `skills/_shared/output-formats.md`

**Structural changes:**
- Added `runtime-adapters/claude/model-routing.yaml` (placeholder for user to fill in tier→model mapping)
- Added `skills/_shared/output-formats.md` (extracted templates)
- Deleted `skills/grill-me/` (pure alias for `grilling`, per user decision)
- Deleted `skills/grilling/agents/openai.yaml` (model binding belongs in runtime adapter, not skill tree)
- Deleted `C:\Users\GDhr-Users\.agents\{skills,ddt,scripts,plugins}` (mirror, redundant)

**Preserved:**
- All 11 role SKILL.md files contain literal `"role-composition.md"` (test invariant)
- All 3 workflow SKILL.md files contain literal `"attachments.json"` (test invariant)
- Orchestrator keeps "Choose one primary executor." (test invariant)
- Verifier keeps "Bounded adjacent-risk check" (test invariant)
- Updater keeps "architecture_pressure" (test invariant)
- Orchestrator does NOT contain "Use `code-reviewer` on each increment." or "Phase 7 — Review" (test invariant)
- Sol/Terra ownership labels preserved in investigate (canonical §40)
- DDT Core (`ddt/` kernel, policies, workflows, schemas) untouched
- `scripts/ddt_context.py` enum invariant (`owners = {"terra", "sol"}`) untouched
- Dual manifests (`.claude-plugin/`, `.codex-plugin/`) preserved

## 2026-09-21 - Knowledge workflow hardening

Plan: `implementation_plan.md`

- [x] Await explicit approval of the implementation plan.
- [x] Implement bundle-root resolution and knowledge trust classification.
- [x] Harden candidate generation and durable promotion rules.
- [x] Add deterministic tests and behavioral eval coverage.
- [x] Synchronize and verify the active Codex skill installation.
- [x] Produce the external discussion review with token-cost analysis.

Review: completed. Full deterministic suite passed 16/16; three skill validators
passed; source and active skill hashes match. The payroll overlay audit correctly
rejects the previous manually authored schema version and made no application
code changes.

---

## Notes / decisions

- Plan chosen: `Hapus mirror, aktif saja yang jadi satu-satunya`
- Test preservation: `Pindahkan string ke footnote`
- Host adapter location: `runtime-adapters/claude/`
- Sol/Terra labels preserved per canonical doc §40
- Scripts (`ddt_context.py`) unchanged; vendor-neutral already
- Code-reviewer fresh-context review content restored as host-agnostic `## Fresh-context review` section (Independent vs Confirmation Review contract preserved)
- The `description: >` folded YAML scalar pattern caused description-block deletions during Phase 3 frontmatter work; documented in lessons.md
