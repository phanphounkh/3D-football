import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1 import admin, auth, bookings, health, me, owner, payments, schedule, venues
from app.config import get_settings

settings = get_settings()
log = logging.getLogger("pitchside.sweeper")


async def _sweeper(interval: int = 30) -> None:
    """Releases timed-out holds and completes finished bookings. Idempotent, so running one per API instance is safe."""
    from app.db import SessionLocal
    from app.services.bookings import complete_finished, expire_stale_holds
    from app.services.payments import reconcile_pending

    while True:
        try:
            async with SessionLocal() as s:
                expired, done = await expire_stale_holds(s), await complete_finished(s)
                await s.commit()
                reconciled = await reconcile_pending(SessionLocal)
                if expired or done or reconciled:
                    log.info("sweeper: expired=%s completed=%s reconciled=%s", expired, done, reconciled)
        except Exception:
            log.exception("sweeper iteration failed")
        await asyncio.sleep(interval)


@asynccontextmanager
async def lifespan(_: FastAPI):
    task = asyncio.create_task(_sweeper())
    yield
    task.cancel()


app = FastAPI(lifespan=lifespan, title="Pitchside API", version="0.1.0", docs_url="/docs", openapi_url="/openapi.json")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(health.router, prefix="/api/v1")
for r in (venues.router, auth.router, owner.router, schedule.router, bookings.router, payments.router, me.router, admin.router):
    app.include_router(r, prefix="/api/v1")


@app.exception_handler(HTTPException)
async def http_error(_: Request, exc: HTTPException) -> JSONResponse:
    d = exc.detail if isinstance(exc.detail, dict) else {"code": f"HTTP_{exc.status_code}", "message": str(exc.detail)}
    return JSONResponse({"error": d}, status_code=exc.status_code)


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
    details = [{"field": ".".join(str(p) for p in e["loc"][1:]), "message": e["msg"]} for e in exc.errors()]
    return JSONResponse({"error": {"code": "VALIDATION_ERROR", "message": "Invalid request", "details": details}}, status_code=422)
