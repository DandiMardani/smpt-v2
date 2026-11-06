# PHP / Laravel — Senior Defaults

## Stack choices

- **Framework**: Laravel (latest LTS-ish stable). Use its conventions fully —
  fighting the framework is the main source of bad Laravel code.
- **PHP**: 8.2+ with typed properties, enums, readonly, and constructor
  promotion. Declare `strict_types=1`.
- **DB**: Eloquent ORM + migrations. Query Builder for heavy/complex reads.
- **Validation**: Form Request classes (not inline `$request->validate` for
  anything non-trivial).
- **Auth**: Laravel Sanctum (SPA/API tokens) or Passport (full OAuth2).
- **Queues**: Laravel Queues (Redis/database driver) for background work.
- **Testing**: Pest (preferred) or PHPUnit; use `RefreshDatabase`.
- **Tooling**: Laravel Pint (format), Larastan/PHPStan (static analysis).

## Structure (beyond default MVC)

Keep controllers thin. Push logic into:

```
app/
  Http/
    Controllers/         # thin — delegate to actions/services
    Requests/            # Form Request validation
    Resources/           # API Resource transformers (response shape)
  Actions/ or Services/  # business logic (one action per use case)
  Models/                # Eloquent models + relationships
  Jobs/                  # queued work
  Policies/              # authorization
database/migrations/
routes/api.php
```

## Patterns that matter

**Form Request for validation + authorization:**
```php
class StoreOrderRequest extends FormRequest
{
    public function authorize(): bool { return $this->user()->can('create', Order::class); }
    public function rules(): array {
        return ['items' => ['required', 'array', 'min:1'],
                'note'  => ['nullable', 'string', 'max:500']];
    }
}
```

**Thin controller → action:**
```php
public function store(StoreOrderRequest $request, CreateOrder $action): JsonResponse
{
    $order = $action->execute($request->user(), $request->validated());
    return OrderResource::make($order)->response()->setStatusCode(201);
}
```

**API Resources** shape every response — never return raw models (avoids leaking
columns and keeps the contract stable).

**Eloquent performance:** eager-load with `->with(...)` to kill N+1; add indexes
in migrations; use `chunk`/`cursor` for large exports; cache expensive reads with
`Cache::remember`.

**Queues** for email, exports, third-party calls — dispatch a Job, keep the
request fast. Make jobs idempotent and set `$tries`/`backoff`.

## Checklist

- [ ] `declare(strict_types=1)`, typed signatures, enums where sensible
- [ ] Validation in Form Requests; authorization via Policies/Gates
- [ ] Responses via API Resources; no raw model leaks
- [ ] Migrations for every schema change; indexes on filtered columns
- [ ] N+1 checked (Laravel Debugbar / `preventLazyLoading` in dev)
- [ ] Pint + PHPStan (Larastan) pass; Pest covers happy + failure path
- [ ] Heavy work offloaded to queued Jobs
