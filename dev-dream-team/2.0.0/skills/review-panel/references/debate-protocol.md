# Debate Protocol — Prompt Templates & Round Mechanics

Concrete shapes for orchestrating the panel. Subagents (or whatever your
runtime calls them — fresh subagent, isolated session, helper agent) are
stateless per call — they don't share memory with each other or with a prior
round unless you explicitly hand them that context. All "debate" happens
because the moderator (you) carries findings between rounds, not because the
panelists talk directly to each other.

## Round 1 — independent review (parallel launch)

Launch all panelists in a single batch — one subagent/agent call per panelist
in the same message. This is what makes it truly parallel rather than
sequential. Each call uses the same proposal text but a role-specific prompt.

Template per panelist (shape — adapt the field names to your runtime's
subagent/skill mechanism):

```
description: "<Role> review — <proposal short name>"
prompt: |
  You are reviewing a proposal as part of a cross-functional panel, independently —
  you cannot see other panelists' opinions yet.

  First, load the matching dev-dream-team role skill ("<role-skill-name>") using
  your host's skill-loading mechanism. Then review the proposal below strictly
  from that role's perspective.

  ## Proposal being reviewed
  <the spec / contract / design text, or a precise summary>

  ## Relevant context
  <paste the relevant product-knowledge excerpt, standards-hub conventions/contract/
  ADRs, or state "no existing map/hub for this repo yet">

  ## Your task
  1. Your top 2-4 concerns with this proposal from your role's lens (be specific —
     name the field, the endpoint, the flow; not generic advice).
  2. What you think is good about it (briefly).
  3. Any direct questions for the other roles (e.g. "backend: is this write
     idempotent?").

  Keep your response under 300 words. Be concrete and opinionated — this is a review,
  not a summary.
```

Role → skill name mapping: architect → `solution-architect`, backend →
`backend-engineer`, frontend → `frontend-engineer`, security → `security-engineer`,
qa → `qa-testing`, consistency → `consistency-guardian`, devops →
`devops-engineer` (only when included).

## Synthesizing round 1

After all panelists return, the moderator (you, not a subagent) does this pass:

1. List every concern/question, tagged by role.
2. Cluster concerns that are actually the same issue seen from different angles.
3. Mark each cluster as:
   - **Non-conflicting** — only one role raised it, or multiple roles raised the same
     thing and agree on the fix. No debate needed — goes straight to "Agreed" or
     becomes an action item.
   - **Conflicting** — two roles want incompatible things, or one role's proposal
     creates a problem for another (e.g. backend proposes a sync call; architect's
     concern is about latency/coupling; these actually disagree). This needs round 2.

## Round 2 — rebuttal (parallel, per live conflict)

For each conflict, relaunch the involved panelists in one batch (or resume the
prior session if your host's continuation mechanism supports it — e.g. by
session id/name). Give each the other side's actual argument, not a paraphrase.

Template:

```
description: "<Role> rebuttal — <conflict short name>"
prompt: |
  You previously reviewed this proposal as <role> and raised: "<their original point>"

  Another panelist, <other role>, disagrees / raises a conflicting concern:
  "<other role's exact point>"

  ## Proposal (for reference)
  <same proposal text>

  Respond as <role>:
  - Do you concede, hold your position with a sharper justification, or propose a
    third option that satisfies both concerns?
  - Be concrete. If holding, explain the concrete cost of the other side's approach.
  - If proposing a third option, state it precisely enough to implement.

  Keep it under 200 words.
```

If both sides concede toward each other or converge on a third option, the conflict is
**resolved through debate** — record the resolution and the one-line reasoning (not
the full transcript).

If both hold their ground with no new information, run **one more round only** if a
genuinely new argument emerged; otherwise stop and mark it **unresolved**.

## Stopping conditions (avoid runaway cost)

- Hard cap: 2 rebuttal rounds after round 1.
- If a rebuttal round produces no new information (both sides just restate), stop
  immediately — don't spend a third round on it.
- If the proposal is large, batch: run review-panel per section/decision point rather
  than one giant round 1 covering everything at once.

## Example — mini walkthrough

Proposal: "Add a `POST /v1/claims` endpoint; claim processing calls the payout
service synchronously in the request path."

- **architect** (round 1): concerned about coupling — payout service latency/outage
  now blocks claim submission; prefers async via queue + webhook/status poll.
- **backend** (round 1): sync is simpler to implement and debug for v1; worried async
  adds infra (queue, idempotency, retry) before it's proven needed.
- **qa** (round 1): sync makes testing straightforward; async needs more test
  scaffolding (fakes for the queue).
- Moderator: architect vs backend is a genuine conflict (coupling/reliability vs
  delivery speed/simplicity). qa's point is a secondary consideration, not a blocker.

- **Round 2**: backend, given architect's outage-blocks-submission point, proposes a
  third option — keep it synchronous but add a timeout + circuit breaker, with async
  as a documented follow-up once volume justifies it. Architect concedes this is
  acceptable for v1 with the circuit breaker as a hard requirement.

- **Verdict**: *Resolved through debate* — synchronous call for v1, with a timeout +
  circuit breaker required, and an explicit note (ADR candidate) that async is the
  planned evolution once volume/reliability requires it.
