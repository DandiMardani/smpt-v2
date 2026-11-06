# Go — Senior Defaults

## Stack choices

- **Router**: `chi` or the stdlib `net/http` (Go 1.22+ has method-based routing);
  Gin or Fiber if the repo already uses them or wants a batteries-included feel.
- **Go version**: latest stable, modules on. Keep `go.mod` tidy.
- **DB**: `pgx` (Postgres) with `sqlc` (generate type-safe code from SQL) or
  `sqlx`. Avoid heavy ORMs; Go favors explicit SQL. GORM only if required.
- **Migrations**: `golang-migrate` or `goose`.
- **Config**: `env`/`viper` into a validated struct.
- **Validation**: `go-playground/validator` with struct tags.
- **Auth**: `golang-jwt`, `bcrypt` from `x/crypto`.
- **Testing**: stdlib `testing` + `testify` + `httptest`; `testcontainers-go`.
- **Logging**: stdlib `slog` (structured).

## Project layout (standard-ish)

```
cmd/api/main.go            # entrypoint, wiring
internal/
  handler/                 # HTTP handlers (thin)
  service/                 # business logic
  repository/              # data access (sqlc output or queries)
  domain/                  # entities, interfaces
  middleware/              # auth, request-id, recover
  config/                  # env → struct
migrations/
```

`internal/` prevents external import — good default for services.

## Patterns that matter

**Explicit error handling — wrap with context, don't swallow:**
```go
order, err := s.repo.CreateOrder(ctx, input)
if err != nil {
    return nil, fmt.Errorf("create order: %w", err)
}
```
Map domain errors to HTTP status in one place (a helper that inspects
`errors.Is`/sentinel errors).

**Context everywhere:** pass `context.Context` as the first arg through
handler → service → repository. Set timeouts on outbound calls:
```go
ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
defer cancel()
```

**Interfaces at the consumer** for testability:
```go
type OrderRepo interface {
    CreateOrder(ctx context.Context, in CreateOrderInput) (*Order, error)
}
type OrderService struct { repo OrderRepo }
```

**Validated input:**
```go
type CreateOrderReq struct {
    Items []string `json:"items" validate:"required,min=1"`
    Note  string   `json:"note" validate:"max=500"`
}
```

**Graceful shutdown:** listen for SIGTERM, `server.Shutdown(ctx)`, close DB pool.

## Concurrency

- Guard shared state with mutexes or channels; run `go test -race` in CI.
- Use `errgroup` for parallel calls with shared cancellation.
- Never leak goroutines — always have a way for them to exit (context/done).

## Checklist

- [ ] Errors wrapped with `%w`, checked with `errors.Is`/`As`
- [ ] `context.Context` threaded through; timeouts on I/O
- [ ] Repositories behind interfaces; SQL is parameterized (sqlc/pgx)
- [ ] `go vet` and `-race` clean; `gofmt`/`goimports` applied
- [ ] Migrations via golang-migrate/goose, reversible
- [ ] Structured `slog` logging with request IDs
