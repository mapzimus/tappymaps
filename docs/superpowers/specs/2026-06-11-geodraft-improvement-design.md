# GeoDraft Improvement Design

**Date:** 2026-06-11 · **Status:** Increment 1 SHIPPED with this doc; 2–3 planned
**Sources:** reimagining design §7 · `docs/draft-categories/tappymaps_launch_100.md`
and `tappymaps_master_categories.md` (the May-15 "USB" category lists, recovered
and committed 2026-06-11 — these are THE source §7 pointed at).

## The core finding

The launch-100 is **not a coding task — it's a ~5,000-data-point sourcing
project.** The current 43 categories work because they ride the live Census API.
Most of the launch-100 (Waffle House counts, snowfall, UFO sightings) has **no
API**; each is 50 hand-compiled values of varying defensibility. Triage:

- **Bucket A (~30): live federal API, reliable.** Population, MHI, poverty,
  commute, broadband, GDP… — mostly already covered by the 38 census-derived
  categories. Done, effectively.
- **Bucket B (~15): static encyclopedic facts.** Compile once, verify once,
  never breaks, works with census fully down. ← *Increment 1, shipped.*
- **Bucket C (~55): hard / proprietary / fan-compiled.** Chain-restaurant
  counts, weather normals, UFO sightings, avg height. Ongoing backlog; only add
  where the data is defensible. The master-361 is a wishlist, not a build target.

A high-confidence library is **~50 categories (A+B)**. Engine/feel depth beats
grinding Bucket C: a draft with 50 rock-solid categories + Territory mode + a
smarter AI + a dramatic reveal beats 100 questionable categories.

## Increment 1 — static category bank (SHIPPED in this commit)

Static categories 5 → **12** (total library 43 → **50**). New banks, all
checksum-verified (EV sums to 535 = 538−DC; presidents sum to 45 individuals;
counties + DC = 3,143; coastline = NOAA's 12,383 mi national total):

| id | Source | Pool |
|---|---|---|
| `highpoint` | USGS high points | 50 |
| `mean-elevation` | USGS mean elevation | 50 |
| `counties` | Census county-equivalents | 50 |
| `coastline` | NOAA general coastline | **22 coastal** |
| `electoral-votes` | 2024 Electoral College | 50 |
| `presidents` | presidential birthplaces | **21 states** |
| `national-parks` | NPS units (any part) | **30 states** |

Two engine changes shipped alongside:
- **Pool categories**: banks that omit zero-value states automatically shrink
  `DG.available` (the existing `isFinite` filter); out-of-pool states get
  `.draft-state--out` (dimmed, unclickable) each round — first real use of the
  spec's "eligible state pool" concept.
- **Reveal pacing** (spec §7): item delay is now `240 + i*90` ms — high-impact
  states land fast, low values trickle in.

## Increment 2 — engine depth (next; needs its own plan)

1. **Territory Draft** (§7): 25 picks each, all 50 claimed, no timer; 3–5 hidden
   categories revealed and scored at the end. Biggest missing spec item; reuses
   the existing map/pick/reveal machinery.
2. **Tiered rounds** (§7): rounds 1–2 draw big-pool categories, 3–5 draw scarce/
   obscure ones (pool categories + high-noise census stats are natural tier 2).
3. **AI difficulty knob**: easy/normal/hard scaling the gaussian noise; add the
   §7 personality features (per-category blind spots, overrated picks).
4. **Reveal drama**: totals animate as a counting ticker; clinch burst across
   the map in team color (§7 deferred-decision default).

## Increment 3 — Bucket C backlog (ongoing, data-quality gated)

Add categories one at a time, each with a named source, into the static-bank
pattern. Best near-term candidates (defensible sources exist): snowfall/rainfall
(NOAA normals), tornadoes (NWS), maple syrup & cheese (USDA NASS), breweries
(TTB), minimum wage (DOL), traffic fatalities (NHTSA), UFO sightings (NUFORC —
label as fan-compiled). Skip until a real source is found: avg height, % with
passport, gym memberships, most chain-restaurant counts.
