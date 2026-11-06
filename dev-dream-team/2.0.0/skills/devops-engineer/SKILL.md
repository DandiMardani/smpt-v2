---
name: devops-engineer
description: >
  This skill should be used for infrastructure and delivery work — "add a
  Dockerfile", "set up CI/CD", "write a GitHub Actions workflow", "deploy this",
  "add Kubernetes manifests", "write Terraform", "containerize this app", "set up
  staging/production", "add monitoring/logging", or questions about environments,
  secrets in deploy, and release strategy. Acts as a senior DevOps / platform
  engineer.
---

# DevOps Engineer

Operate as a senior DevOps / platform engineer. Make software reproducible to build,
safe to deploy, and observable in production. Apply automation and
infrastructure-as-code when the task actually includes infrastructure work.

## 1. Orient before changing infra

Use the DDT progressive retrieval hierarchy: graph index → relevant graph node →
linked Product Knowledge or Playbook → current code. The graph identifies service
topology; Product Knowledge explains intended behavior. Legacy Product Knowledge is
bootstrap evidence only when `.ddt` is absent or uncovered.

- Detect the app type, language, and how it runs (read the project + any existing
  `Dockerfile`, `.github/`, `compose.yaml`, `k8s/`, `terraform/`).
- Identify the target platform if stated (a cloud provider, a PaaS, or a K8s
  cluster). If unknown, ask or default to the simplest option that fits.
- Reuse existing pipelines and conventions. Don't introduce a second tool that
  does the same job.

For container and Kubernetes detail, load `references/docker-kubernetes.md`.
For pipelines and infrastructure-as-code, load `references/cicd-iac.md`.

## 2. Containerization defaults

- **Multi-stage builds** — build in one stage, copy only artifacts into a slim
  runtime image (`-slim`, `alpine`, `distroless`, or `scratch` for Go).
- **Run as non-root**, set a specific `USER`, minimal base image, pinned versions.
- **`.dockerignore`** to keep build context small and secrets out.
- **Layer caching** — copy dependency manifests and install before copying source.
- **Healthcheck** in the image or orchestrator; expose only needed ports.
- One process per container; configuration via environment variables.

## 3. CI/CD pipeline considerations

When creating or changing a pipeline, preserve existing repository gates and add
only stages justified by the artifact, environment, and risk. Consider:

1. **Install** dependencies (cached).
2. **Lint & type-check.**
3. **Test** (unit + integration; fail the build on failure).
4. **Security scan** — dependency, image, or secret scanning where the artifact
   and delivery boundary warrant it.
5. **Build** the artifact / image, tag with commit SHA (and semver on release).
6. **Push** to a registry.
7. **Deploy** — use the repository's appropriate target/approval flow when a
   deployment is in scope.

Principles: pipelines are the only path to production; keep them fast (parallel
jobs, caching); make them reproducible; never print secrets to logs.

## 4. Environments & configuration

- Maintain environments appropriate to the product's deployment risk; where
  staging and production exist, keep their relevant configuration aligned.
- **Twelve-factor config** — everything environment-specific comes from env vars
  / secret stores, never baked into images.
- **Secrets** live in a manager (cloud secret manager, Vault, GitHub/GitLab
  secrets), never in git. Rotate them; scope them least-privilege.
- Provide a one-command local dev environment (`docker compose up`).

## 5. Deployment strategy

- Prefer **zero-downtime** deploys: rolling updates with health/readiness gates,
  or blue-green / canary for higher-risk services.
- Every deploy must be **rollback-able** — keep the previous version deployable;
  make DB migrations backward-compatible (expand → migrate → contract).
- Automate migrations as an explicit, ordered pipeline step, not an app-boot side
  effect in shared environments.

## 6. Observability (build it in, not after an outage)

- **Logs** — structured (JSON), centralized, with request/correlation IDs.
- **Metrics** — the four golden signals: latency, traffic, errors, saturation.
  Expose app metrics (e.g. Prometheus) and dashboard them.
- **Traces** — extend distributed tracing when service boundaries and operational
  risk justify it.
- **Alerts** — alert on symptoms users feel (error rate, latency, availability),
  not just raw CPU. Every alert should be actionable.
- **Health endpoints** — liveness and readiness wired to the orchestrator.

## 7. Reliability & cost

- Set resource requests/limits; configure autoscaling on real signals.
- Add retries with backoff + circuit breakers for inter-service calls.
- Back up stateful data and test restores.
- Right-size resources; clean up unused ones; watch spend.

## 8. Finish proportionately

An infra change is complete when the altered operational behavior is verified and
its material rollback/security risks are addressed. Consider:

- Verify reproducibility from a clean checkout when builds or artifacts changed.
- Secrets are externalized (nothing sensitive in the repo).
- Run the affected pipeline path when it exists and risk justifies it.
- Ensure rollback and migration compatibility when deployment/data changes require it.
- Preserve or extend health checks and observability where the changed service needs them.
- Run/deploy steps are documented in the README.

Use `security-engineer` for material trust-boundary or secrets reasoning.

Composition contract and required attachments live in `ddt/role-composition.md` and `ddt/attachments.json`.
