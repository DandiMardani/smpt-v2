---
name: investigate
description: Investigate a software failure through evidence-backed causal hypotheses, bounded experiments, and a concise escalation packet. Use for root-cause diagnosis, not routine implementation or ordinary test execution.
---

# Investigate

Use this workflow with the smallest suitable engineering role. Before acting, resolve this workflow's required attachments in `../../ddt/attachments.json`, including the DDT Kernel. Direct invocation does not bypass role, task scope, or the durable-knowledge write boundary.

## Start state

Write a compact evidence ledger:

```text
OBJECTIVE:
ACCEPTANCE CRITERIA:
CONFIRMED:
ELIMINATED:
CURRENT HYPOTHESIS:
PREDICTED OBSERVATION:
OPEN UNKNOWNS:
NEXT DISCRIMINATING ACTION:
OBSERVATION/ACTION BOUND:
```

Load repository context progressively when it exists. For a cold start, perform bounded read-only discovery and narrow after finding an anchor.

## Circuit breaker

One causal hypothesis may require parameter iterations or repeated samples for an intermittent failure. They remain one hypothesis when the explanation and prediction remain the same.

Reassess after each meaningful result. Escalate when three materially different causal hypotheses are rejected, when there is no discriminating next action, when a declared observation/action bound is exhausted, or when risk requires stronger reasoning earlier.

Escalation transfers diagnosis ownership to Sol while execution remains Terra's
responsibility. Record `reasoning_owner: sol`, `execution_owner: terra`, and
`handoff_state: reasoning_escalated` in task state where available. Send only the
objective, acceptance criteria, evidence ledger, eliminated hypotheses, current
hypothesis, remaining unknowns, relevant files/context, DB evidence if used, and
the reason for escalation. Sol returns one bounded plan; record
`handoff_state: bounded_execution`, hand the plan back to Terra, and have Terra
report unexpected evidence to Sol. Terra does not start a fresh independent
investigation budget, and Sol does not become the default implementation worker.

If the bounded Sol-guided plan yields no new evidence and no justified next action, stop with a concise diagnostic packet for the human developer.

## Durable knowledge

Investigation artifacts are task-local. Do not promote hypotheses, raw output, or unverified topology. Hand off durable, verified facts to `update-repository-context` only when that workflow is selected and its write scope is authorized.
