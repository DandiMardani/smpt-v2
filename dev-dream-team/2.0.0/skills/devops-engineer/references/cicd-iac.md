# CI/CD & Infrastructure-as-Code — Reference

## GitHub Actions — reference pipeline

```yaml
name: ci
on:
  push: { branches: [main] }
  pull_request:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test -- --coverage
      - name: Audit dependencies
        run: npm audit --audit-level=high
      - name: Scan filesystem
        uses: aquasecurity/trivy-action@master
        with: { scan-type: fs, severity: HIGH,CRITICAL, exit-code: 1 }
  deploy:
    needs: build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production        # gate with required reviewers
    steps:
      - uses: actions/checkout@v4
      - run: echo "build + push image, then deploy"
```

**Principles:** cache dependencies; run independent jobs in parallel; tag images
with `${{ github.sha }}`; use `environment` protection rules for prod approval;
store credentials in repo/organization secrets or OIDC (prefer OIDC over
long-lived cloud keys). The same shape maps to GitLab CI (`stages`), CircleCI, or
Jenkins.

## Deployment strategies

- **Rolling** — default; replace instances gradually behind readiness probes.
- **Blue-green** — deploy v2 alongside v1, switch traffic atomically, roll back by
  switching back. Good for risky releases.
- **Canary** — route a small % of traffic to v2, watch metrics, ramp up. Best with
  good observability.

Always keep DB migrations backward-compatible so old and new versions run
simultaneously during the rollout (expand → migrate → contract).

## Infrastructure-as-Code (Terraform)

- **State**: remote backend (S3+DynamoDB lock, GCS, or Terraform Cloud). Never
  commit state or `.tfvars` with secrets.
- **Structure**: reusable `modules/`, per-env `environments/{staging,prod}` with
  their own vars. Keep prod and staging modules identical.
- **Workflow**: `fmt` → `validate` → `plan` (review!) → `apply`. Run `plan` on PRs,
  `apply` on merge with approval.
- **Secrets**: pull from a secret manager / env, never hardcode.
- Pin provider and module versions. Tag resources (owner, env, cost-center).

```hcl
terraform {
  required_version = "~> 1.7"
  backend "s3" { bucket = "tf-state"; key = "prod/app"; region = "us-east-1"; dynamodb_table = "tf-lock" }
}
module "api" {
  source      = "../../modules/service"
  environment = "production"
  image_tag   = var.image_tag
}
```

Alternatives: Pulumi (real languages), CDK, or cloud-native (Bicep). Same rules:
version control, remote state, plan-before-apply, no secrets in code.

## Checklist

- [ ] Pipeline: install → lint → typecheck → test → scan → build → deploy
- [ ] Dependencies cached; jobs parallelized; images tagged by SHA
- [ ] Prod deploy gated by approval or tag; secrets via OIDC/secret store
- [ ] IaC state remote + locked; plan reviewed before apply
- [ ] Migrations backward-compatible; rollback path verified
