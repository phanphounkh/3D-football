# Pitchside — 3D football field booking (Cambodia)

Monorepo: `apps/web` (Next.js 15, React Three Fiber) · `apps/api` (FastAPI, SQLAlchemy 2, Postgres) · `docker-compose.yml`.

## Run locally
```bash
# infra + API (host port 8001, because :8000 is often taken)
docker compose up -d db redis api
curl localhost:8001/api/v1/health       # {"status":"ok","database":"up"}   docs: http://localhost:8001/docs

# schema + demo data (run once; host DB port is 5432)
cd apps/api && export DATABASE_URL=postgresql+asyncpg://pitchside:pitchside@localhost:5432/pitchside
.venv/bin/alembic upgrade head && .venv/bin/python -m app.seed --history && cd ../..   # --history adds ~6 weeks of demo bookings for the dashboards

# dev logins (seed only, never production): admin@example.com / owner@example.com / customer@example.com, password Pitchside!dev1

# web
cd apps/web && npm install && npm run dev   # http://localhost:3000
```

## Checks
```bash
cd apps/web && npx tsc --noEmit && npm run lint && npm run build
cd apps/api && python -m venv .venv && .venv/bin/pip install -e ".[dev]" && .venv/bin/pytest && .venv/bin/ruff check .
```

See `docs/ARCHITECTURE.md` for the plan, schema and tradeoffs.
