# Superseded migrations

These were written on 2026-08-01 but **never applied** to the live project.
Cloud My Maps sync and the public gallery therefore never worked in production
— the client queried tables that did not exist.

They are kept for history and replaced by `../20260822_schema_v2.sql`, which
creates the same tables with the RLS holes found in the 2026-08-21 audit closed:
cloud-sync writes require a subscription, the publish counter is no longer
client-written, and reports are not client-readable.

The Classroom migration that used to sit here was deleted on 2026-08-22 along
with the tier itself (`../20260822_remove_classroom.sql`). Tappymaps is not a
school product.

Do not apply these.
