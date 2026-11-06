# Product Knowledge — Templates

Use these exact structures so every repo's map is consistent and every skill knows
where to look. Keep entries concise; link by path, never paste source code.

---

## Single-file format — `PRODUCT_KNOWLEDGE.md` (small repos)

```markdown
# Product Knowledge — <repo name>

<!-- dev-dream-team: do not delete the provenance block; it drives incremental refresh -->
> last_refreshed: 2026-07-16
> last_refreshed_sha: a1b2c3d
> generated_by: dev-dream-team/product-knowledge
> coverage: 12 features mapped · 2 flagged stale

## Overview
One paragraph: what the product does, who uses it, the core value.

## Stack & architecture
- Backend: <lang/framework> · Frontend: <framework> · DB: <engine>
- Shape: <modular monolith / services / …>
- Runs via: <docker compose up / … >
- Architecture map (optional Mermaid): entry → services → data → externals

## Data model (source of truth)
Entity → what it represents → key relations. One line each.

## External integrations
Service → purpose → where it's called (file) → auth/secret env var.

## Environment & config
Required env vars and what breaks if each is missing/wrong.

## Features
(One block per active feature — see the Feature Entry schema below.)

## Debugging index
| Symptom (what the user/logs see) | Likely feature/area | Files to check first |
|----------------------------------|---------------------|----------------------|
| 401 on every request after login | Auth / token refresh | `auth/token.ts`, middleware |
| Checkout 500, payment not recorded | Checkout · webhook | `billing/webhook.ts` |

## Glossary
Domain terms, acronyms, and internal names → plain meaning.
```

---

## Feature Entry schema (used in both formats)

```markdown
### <Feature name>
- **Status**: active | experimental | deprecated
- **Purpose**: one line — what the user can do / what it's responsible for.
- **Entry points**: `POST /v1/orders` · UI `app/checkout/page.tsx` · job `SendReceipt`
- **Flow (end-to-end)**:
  1. `orders.controller.ts:create` — validates input
  2. → `orders.service.ts:place` — business rules, stock check
  3. → `orders.repository.ts:insert` — writes `orders`, `order_items` (txn)
  4. → emits `OrderPlaced` → `SendReceipt` job → email provider
- **Data touched**: `orders`, `order_items`, `inventory` (source of truth: `orders`)
- **External calls**: Stripe (charge), SendGrid (receipt)
- **Failure points**:
  - Duplicate orders on retry → missing idempotency key → `orders.controller.ts:42`
  - Receipt not sent → job silently swallows provider error → `jobs/send-receipt.ts`
  - Oversell under load → stock check not in the write txn → `orders.service.ts:place`
- **Tests**: `orders.service.test.ts` (happy + oversell); no test for webhook retry — GAP
```

Aim for ~10–25 lines per feature. The **Failure points** are the highest-value
part — write them from how this code actually breaks, not generic advice.

---

## Folder format — `.dev-dream-team/knowledge/` (large repos / monorepos)

Same content, split for scale and cheaper partial refresh:

```
.dev-dream-team/knowledge/
  index.md            # provenance block + links to every file + per-file last_refreshed
  overview.md         # Overview, Stack & architecture, Data model, Integrations, Env
  features/
    auth.md           # one or more Feature Entry blocks for this domain
    checkout.md
    notifications.md
  debugging-index.md  # the symptom → area → files table, aggregated
```

`index.md` header example:

```markdown
# Knowledge Index — <repo name>
> last_refreshed: 2026-07-16
> last_refreshed_sha: a1b2c3d
> generated_by: dev-dream-team/product-knowledge

| Doc | Covers | last_refreshed | sha |
|-----|--------|----------------|-----|
| overview.md | stack, data, integrations | 2026-07-16 | a1b2c3d |
| features/auth.md | login, sessions, refresh | 2026-07-16 | a1b2c3d |
| features/checkout.md | cart, orders, payment | 2026-06-30 | 9f8e7d6 (stale) |
```

Keep the provenance block machine-readable (the `>` lines) — the refresh algorithm
parses `last_refreshed_sha` from it.
