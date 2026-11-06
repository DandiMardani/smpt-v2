---
name: review-panel
description: >
  This skill should be used before committing to a spec, API contract, or design —
  "get the team's take on this spec", "debate this contract before we build",
  "cross-functional review", "brew the spec with the team", "have the panel argue
  this out", "stress-test this design", or when an enhancement's shape is still
  open and multiple perspectives (architecture, backend, frontend, security, QA,
  consistency) would surface conflicts worth resolving before code is written.
  Runs the relevant dev-dream-team role skills as parallel subagents that review
  the same proposal independently, then argue out their disagreements over
  multiple rounds, producing a synthesized verdict: what's agreed, what got
  resolved through debate, and what's still contested and needs a human call.
---

# Review Panel

Run a **multi-perspective debate** over a spec, API contract, or design proposal
before it gets built — not a single reviewer's opinion, but several senior
perspectives independently examining it, then arguing out where they disagree.
This is the highest-leverage moment to catch cross-cutting problems: it's far
cheaper to resolve a disagreement about a field's type or a sync-vs-async call at
the spec stage than after backend and frontend have each built against a different
assumption.

**This is deliberately expensive** (multiple parallel subagents, multiple rounds).
Use it at real decision points — freezing a spec, finalizing an API contract, a
non-trivial architecture choice — not for every small change.

## When to reach for it

- Before an API contract gets written into the standards hub (see
  `consistency-guardian`) or implemented on both sides.
- Before a non-trivial architecture decision gets turned into an ADR.
- When a proposal touches multiple concerns (data shape + UI + security + delivery)
  and a single-skill review would miss the cross-cutting issues.
- When the user explicitly wants the team's perspectives stress-tested against
  each other, not just a checklist.

Not for: routine code review of an already-written diff (use `code-reviewer`);
single-domain questions with an obvious owner (just use that skill directly).

## The panel

Select the smallest panel that can test the disputed assumptions. Start with the
role closest to the decision; add `solution-architect`, `backend-engineer`,
`frontend-engineer`, `security-engineer`, `qa-testing`, `consistency-guardian`,
or `devops-engineer` only when each has a distinct risk to assess. An explicit
cross-functional review may select the full panel, but a missing role is normal
when its surface is absent. State the question each selected role will answer.

## Protocol

Follow `references/debate-protocol.md` for the exact subagent prompts and message
shapes. Summary:

1. **Frame the proposal.** State clearly what is being reviewed (the spec/contract
   text, or a summary of the design) and what decision it's headed toward. If the
   repo has a `product-knowledge` map or the `dev-standards` hub, pull the relevant
   context (existing contracts, conventions, ADRs) and include it — panelists should
   review with real context, not in a vacuum.

2. **Round 1 — independent review (parallel).** Launch one panelist per
   selected role in a single batch (true parallelism — the runtime's equivalent
   of sending multiple subagent calls in one message). Each panelist is told to
   first invoke its matching `dev-dream-team` skill (via the Skill tool or your
   host's skill-loading mechanism) to load that role's standards, then review
   the proposal strictly from that lens, returning: its top concerns, what it
   likes, and specific questions for the other roles. Do not let panelists see
   each other's output yet.

3. **Synthesize round 1.** Collect all findings. Identify genuine **conflicts**
   (two roles want incompatible things — e.g. architect wants async, backend
   defaults to sync for simplicity) versus **non-conflicting concerns** (each
   role flags something the others didn't touch — no debate needed, just merge).

4. **Round 2 — rebuttal (parallel, only for conflicts).** For each real conflict,
   relaunch the involved panelists (or resume their session via your host's
   session-continuation mechanism if the harness supports it), giving each the
   other side's argument verbatim, and ask: concede, hold with a sharper
   justification, or propose a third option. Run this round for all live
   conflicts in one batch.

5. **Repeat if needed, capped.** Run at most 2 rebuttal rounds. If a conflict is
   still unresolved after that, stop — it goes to the user as an open decision.
   Do not spin indefinitely chasing consensus.

6. **Produce the verdict.** Report in three buckets:
   - **Agreed** — no one objected; safe to proceed.
   - **Resolved through debate** — started as a conflict, ended with a clear winner
     or a merged third option; state the reasoning briefly.
   - **Unresolved — needs your call** — state both positions plainly, the trade-off,
     and (if useful) a recommendation, but let the user decide.

7. **Hand off.** If the spec/contract is now settled, offer to write it into the
   standards hub (`consistency-guardian`) and/or an ADR (`solution-architect`) so the
   decision sticks and doesn't get silently reversed later.

## Cost discipline

- Keep round 1 prompts tight: the proposal + relevant context, not the whole repo.
  Point panelists at the `product-knowledge` map instead of having each one re-scan
  the codebase.
- Only re-run panelists who are actually in conflict for round 2+ — don't re-spawn
  everyone every round.
- Two rebuttal rounds is a hard cap. An unresolved conflict after that is a genuine
  judgment call for the user, not a sign to keep debating.

## Output format

See [output-formats](../_shared/output-formats.md#review-panel) for the
verdict template. Three buckets, in this order: agreed, resolved through
debate, then unresolved. If a section is empty, omit it. End by offering to
persist the decision (standards hub, ADR) so it does not get silently
reversed later.

Composition contract and required attachments live in `ddt/role-composition.md` and `ddt/attachments.json`.
