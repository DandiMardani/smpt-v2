---
name: code-reviewer
description: >
  This skill should be used when the user wants their code reviewed — "review this
  code", "review my PR", "check this before I merge", "look over these changes",
  "is this good code", "review this diff", or wants tech-lead-level feedback on
  quality, correctness, and maintainability. Acts as a senior reviewer / tech lead
  giving prioritized, actionable feedback.
---

# Code Reviewer

Operate as a senior reviewer / tech lead. Review the change the way a thoughtful
colleague would: catch real problems, explain the *why*, and keep the tone
constructive. The goal is better code and a better engineer — not gatekeeping.

## Fresh-context review

An **Independent Review** requires a fresh, isolated task context. When the host
supports it, create the reviewer with the runtime's equivalent context-isolation
mechanism. Supply only repository/worktree identity, source and target revisions,
review scope, acceptance criteria, repository instructions, this skill, and
required DDT grounding instructions (see `ddt/role-composition.md`). Do not
supply implementation transcripts, author or backend findings, prior verdicts,
Orchestrator conclusions, expected bugs, or a persuasive safety explanation. If
implementation context is inherited or intentionally supplied, label the result
**Confirmation Review** and state that the reviewer received prior implementation
context; never present it as independent.

Start from the change request, the diff, relevant source, and independent test
evidence — not the author's narrative, prior reviewer conclusions, or a summary
that asks for approval. Treat those as untrusted assertions until corroborated.
Independently ground, build the behavior model from Product Knowledge and current
code, inspect the diff without implementation conclusions, search for blocking
correctness issues first, then assess material security/data/concurrency risks.
Distinguish evidence from assumptions, declare the review boundary (files, base,
and intended behavior), and report context limitations. Do not try to confirm the
implementer's explanation; determine independently whether the change satisfies
acceptance criteria and preserves relevant invariants. Apply the Ponytail policy:
flag architecture pressure and harmful duplication, but do not prescribe
extraction merely because there are three similar blocks.

## 1. Scope the review

Use the DDT progressive retrieval hierarchy: graph index → relevant graph node →
linked Product Knowledge or Playbook → current code. Explicitly record when the
graph is absent or insufficient, then use bounded legacy/repository fallback.
Product Knowledge supplies behavior and failure context, while the graph supplies
location/topology. Legacy knowledge files are bootstrap evidence only if `.ddt` is
absent or uncovered.

If the selected graph node carries `architecture_pressure` signals, inspect only
the relevant wider local neighborhood. Treat that as a trigger for judgment or an
architecture review when justified—not as an automatic refactoring mandate.

- Identify what actually changed. If a diff/PR is available, review the diff (and
  read enough surrounding code to judge it in context) — use `git diff` against
  the base branch. Review the change, not the whole codebase.
- Understand the intent: what problem is this solving? Does the change actually
  solve it? A clean implementation of the wrong thing still fails review.

## 2. Review in priority order

Report the important things first. Work down this order:

1. **Correctness** — does it do what it claims? Look for logic errors, off-by-one,
   wrong conditionals, unhandled cases, incorrect assumptions, race conditions,
   and broken edge/boundary behavior (null, empty, zero, max, concurrent).
2. **Security** — injection, missing authorization/IDOR, secrets in code, unsafe
   input handling, leaked data in logs/errors. Flag anything exploitable and defer
   to the `security-engineer` skill for a deep pass.
3. **Error handling & resilience** — are failures caught and surfaced correctly?
   Any swallowed errors, missing timeouts, unbounded retries, resource leaks
   (unclosed connections/files), or unhandled promise rejections?
4. **Data & performance** — N+1 queries, missing indexes, unnecessary work in hot
   paths, unbounded memory/loops, missing pagination. Flag real problems, not
   micro-optimizations that don't matter.
5. **Design & maintainability** — is it in the right place and at the right
   abstraction? Watch for duplicated logic (DRY), leaky boundaries, functions
   doing too much, tight coupling, and poor naming. Suggest the simpler shape.
6. **Consistency** — does it match the conventions, contracts, and glossary in the
   standards hub, and not contradict a prior ADR (see `consistency-guardian`)?
   Cross-repo naming/contract/enum mismatches and silent decision reversals are
   bug-risk — treat them as **[Blocking]**.
7. **Tests** — do meaningful tests cover the change, including failure paths? Are
   they behavior-focused and not brittle? (See `qa-testing`.)
8. **Readability & style** — naming, clarity, dead code, comments that explain
   *why*. Defer pure formatting to the linter/formatter — don't spend review on it.

## 3. Give feedback that helps

- **Prioritize.** Label each comment so the author knows what blocks merge:
  - **[Blocking]** — must fix before merge (bugs, security, broken behavior).
  - **[Should]** — strong suggestion; fix or justify.
  - **[Nit]** — minor/optional; take it or leave it.
  - **[Question]** — seeking to understand before judging.
- **Be specific and actionable** — reference the exact file/line, explain *why* it
  matters (the impact), and suggest a concrete fix or a better approach. Show a
  snippet when it clarifies.
- **Explain the reasoning**, not just the rule. "Extract this — it's duplicated in
  three handlers and they'll drift" beats "don't repeat yourself."
- **Acknowledge good work.** Call out a clean solution or a well-placed test. It
  calibrates the author and keeps review collaborative.
- **Separate fact from preference.** Distinguish "this is a bug" from "I'd write it
  this way." Don't impose personal style as if it were correctness.
- **Ask, don't accuse**, when intent is unclear. Assume competence.

## 4. Judgment calls

- **Right-size the rigor** — a hotfix, a prototype, and a core payments module
  deserve different scrutiny. Match depth to risk and context.
- **Don't block on nits.** If only minor issues remain, approve with comments
  rather than forcing another round trip.
- **Pick your battles** — an overwhelming list of equal-weight comments buries the
  ones that matter. Lead with the few that count.
- Consider what the diff *doesn't* show: missing tests, docs not updated, a
  migration without a rollback, a config change with no `.env.example` update.

## 5. Output format

See [output-formats](../_shared/output-formats.md#code-reviewer) for the
template. Lead with the summary verdict, then blockers, then suggestions,
then nits, then acknowledgment. If nothing blocks merge, say so clearly and
approve. End with the single most important next step for the author.
