# Docker & Kubernetes — Reference

## Multi-stage Dockerfile patterns

**Node/TypeScript:**
```dockerfile
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK CMD node -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
```

**Go (tiny final image):**
```dockerfile
FROM golang:1.22 AS build
WORKDIR /src
COPY go.* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /app ./cmd/api

FROM gcr.io/distroless/static-debian12
COPY --from=build /app /app
USER nonroot:nonroot
ENTRYPOINT ["/app"]
```

**Python:** use `python:3.12-slim`, install into a venv in a build stage, copy it
over; run as a non-root user; `PYTHONUNBUFFERED=1`.

**Rules:** pin base versions, `.dockerignore` (node_modules, .git, .env), copy
manifests before source for cache, never `COPY . .` before installing deps, no
secrets in build args that persist in layers.

## docker-compose for local dev

```yaml
services:
  api:
    build: .
    ports: ["3000:3000"]
    env_file: .env
    depends_on:
      db: { condition: service_healthy }
  db:
    image: postgres:16
    environment: { POSTGRES_PASSWORD: dev }
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      retries: 5
    volumes: ["pgdata:/var/lib/postgresql/data"]
volumes: { pgdata: {} }
```

## Kubernetes essentials

A production Deployment needs:

- **Resource requests + limits** (CPU/memory) — required for scheduling + HPA.
- **Liveness + readiness probes** — readiness gates traffic; liveness restarts.
- **Rolling update** strategy with `maxUnavailable`/`maxSurge`.
- **Config via ConfigMap; secrets via Secret** (or external secrets operator).
- **securityContext**: `runAsNonRoot`, drop capabilities, read-only root FS.
- **HPA** for autoscaling on CPU/custom metrics.
- A **Service** and, for HTTP, an **Ingress** (or Gateway API).

```yaml
resources:
  requests: { cpu: "100m", memory: "128Mi" }
  limits:   { cpu: "500m", memory: "256Mi" }
readinessProbe:
  httpGet: { path: /ready, port: 3000 }
  initialDelaySeconds: 5
livenessProbe:
  httpGet: { path: /health, port: 3000 }
  initialDelaySeconds: 10
```

**Packaging:** use Helm or Kustomize to template per-environment values instead of
copy-pasting manifests. Keep manifests in git (GitOps: Argo CD / Flux) as the
source of truth.

## Checklist

- [ ] Multi-stage build, slim/distroless runtime, non-root user
- [ ] `.dockerignore` present; no secrets in image or build args
- [ ] Image scanned (Trivy) in CI; base images pinned
- [ ] K8s: probes, resource limits, securityContext, HPA
- [ ] Config/secrets externalized; templated per environment
