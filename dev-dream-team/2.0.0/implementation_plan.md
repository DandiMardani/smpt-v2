# DDT Knowledge Workflow Hardening

## Objective

Repair the real failures observed while using `project-orchestrator` and the
repository-knowledge workflow in `payrollv2-app`, while keeping progressive
loading cheaper than a repository rescan.

## Observed failures to address

- The active copied skills could not resolve the bundle-level `ddt/` and
  `scripts/ddt_context.py` resources even though the canonical plugin contains
  them.
- A dirty working-tree behavior was stamped with the current HEAD SHA although
  that commit did not contain the behavior.
- Legacy Product Knowledge was compressed and restamped as current without
  re-verifying its claims.
- Cross-repository evidence was stored as free text instead of a navigable
  external graph boundary.
- The generated feature inventory omitted active top-level routes.
- Manual JSON creation bypassed the deterministic writer and produced records
  outside the supported schema.

## Implementation plan

- [x] 1. Make bundle-root resolution explicit and deterministic.
  - Define one portable resolution order for source-plugin and standalone-copy
    installations.
  - Treat an unresolved or ambiguous required attachment as a hard gate.
  - Do not duplicate shared DDT resources into another authored source tree.
- [x] 2. Tighten `project-orchestrator` knowledge consumption.
  - Require a compact trust classification before relying on local knowledge:
    valid/fresh, dirty-task-local, stale, legacy-only, or absent.
  - Load only the selected graph node and linked records after Level-1 routing.
  - Fall back to bounded code discovery when validation or coverage fails.
- [x] 3. Tighten `product-knowledge` candidate generation.
  - Separate committed provenance from dirty observations.
  - Preserve legacy source SHA/date and mark unverified claims stale instead of
    restamping them.
  - Inventory active routes/registries and report uncovered entries without
    forcing one record per route.
  - Preserve high-signal failure knowledge during migration; reject generic,
    unsupported failure claims.
- [x] 4. Harden `update-repository-context` promotion.
  - Require the deterministic helper for supported writes and forbid manual
    fallback JSON when it is unavailable.
  - Reject promotion when claimed SHA does not contain the cited changed paths.
  - Require machine-resolvable external graph nodes for durable cross-repo
    boundaries.
  - Validate linked knowledge references and report coverage gaps separately
    from schema errors.
- [x] 5. Extend deterministic tests and behavioral evals.
  - Add regression coverage for copied-skill bundle resolution, dirty provenance,
    legacy restamping, external boundaries, unresolved knowledge links, and
    route coverage reporting.
  - Preserve existing role-composition, ownership, Ponytail, and no-fanout
    invariants.
- [x] 6. Synchronize the active Codex installation from the canonical source.
  - Update canonical files first, then refresh only the affected active skill
    copies or links.
  - Verify hashes and that attachment/helper resolution works from the active
    invocation path.
- [x] 7. Verify and review.
  - Run `python -m unittest discover -s tests -v` and skill validation.
  - Exercise the knowledge audit against `payrollv2-app` without writing its
    local overlay.
  - Record exact file/byte deltas and bounded context reads; label token numbers
    as estimates unless measured by an available tokenizer.
- [x] 8. Produce `tasks/skill-usage-review.md` for external discussion.
  - Include the observed experience, effectiveness, failure modes, before/after
    workflow, token-cost analysis, trade-offs, unresolved questions, and a
    self-contained review prompt that can be sent to another model.

## Acceptance criteria

- An active Codex skill can resolve and load all required DDT attachments from
  the canonical plugin bundle.
- Dirty behavior cannot be represented as verified by a commit that lacks it.
- Legacy evidence remains visibly legacy until current code verification occurs.
- Durable cross-repo relationships use `external_ref` rather than free text.
- Knowledge validation distinguishes malformed records, stale records, dirty
  records, broken links, and coverage gaps.
- Normal grounded work still uses progressive retrieval and does not load the
  whole Product Knowledge set by default.
- All deterministic tests pass and the discussion review contains no unsupported
  claim that the skill is cheaper or more effective.

## Out of scope

- Editing application implementation in `payrollv2-app` or `payroll-server`.
- Promoting the current ignored `.ddt` overlay as trusted knowledge before it is
  rebuilt through the corrected workflow.
- Introducing a graph database, vector database, daemon, or remote service.

# Backend Engineer Ponytail attachment wiring

## Implementation plan

- [x] Verify the canonical DDT attachment map: `backend-engineer` has Ponytail as a default attachment, but the canonical and active copied skill entrypoints do not instruct the agent to resolve/load it.
- [x] Update the canonical `skills/backend-engineer/SKILL.md` with a compact DDT composition gate: resolve the complete bundle, read the backend-engineer attachment row, load required/default modules before backend reasoning, and explicitly apply the Ponytail policy before introducing mechanisms or abstractions.
- [x] Synchronize that exact entrypoint change to the two active copies used in this environment: `C:\Users\GDhr-Users\.codex\skills\backend-engineer\SKILL.md` and `C:\Users\GDhr-Users\.agents\skills\backend-engineer\SKILL.md`.
- [x] Validate all three skills structurally, verify canonical/active content parity, and run the DDT bundle helper against both active copied skill paths to prove Ponytail resolves through the canonical bundle rather than merely being mentioned in prose.

## Design boundary

The wiring will not copy Ponytail's policy into backend-engineer. It will reference the canonical attachment map and policy so one policy remains authoritative. The backend role will treat Ponytail as a decision gate: use the first sufficient existing/native/local option, preserve explicit correctness requirements, and surface architecture pressure without mandatory extraction solely due to repeated code.
