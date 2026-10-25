# Architecture & Plan

## Structure
```
apps/web   Next.js App Router, Tailwind v4, R3F (components/field3d), TanStack Query, Zustand
apps/api   FastAPI: app/{api/v1, models, schemas, services, payments/adapters}, alembic/, tests/
docker-compose.yml  postgres16, redis7, api, web
```

## Key decisions
- **Money & time**: integer minor units (cents) + currency; all timestamps `timestamptz` UTC; business tz Asia/Phnom_Penh applied only for slot generation and display.
- **No double booking**: Postgres `EXCLUDE USING gist (field_id WITH =, tstzrange(start_at,end_at) WITH &&) WHERE status IN ('pending','awaiting_payment','confirmed')` (needs `btree_gist`). Holds are bookings in `awaiting_payment` with `hold_expires_at`; a sweeper moves stale ones to `expired`. The DB is the final arbiter; services map the violation to HTTP 409.
- **Auth**: argon2 password hashing, short-lived JWT access token + rotating refresh token in an httpOnly cookie, RBAC dependency per role.
- **Payments**: `PaymentProvider` adapter interface (create_intent, verify_webhook, refund). Mock provider first; KHQR/Bakong and card adapters later. Webhooks are HMAC-verified and idempotent via unique `(provider, provider_event_id)`.
- **3D**: procedural geometry for 5/7/11-a-side (no asset downloads), canvas-generated markings texture. `Field3DModels` reserves a slot for owner-uploaded GLB. A fallback card is shown when WebGL is absent.
- **i18n**: next-intl (en/km) with Noto Sans Khmer — Phase 2.

## Schema (UUID PKs, created/updated_at, soft delete on users/venues/fields)
users(role) · venues(owner_id, status, city, lat/lng) · fields(venue_id, type, surface, indoor) · field_images · field_3d_models · facilities + venue_facilities · operating_hours(field_id, weekday, open, close) · pricing_rules(field_id, days, time range, price_minor) · availability_exceptions(field_id, range, reason) · bookings(field_id, customer_id, range, status, total_minor, hold_expires_at) · payments(booking_id, provider, status, idempotency_key) · refunds · notifications · reviews · audit_logs(actor, action, entity, diff).

## Implemented decisions (Phase 4)
- Roles are a CHECK-constrained column on `users`, not a separate table. `BookingHolds` is not a separate table: a hold is a booking in `awaiting_payment` with `hold_expires_at`, so one exclusion constraint (`ex_bookings_no_overlap`) guards holds and confirmed bookings together.
- Access token: 15-minute JWT, held in memory by the SPA. Refresh token: opaque, httpOnly SameSite=Lax cookie scoped to `/api/v1/auth`, stored hashed, rotated on every use; replaying a rotated token revokes all of the user's sessions.
- Rate limiting is a Redis fixed window per client IP and fails open if Redis is down. Behind a proxy, configure trusted forwarded headers before relying on it.
- Audit rows are written in the same transaction as the change they describe.

## Implemented decisions (Phase 5)
- **Availability is derived, never stored.** Slots come from weekly `operating_hours`, minus active bookings, minus `availability_exceptions`, on a 30-minute grid. Timed-out holds count as free immediately, before the sweeper runs.
- **Price is computed server-side per 30-minute segment** from the highest-priority matching `pricing_rule` (else the field's base rate), so a booking that crosses a price change is billed fairly. Results are rounded half-up to the cent; the booking stores the total and commission at hold time, so later rule edits don't change existing bookings.
- **Races**: `create_hold` validates, frees stale holds, then inserts inside a savepoint; Postgres's exclusion constraint decides the winner and the loser gets `409 SLOT_TAKEN`. No application-level locking of slots.
- **State machine** (`services/bookings.py::TRANSITIONS`) is the only way status changes. Holds expire lazily on read and via a 30-second sweeper that also completes finished bookings.
- **Cancellation policy**: customers cancel holds any time and confirmed bookings up to 24 h before kick-off; venue owners and admins can cancel any active booking (the customer is notified). Refunds attach in Phase 6.
- Blocking a period (`exceptions`) is refused while live bookings sit in it, so owners must cancel those deliberately.
- Limits: 3 concurrent holds per user, 90 days ahead, 60-240 minute bookings.

## Implemented decisions (Phase 6)
- **Adapters**: `payments/base.py::PaymentProvider` (create_intent, verify_webhook, fetch_status, refund). `payments/registry.py` is the only place a provider is chosen. A real KHQR/Bakong or card adapter implements the same four methods; booking code is unchanged.
- **Mock provider = a separate "bank"**: it has its own ledger table (`mock_provider_charges`), signs webhooks (HMAC-SHA256 over `timestamp.body`, 5-minute tolerance against replay), answers `fetch_status`, and refunds. The app learns outcomes only via webhook or status lookup. The demo "payer" buttons call `/bookings/{id}/payment/simulate`, which settles the ledger and then POSTs a signed webhook to the real endpoint. Refused when `ENV=production`; the app won't boot in production with the mock enabled.
- **Nothing is confirmed on a webhook's say-so**: after the signature check the service calls `fetch_status` and only acts if the provider agrees on state and amount (otherwise `409 UNVERIFIED`, the event isn't recorded, and the provider's retry is processed). A reconciliation pass in the sweeper catches lost webhooks.
- **Idempotency**: `POST /bookings/{id}/pay` requires an `Idempotency-Key` (hashed with the user id). All pay calls lock the booking row first, so same-key replays and concurrent attempts yield one payment; a partial unique index (one `pending` payment per booking) backs this up. Webhooks are deduplicated on `(provider, event_id)`. Refunds are unique per payment, and the provider call carries a deterministic idempotency key.
- **Late money**: a success for a booking that was already expired or cancelled is refunded automatically and never resurrects the booking (the slot may belong to someone else by then).
- **Hold vs payment**: starting a payment extends the hold to at least 5 minutes, capped at 15 minutes from creation, so a payer can't pin a slot by retrying.
- **Refund policy**: customer cancel ≥24 h before start, or any owner/admin cancel, refunds in full to the original method; the booking ends `refunded`. If the provider fails, the booking stays `cancelled`, the refund is `failed`, and an admin can retry (`POST /admin/refunds/{id}/retry`).
- **Pay at venue**: opt-in per venue; confirms immediately with a `pending` payment that the owner marks collected.
- **Not yet**: the charge is created inside the request transaction; a real adapter must pass the idempotency key to the provider so a crash between provider call and commit can't leave an orphan charge. Email/SMS delivery is not implemented; confirmations are in-app notifications plus a printable page.

## Implemented decisions (Phase 7)
- **Analytics are queries, not stored numbers** (`services/analytics.py`): daily series bucket by *Phnom Penh* date (`timezone(tz, start_at)`), not UTC, so a 06:30 local booking lands on the right day. Revenue = `confirmed` + `completed` bookings; cancelled, expired and refunded are excluded. Occupancy = booked minutes ÷ scheduled opening minutes (blocked periods still count as open). "Booked value" includes pay-at-venue not yet collected, and the UI says so.
- **Commission**: the platform default lives in `platform_settings` (falls back to config), with a per-venue override. Both are read when a hold is created and stored on the booking, so changing them never rewrites history. Changes are audited.
- **Role areas**: `/account`, `/owner`, `/admin` share one shell. The shell hides what a role shouldn't see, but it is only UX: every endpoint enforces its own role check (tested).
- **Charts follow the dataviz rules**: one series colour validated against the dark surface (`#0fb06d`: lightness band, chroma, >=3:1), thin capped columns, hairline grid, max labelled, keyboard-navigable tooltip, a Table twin for every chart, a single filter row above the charts, and the previous render dimmed (not blanked) while refetching.
- **Seed**: `python -m app.seed --history` creates ~6 weeks of deterministic demo bookings (priced by the real pricing service) so dashboards aren't empty.

## Phases
1-7 done (setup, design system, 3D, models/auth/APIs, booking engine, payments, dashboards) · 7 dashboards · 8 tests/deploy.
