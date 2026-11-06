# Python — Senior Defaults

## Stack choices

- **Framework**: FastAPI for APIs (async, auto OpenAPI, Pydantic validation);
  Django + DRF when you want batteries-included (admin, ORM, auth) or a larger
  monolith.
- **Python**: 3.11+ with full type hints. Enforce with `mypy` or `pyright`.
- **Packaging**: `pyproject.toml` + `uv` (fast) or Poetry. Pin dependencies.
- **ORM / DB**: SQLAlchemy 2.0 (async) + Alembic migrations for FastAPI;
  Django ORM for Django. `asyncpg`/`psycopg` for Postgres.
- **Validation / settings**: Pydantic v2 + `pydantic-settings`.
- **Auth**: `passlib[bcrypt]` for hashing, `python-jose`/`pyjwt` for JWT,
  OAuth2 password/bearer flows built into FastAPI.
- **Testing**: `pytest` + `pytest-asyncio` + `httpx.AsyncClient`.
- **Tooling**: `ruff` (lint + format), `mypy`.

## Project layout (FastAPI)

```
app/
  api/v1/routers/        # thin route handlers
  services/              # business logic
  repositories/          # data access
  models/                # SQLAlchemy models
  schemas/               # Pydantic request/response
  core/
    config.py            # Settings(BaseSettings)
    security.py          # hashing, JWT
    deps.py              # FastAPI dependencies (db session, current_user)
  db/                    # engine, session, migrations (alembic/)
  main.py
tests/
```

## Patterns that matter

**Settings from env (validated):**
```python
from pydantic_settings import BaseSettings, SettingsConfigDict
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")
    database_url: str
    jwt_secret: str
    environment: str = "development"
settings = Settings()  # raises on missing required vars
```

**Request/response schemas separated from ORM models:**
```python
class OrderCreate(BaseModel):
    items: list[str] = Field(min_length=1)
    note: str | None = None

@router.post("/v1/orders", status_code=201, response_model=OrderRead)
async def create_order(payload: OrderCreate,
                       user: User = Depends(current_user),
                       db: AsyncSession = Depends(get_db)):
    return await orders_service.create(db, user.id, payload)
```

**Dependency injection** for the DB session and current user via `Depends` —
keeps handlers testable and auth centralized.

**Async DB** with SQLAlchemy async session; use `selectinload`/`joinedload` to
avoid N+1; always run through Alembic migrations, never `create_all` in prod.

## Django specifics (if chosen)

- Use DRF serializers for validation, `ViewSet` + routers for CRUD.
- `select_related` / `prefetch_related` to kill N+1.
- Keep business logic in services or model methods, not fat views.
- `python manage.py makemigrations` — review generated SQL before applying.

## Checklist

- [ ] Full type hints; `ruff` + `mypy` clean
- [ ] Pydantic schemas for every request/response; ORM models kept separate
- [ ] Alembic (or Django) migrations committed and reversible
- [ ] Async I/O throughout (no blocking calls in async routes)
- [ ] Passwords hashed with bcrypt/argon2; JWT expiry set
- [ ] `pytest` covers happy + failure path
