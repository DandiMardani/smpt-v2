# Architecture Decision Record (ADR)

Store ADRs in the repo under `docs/adr/NNNN-short-title.md`, numbered
sequentially. One decision per file. Keep them short and immutable — if a
decision changes, write a new ADR that supersedes the old one.

## Template

```markdown
# ADR-000N: <Short decision title>

- Status: Proposed | Accepted | Superseded by ADR-XXXX | Deprecated
- Date: YYYY-MM-DD
- Deciders: <names/roles>

## Context

What is the problem or force that requires a decision? Include the relevant
requirements and constraints (load, team, timeline, existing systems). State
facts, not opinions.

## Options considered

1. **Option A** — brief description. Pros / cons.
2. **Option B** — brief description. Pros / cons.
3. **Option C** — brief description. Pros / cons.

## Decision

The option chosen, stated plainly, and the primary reasons it wins given the
context above.

## Consequences

- Positive: what this makes easier or possible.
- Negative / trade-offs: what this makes harder, what we give up.
- Follow-ups: new work, risks to watch, things to revisit later.
```

## Worked example

```markdown
# ADR-0003: Use a modular monolith for v1

- Status: Accepted
- Date: 2026-07-16
- Deciders: Tech Lead, Backend

## Context
Two engineers, 10-week timeline to first launch, expected < 5k daily users at
launch. Team has no Kubernetes/microservices operational experience.

## Options considered
1. Microservices from day one — clean boundaries, independent scaling; but heavy
   ops overhead, slower to build, needs infra the team lacks.
2. Modular monolith — single deployable, module boundaries enforced in code;
   less isolation, scales vertically first.
3. Serverless functions — low ops; but cold starts and local-dev friction for a
   stateful, relational app.

## Decision
Build a modular monolith with clear internal module boundaries (orders, billing,
auth) behind interfaces, deployed as one container.

## Consequences
- Positive: fastest path to launch; simple deploy, debugging, and local dev.
- Negative: all modules scale together; a bad module can affect the whole app.
- Follow-ups: keep modules decoupled so any can be extracted into a service later
  if load or team growth demands it. Revisit after 50k DAU.
```

## When to write one

Write an ADR for decisions that are **significant and costly to reverse**: choice
of primary datastore, monolith vs. services, sync vs. async communication, auth
model, cloud/platform, major framework. Skip ADRs for routine, easily reversible
choices.
