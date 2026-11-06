---
name: consistency-guardian
description: >
  This skill should be used to keep naming, contracts, and decisions consistent —
  "keep this consistent", "check consistency across repos", "the frontend and
  backend field names don't match", "are these repos aligned", "does this follow
  our conventions", "check for drift", "align naming", "why is the same thing
  named differently", or when a change might contradict an earlier decision. Also
  runs in the scheduled weekly sweep. Maintains a shared standards hub (conventions,
  contracts, glossary, decisions) and flags cross-repo and over-time drift that
  causes bugs.
---

# Consistency Guardian

Keep a set of related repos coherent over time. Two failure modes cause subtle,
expensive bugs, and this skill exists to prevent both:

- **Cross-repo drift** — interrelated repos name or shape the same thing
  differently (backend returns `user_id`, frontend reads `userId` or `customerId`;
  an enum gains a value in one repo but not the other) → data goes missing or
  mismatches at the boundary.
- **Over-time drift (same repo)** — a new change contradicts an earlier decision
  or convention (an ADR says "IDs are UUIDs" but a new migration uses
  auto-increment; the error envelope silently changes shape) → inconsistency and
  regressions.

The cure is one **source of truth** plus **drift detection**. This skill maintains
the source of truth and checks everything against it.

## The standards hub (source of truth)

A dedicated **standards hub** holds the canonical rules and contracts, referenced
by every repo. Prefer a dedicated folder (e.g. `D:/dev-standards/`). Layout and
templates are in `references/registry-structure.md`. In short:

```
dev-standards/
  conventions.md        # GLOBAL rules for all projects (naming, IDs, errors, style)
  glossary.md           # canonical domain terms — one concept = one name (+ banned aliases)
  contracts/
    <group>.md          # shared API/event/data contracts, SCOPED PER interrelated group
  decisions/            # ADR index — the "why" and the history (drives reversal checks)
  registry.yaml         # maps each repo path -> group + contracts it produces/consumes
```

**Scoping** (matches a multi-parent-folder setup): global conventions and glossary
apply everywhere; **contracts are scoped per interrelated group** (e.g. one file for
the `myrepo` ecosystem, one for the `repository_GD` ecosystem), because cross-repo
APIs only connect within a group. `registry.yaml` records which repo belongs to
which group.

## Job A — Maintain the hub

- When a convention, contract, canonical term, or decision is established (by the
  user, or by `solution-architect`), record it in the hub so it becomes
  enforceable. **Canonicalize:** pick one name per concept and list the rejected
  aliases in the glossary.
- Keep the hub lean and authoritative — it is *rules and contracts*, not prose docs.
- When a contract must change, update the hub first, then propagate to producers and
  consumers in the same pass so they never diverge.

## Job B — Check against the hub

Run these checks on demand, in review, and in the weekly sweep. Full detection
recipes (with `git grep` commands), examples, and severities are in
`references/consistency-checks.md`. Summary:

**Cross-repo**
- **Contract mismatch** — a producer defines field/endpoint/shape X; a consumer
  uses a different name, type, or shape with no mapper. Report both sides.
- **Naming / term drift** — one concept named differently across repos; point to the
  glossary's canonical term.
- **Enum / status drift** — allowed values diverge between repos.

**Over-time (same repo)**
- **Convention violation** — new code breaks a rule in `conventions.md` (case style,
  ID strategy, error envelope, pagination shape).
- **Decision reversal** — current code contradicts an accepted ADR. Flag it and
  point to the ADR. If the change is intentional, **supersede the ADR explicitly**
  (write a new one) rather than letting code and decision silently disagree.
- **Divergent duplication** — the same logic implemented two different ways.

**Detect cheaply:** use each repo's `product-knowledge` map (its data model,
contracts, and glossary) as the index, and compare those against the hub. Only open
code to confirm a suspected mismatch, and `git grep` the specific field/term across
repos. Do not re-scan whole repos.

## Severity & output

Report grouped by severity, most bug-prone first:

- **[Bug-risk / Blocking]** — contract & type mismatches, enum drift, decision
  reversals that change behavior.
- **[Should]** — naming/term drift, convention violations.
- **[Nit]** — cosmetic.

Each finding states: the **canonical rule** (link into the hub), the **divergence**
(`repo:file`), and the **concrete fix** (rename to canonical / add a mapper at the
boundary / supersede the ADR). Offer to apply the safe, mechanical fixes (e.g. a
rename) and to open the boundary mapper where a rename is unsafe.

## Bootstrapping (no hub yet)

1. Create the hub (dedicated folder preferred; else `.dev-dream-team/shared/` in the
   parent folder).
2. **Seed from what already exists — do not impose foreign styles.** Infer
   `conventions.md` from the dominant patterns already in the repos; seed
   `contracts/<group>.md` from the real API boundaries found in the
   `product-knowledge` maps; seed `glossary.md` from recurring domain terms.
3. Where repos genuinely conflict (two names for one concept), surface the conflict
   and let the user pick the canonical one — then record it and list the alias as
   rejected.
4. Fill `registry.yaml` with each repo's path and group.

## How it plugs into the team

- `product-knowledge` maps link their glossary to the hub's canonical terms and
  their contracts to the hub.
- `solution-architect` records new conventions/contracts to the hub and checks each
  new decision against existing ADRs for contradictions.
- `backend-engineer` / `frontend-engineer` treat the hub's contracts and glossary as
  the source of truth for names and types; they never invent local aliases.
- `code-reviewer` runs a consistency pass on every change.
- The weekly scheduled sweep runs the cross-repo and over-time checks across all
  connected repos and reports drift.

Composition contract and required attachments live in `ddt/role-composition.md` and `ddt/attachments.json`.
