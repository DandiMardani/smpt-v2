# Standards Hub — Structure & Templates

The hub is the single source of truth every repo references. Keep it small and
authoritative. Prefer a dedicated folder (e.g. `D:/dev-standards/`); fall back to
`.dev-dream-team/shared/` in the repos' parent folder if a dedicated one isn't
wanted.

```
dev-standards/
  README.md             # what this is + how repos reference it
  conventions.md        # GLOBAL rules (all projects)
  glossary.md           # canonical terms (one concept = one name)
  contracts/
    <group>.md          # shared contracts, one file per interrelated group
  decisions/
    0001-*.md           # ADRs (see solution-architect skill for the template)
    README.md           # ADR index
  registry.yaml         # repo -> group + produces/consumes contracts
```

## registry.yaml — the map of everything

Ties repos to groups and contracts so cross-repo checks know what connects to what.

```yaml
groups:
  myrepo:
    root: D:/myrepo
    repos:
      - path: D:/myrepo/api          # backend
        produces: [myrepo]           # implements the myrepo contract
      - path: D:/myrepo/web          # frontend
        consumes: [myrepo]
      - path: D:/myrepo/mobile
        consumes: [myrepo]
  repository_gd:
    root: D:/repository_GD
    repos:
      - path: D:/repository_GD/service-a
        produces: [repository_gd]
      - path: D:/repository_GD/portal
        consumes: [repository_gd]
conventions: ./conventions.md
glossary: ./glossary.md
```

Each repo can also carry a tiny pointer so it "knows" its hub without the yaml:
a `.dev-dream-team/config.yaml` with `hub: D:/dev-standards` and `group: myrepo`.

## conventions.md — global rules

Rules that apply across every project. Keep each rule one line and unambiguous.

```markdown
# Conventions (global)

## Identifiers
- Primary keys: UUID v4. No auto-increment for externally-visible IDs.
- API field case: snake_case on the wire; map to the language-native case in code.

## API
- Versioned paths: /v1/...  · Plural resource nouns.
- Error envelope: { "error": { "code": string, "message": string, "details"?: any } }
- Timestamps: ISO 8601 UTC, field names end in `_at` (created_at, updated_at).
- Pagination: cursor-based, params `limit` + `cursor`, response `{ data, next }`.

## Code
- Language case styles: TS camelCase, Python snake_case, Go exported PascalCase.
- Env vars: SCREAMING_SNAKE_CASE. Booleans read positively (ENABLE_X, not DISABLE_X).
```

## glossary.md — canonical terms

One concept, one name. List rejected aliases so drift is detectable.

```markdown
# Glossary (canonical terms)

| Concept | Canonical | Rejected aliases | Notes |
|---------|-----------|------------------|-------|
| A paying end-user | `customer` | user, client, account, buyer | `user` = an auth principal only |
| The unique customer key | `customer_id` | userId, custId, clientId | UUID |
| A purchase | `order` | transaction, purchase, cart_order | `transaction` = a payment event |
```

## contracts/&lt;group&gt;.md — shared contracts (scoped per group)

The wire truth between a group's repos: endpoints and payload field names + types.
Producers implement it; consumers read it. This file is what cross-repo checks
compare against.

```markdown
# Contract — myrepo group
> producers: D:/myrepo/api  ·  consumers: D:/myrepo/web, D:/myrepo/mobile
> last_verified: 2026-07-16

## Order
| Field | Type | Notes |
|-------|------|-------|
| id | string (uuid) | |
| customer_id | string (uuid) | FK -> Customer |
| status | enum: pending \| paid \| shipped \| cancelled | keep in sync both sides |
| total_cents | integer | minor units; never float |
| created_at | string (ISO 8601) | |

### POST /v1/orders
- Request: { items: [{ sku: string, qty: int>=1 }], note?: string }
- Response 201: Order
- Errors: 400 validation, 402 payment_failed, 409 duplicate (idempotency-key)
```

When a contract changes: edit this file first, bump `last_verified`, then update the
producer and every consumer in the same pass. Never let one side move alone.
