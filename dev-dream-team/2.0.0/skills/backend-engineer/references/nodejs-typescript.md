# Node.js / TypeScript — Senior Defaults

## Stack choices

- **Framework**: NestJS for structured/enterprise apps (DI, modules, decorators);
  Express or Fastify for lightweight services (Fastify preferred for performance
  + built-in schema validation).
- **Language**: TypeScript in `strict` mode, always. No implicit `any`.
- **Runtime**: Node LTS. Use ESM (`"type": "module"`) for new projects.
- **ORM / DB**: Prisma (best DX, type-safe) or Drizzle (SQL-first, lightweight).
  TypeORM only if the repo already uses it.
- **Validation**: Zod (infer types from schemas — single source of truth).
- **Auth**: `jsonwebtoken` + `bcrypt`/`argon2`; Passport only if multi-strategy.
- **Testing**: Vitest (fast) or Jest; Supertest for HTTP; Testcontainers for DB.
- **Tooling**: ESLint + Prettier, `tsx` for dev, `pino` for logging.

## Project layout (feature-based)

```
src/
  modules/
    orders/
      orders.controller.ts   # HTTP layer, thin
      orders.service.ts      # business logic
      orders.repository.ts   # data access
      orders.schema.ts       # Zod schemas + inferred types
      orders.test.ts
  common/
    errors/                  # AppError, error handler
    middleware/              # auth, request-id, rate-limit
    config/                  # env parsing (validated with Zod)
  db/                        # client, migrations
  main.ts
```

## Patterns that matter

**Validated env (fail fast at boot):**
```ts
import { z } from "zod";
const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
});
export const env = Env.parse(process.env); // throws on missing/invalid
```

**Boundary validation + typed handler (Fastify/Express):**
```ts
const CreateOrder = z.object({ items: z.array(z.string()).min(1), note: z.string().optional() });
app.post("/v1/orders", async (req, reply) => {
  const body = CreateOrder.parse(req.body);      // 400 on failure via error handler
  const order = await ordersService.create(req.user.id, body);
  return reply.code(201).send(order);
});
```

**Central async error handling:** wrap handlers so rejected promises hit one
error middleware that maps `AppError` → status code and logs with a request ID.
Never `try/catch` in every controller.

**Async correctness:** always `await` DB and I/O; use `Promise.all` for
independent calls; never fire-and-forget without a `.catch`.

## Checklist

- [ ] `strict: true` in tsconfig, no `any` leaks
- [ ] Zod schema per endpoint, types inferred (not duplicated)
- [ ] Graceful shutdown (SIGTERM → close server + DB pool)
- [ ] `helmet`, CORS configured, rate limiting on public routes
- [ ] Structured logs with `pino`, request-id middleware
- [ ] Prisma migrations committed; no `db push` to shared DBs
