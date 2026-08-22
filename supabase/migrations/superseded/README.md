# Superseded migrations

These three were written on 2026-08-01 but **never applied** to the live
project. Cloud My Maps sync, the public gallery, and the $12/mo Classroom tier
therefore never worked in production — the client queried four tables that did
not exist.

They are kept for history and replaced by `../20260822_schema_v2.sql`, which
creates the same tables with the RLS holes found in the 2026-08-21 audit closed:
class codes are no longer enumerable, minting one requires the Classroom tier,
cloud-sync writes require a subscription, the publish counter is no longer
client-written, and reports are not client-readable.

Do not apply these.
