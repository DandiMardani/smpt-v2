---
name: verify-change
description: Verify a scoped engineering change using the cheapest reliable evidence, with explicit handling for flaky, missing, or broken test environments. Use when behavior needs proof.
---

# Verify Change

Use this workflow with the smallest suitable role. Before testing, resolve this workflow's required attachments in `../../ddt/attachments.json`, including the DDT Kernel. Direct invocation does not authorize a broad suite, unrelated investigation, or durable write.

## Establish the proof

State the behavior to prove, acceptance criterion, known flow, preconditions, expected observation, and cheapest sufficient verification. Read a relevant Playbook before reconstructing a known setup or diagnostic procedure.

Use this cost ladder unless stronger evidence is required:

```text
static inspection -> existing targeted test -> unit test -> integration test
-> package/service suite -> E2E -> full repository suite
```

## Reliability gate

Before treating a failure as product evidence, classify it:

- command/setup/environment problem;
- test defect or missing dependency;
- flaky or unreliable oracle;
- implementation defect;
- data/state issue;
- incorrect assumption;
- external dependency failure.

Flaky or absent tests do not consume product-hypothesis failures. If nondeterminism itself is under test, declare a bounded sampling or measurement plan and what result would be persuasive. A single passing flaky test is not sufficient proof of a fix.

After every failure, update the evidence ledger before running another materially different experiment. Stop when the acceptance criteria are established or the remaining uncertainty requires `investigate` or a human decision.

## Bounded adjacent-risk check

After primary acceptance criteria pass, inspect the changed code and the selected
graph neighborhood. Check an adjacent behavior only when there is a plausible
shared dependency, contract, state transition, or material regression surface.
Choose the cheapest sufficient check, record why it was selected, and stop once
that bounded risk is resolved. Do not turn this into unrestricted exploratory QA.
