# Project Blueprint — Reference

## Standard full-stack repo layout

A monorepo keeps a full-stack project coherent and easy to run:

```
my-app/
  apps/
    api/                 # backend service (see backend-engineer)
    web/                 # frontend app (see frontend-engineer)
  packages/
    shared/              # shared types/contracts between api & web
  infra/                 # Dockerfiles, compose, k8s/terraform (devops-engineer)
  docs/
    adr/                 # architecture decision records
    README.md
  .github/workflows/     # CI/CD
  .env.example
  docker-compose.yml     # one-command local dev
  README.md
```

Single-purpose repos can drop the `apps/` nesting. Keep the same ideas: clear
boundaries, a shared contract layer, infra in the repo, docs alongside code.

## Walking skeleton (do this first)

The thinnest end-to-end slice that runs, before any real features:

1. Backend: one real endpoint (e.g. `GET /health` + one resource `GET /v1/ping`)
   talking to a datastore.
2. Frontend: one page that calls that endpoint and renders the result.
3. Datastore: connected, with one migration.
4. Local dev: `docker compose up` brings the whole thing up.
5. CI: lint + test + build runs green on the empty-ish project.

Once this runs, every feature is added as another vertical slice on a working
system.

## Definition of done (per feature slice)

- [ ] Data model + migration (reversible)
- [ ] API endpoint(s): validated input, correct status codes, authz enforced
- [ ] Business logic in a service layer, not the controller
- [ ] UI wired up with loading / empty / error states, accessible + responsive
- [ ] Tests: happy path + key failure path (unit + integration)
- [ ] No secrets committed; `.env.example` updated if config changed
- [ ] Lint / type-check / build all pass
- [ ] Self-reviewed against the `code-reviewer` checklist

## Definition of done (whole project, before launch)

- [ ] All critical user journeys work end-to-end (covered by a few e2e tests)
- [ ] Security pass done; no known criticals (`security-engineer`)
- [ ] Containerized; CI/CD deploys to staging automatically
- [ ] Production config + secrets externalized; health checks live
- [ ] Basic observability: structured logs + error tracking + key metrics
- [ ] Rollback path exists; migrations backward-compatible
- [ ] README covers setup, run, test, and deploy

## Suggested first-project sequence (copy/paste starter prompts)

Use these in order — each triggers the matching skill:

1. "Design the architecture for <idea>: core use cases are <…>, expected scale is
   <…>, I'd prefer <stack>." → **solution-architect**
2. "Scaffold the repo and a walking skeleton for that design." →
   **project-orchestrator + backend/frontend/devops**
3. "Build the <first feature> as a full vertical slice with tests." →
   **backend + frontend + qa-testing**
4. "Do a security pass on the auth and data access." → **security-engineer**
5. "Set up Docker + CI/CD and a staging deploy." → **devops-engineer**
6. "Review everything before I tag v0.1." → **code-reviewer**

## Enhancing an existing repo — first moves

1. "Read this repo and tell me its stack, structure, and the top pain points."
2. "Give me a prioritized improvement backlog with impact vs. effort."
3. "Start with the highest-impact item as a small, tested, reviewable change."

Keep each change small and green. A series of focused improvements beats one big
risky rewrite.
