# Dev Dream Team v2

Dev Dream Team is a modular set of engineering role skills. Version 2 keeps the
useful v1 roles—backend, frontend, QA, security, architecture, review, DevOps,
product knowledge, consistency, and orchestration—but gives them a small shared
boundary and reusable policies instead of copying global rules into every role.

## How a role is composed

```text
role identity
  + mandatory kernel/boundary
  + attached shared policies
  + only the workflow needed now
  + task read/write scope and actual capabilities
= effective behavior
```

`ddt/attachments.json` is the single attachment map. The kernel is mandatory;
task scope can only narrow behavior. Roles are identities, policies are reusable
constraints, and workflows are bounded ways to perform recurring work. This is an
IAM-style design analogy, not a claim that the host supplies independent OS
identities for every skill.

## Key v2 behavior

- `investigate` uses a causal hypothesis, prediction, compact evidence ledger,
  and an information/budget circuit breaker—not a rigid retry count.
- Terra executes and verifies. When diagnosis must escalate, Sol takes ownership
  and returns one bounded plan; the handoff cannot reset an open-ended loop.
- `verify-change` classifies test reliability before treating a failure as product
  evidence and uses the cheapest sufficient proof.
- `review-panel` and `code-reviewer` use bounded, fresh evidence packages rather
  than author conclusions as proof.
- Ponytail treats duplication as a review signal and detects architecture pressure
  without mechanically forcing an abstraction.
- Routing defaults to the smallest capable role and no delegation unless a
  specialist removes a named uncertainty.

## Repository context

Product Knowledge explains **what/why**. The repository graph is a small,
evidence-backed navigation aid for **where/related to what**. Playbooks capture
reusable **how**. Current code remains the source of truth.

Graph consumption starts with its compact Level-1 index, then one selected node,
then only its linked Product Knowledge or Playbook entry when needed. External
nodes hold a repository/boundary pointer rather than a copied foreign graph.

The optional `.ddt/` overlay stays local to a repository through
`.git/info/exclude`; it is not added to tracked `.gitignore`. Only
`update-repository-context` may write supported durable records through
`scripts/ddt_context.py`. The helper uses schemas, field allowlists, redaction,
path containment, provenance/freshness checks, an exclusive lock, expected-hash
protection for replacement, and a Git contamination guard. This is defense in
depth: it does not manufacture filesystem isolation when the host grants a shared
filesystem capability.

For database evidence, use the existing read-only DB MCP capability if present:
inspect schema first, select explicit columns, limit results to 5–10, preserve
environment/schema/base-SHA provenance when cheaply available, and never persist
raw rows or treat evidence as mutation authority. A mismatch with current branch
expectations is evidence of a compatibility problem to investigate.

## Included roles and workflows

Existing role entrypoints stay available: `project-orchestrator`,
`solution-architect`, `backend-engineer`, `frontend-engineer`, `devops-engineer`,
`qa-testing`, `security-engineer`, `code-reviewer`, `consistency-guardian`,
`product-knowledge`, and `review-panel`. The manual `grilling` utility is
retained.

The three new attachable workflows are:

- `investigate`
- `verify-change`
- `update-repository-context`

## Validation and evaluation

Run the deterministic helper tests from the package root:

```text
python -m unittest discover -s tests -v
```

`evals/scenarios.json` contains behavioral/red-team regression cases, while
`evals/gap-registry.json` links each durable rule to its risk and scenario.
These are explicit evaluation specifications; model-run behavioral evaluations
must be recorded separately with their real model, tools, and PASS/FAIL/NOT RUN
result. They are not replaced by a model's self-report.

## Activation boundary

This package is an authored source and does not modify any active generated plugin
cache. Validate and review it before installing from a stable local source. Do not
copy only individual role folders: their shared `ddt/` resources and workflows are
required for v2 composition.
