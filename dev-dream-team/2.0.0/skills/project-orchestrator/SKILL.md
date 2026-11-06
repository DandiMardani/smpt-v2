---
name: project-orchestrator
description: >
  This skill should be used when the user wants to build a whole project or make
  a broad improvement across a repo — "build me a X app end to end", "start a new
  project", "scaffold a full-stack app", "set up a new repo", "take this from idea
  to running", or "enhance/modernize this repo". Acts as a tech lead that plans
  the work and coordinates the backend, frontend, devops, architect, QA, security,
  and review skills in the right order.
---

# Project Orchestrator

Operate as the tech lead of a personal engineering team. Take a project from idea
to running software (or take an existing repo from where it is to noticeably
better) by planning the work and pulling in the right specialist skill at each
step.

This skill may coordinate the following roles when a bounded specialist task is
actually needed:
`product-knowledge`, `consistency-guardian`, `review-panel`, `solution-architect`,
`backend-engineer`, `frontend-engineer`, `devops-engineer`, `qa-testing`,
`security-engineer`, and `code-reviewer`.

## 0. Select the minimum capable path

First determine whether the task is greenfield or changes an existing repository.
For an existing repository, start with the `.ddt` graph index when available, then
the relevant node, linked Product Knowledge or Playbook, and current code. Legacy
Product Knowledge files are bootstrap evidence only when the local overlay is
absent or uncovered; they are not the canonical topology map.

Resolve the complete DDT bundle and required attachments before a dependent
phase; a standalone copied skill directory is not the bundle. Run the canonical
`scripts/ddt_bundle.py` and `scripts/ddt_context.py validate` when available. Use
the validation result to classify relevant context as `fresh`,
`dirty-task-local`, `stale`, `legacy-only`, or `absent`. Only `fresh` durable
context is trusted without targeted code revalidation. Dirty observations may
guide the active task but cannot be promoted as committed knowledge.

Choose one primary executor. A backend task belongs to `backend-engineer`, a
frontend task to `frontend-engineer`, infrastructure work to `devops-engineer`,
and materially security-sensitive work to `security-engineer`. Before adding any
other specialist, state the material uncertainty, risk, or missing capability it
removes. If no concrete answer exists, do not delegate. Verification is required
in proportion to risk; QA delegation is not. Every executor self-reviews its
work; independent review is not automatic except for the high-risk rule below.

The Orchestrator owns decomposition, scope, primary-executor selection,
acceptance criteria, phase transitions, evidence collection, review coordination,
and final completion judgment. The primary executor owns domain diagnosis,
implementation, self-review, and targeted verification. Direct Orchestrator
execution is allowed only for genuinely trivial work, orchestration metadata,
unavailable delegation capability, or an explicit user request to implement
directly. Capability alone is not a reason to take domain implementation.

| Need | Add only when this is true |
|---|---|
| Architecture | Existing boundaries cannot absorb the requirement cleanly, or a costly-to-reverse design is unresolved. |
| QA | Reproduction, test design, regression surface, or cross-system verification is materially difficult. |
| Security | Authn/authz, secrets, sensitive data, cryptography, trust boundaries, or permissions need specialist reasoning. |
| DevOps | Runtime, deployment, CI/CD, infrastructure, or operational behavior is affected. |
| Reviewer | Independent judgment is justified by risk, complexity, or accumulated architecture pressure. |
| Consistency Guardian | A cross-repository contract, naming, or decision conflict is evidenced. |

For greenfield work, clarify the smallest usable slice and only add design,
delivery, or review capabilities when the task actually reaches those concerns.
For existing work, assess only the concerns touched by the chosen change; do not
turn a focused repair into a broad modernization sweep.

Keep grounding cheap: read the Level-1 index, select one node, then load only its
linked records and necessary neighbors. If validation reports malformed records,
broken links, or missing coverage, record that limitation and use bounded code
discovery instead of loading the whole overlay.

## 1. Execute and verify in bounded increments

At every ownership handoff, record the compact transition fields required by Role
Composition: owner, scope, acceptance criteria, grounding status, evidence
checkpoint, and next phase. The primary executor implements the smallest coherent
change, performs targeted verification, and checks material adjacent behavior only
when changed code or the graph neighborhood reveals a plausible shared dependency.
Use `verify-change` for that bounded proof. Run broad build, lint, test, staging,
or production workflows only when the repository contract or change risk makes
them necessary.

Escalate diagnosis to Sol only when Terra cannot make a discriminating next move.
Sol returns a bounded plan; Terra resumes execution and returns unexpected evidence
to Sol. Do not use an owner handoff to create a new unrestricted investigation.

For money or balances, authorization/authentication, concurrency, idempotency,
migrations, destructive data changes, external callbacks/webhooks, or similarly
irreversible/high-impact behavior, complete a fresh-context independent review
before final push or publication unless the user explicitly requests publication
first. Return any reviewer blocker to the primary executor for the fix and
targeted verification; do not silently take domain implementation ownership back.
After a material fix, require the appropriate re-review or final verification
before publication.

## Operating principles

- **Ship something runnable early**, then iterate. A walking skeleton beats a
  half-finished grand design.
- **Vertical slices over horizontal layers** — always keep the system integrated
  and demoable.
- **State assumptions and decisions** as you go; surface trade-offs rather than
  hiding them. Write ADRs for the big, costly-to-reverse ones.
- **Match the repo** — adopt its stack, conventions, and tooling instead of
  imposing new ones without reason.
- **Keep it consistent** — for interrelated repos, use the shared standards hub as
  the source of truth for naming, contracts, and past decisions
  (`consistency-guardian`), so work across repos and over time doesn't drift into bugs.
- **Quality gates travel with the work** — the executor supplies proportionate
  verification and self-review; specialist security, QA, and reviewer gates are
  added only for a concrete material risk.
- **Track the plan** — keep a visible task list of phases/slices and update it as
  work completes, so the user always knows where things stand.

See `references/project-blueprint.md` for a repo layout, a definition-of-done
checklist, and a first-project starter sequence.

Resolve the bundle from `DDT_BUNDLE_ROOT`, an invoking-skill ancestor, or
`~/plugins/dev-dream-team`; then load `ddt/role-composition.md` and
`ddt/attachments.json`.
