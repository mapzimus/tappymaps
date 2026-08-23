# Full-app audit — 21 August 2026

Ten agents drove the live app in real browsers across eight domains. **169 findings: 13 P0, 46 P1, 71 P2, 39 P3.** Every finding was reproduced in a browser — anything that could only be inferred is marked `UNVERIFIED (static analysis)` in its report.

> **Note added 2026-08-22 — the Classroom tier is gone.** Several findings below
> concern the $12/mo Classroom tier (class codes, worksheet packs, the
> `classroom_codes` table). That tier was removed from the product entirely on
> 2026-08-22: Tappymaps is not a school tool. Those findings are retained as a
> record of what the audit found, not as a to-do list. There is one paid tier
> now — Pro.

`00-summary.html` is the consolidated report (also published at
https://claude.ai/code/artifact/d04d71d1-00d4-4860-9f91-f06294d28123).

| Report | P0 | P1 | P2 | P3 | Headline |
|---|--:|--:|--:|--:|---|
| `data-maps.md` | 5 | 10 | 9 | 9 | Parser is good; the reporting layer lies about it |
| `monetization.md` | 3 | 6 | 14 | 8 | Serverless layer is solid; the client never asks it anything |
| `a11y-seo-perf.md` | 1 | 8 | 9 | 4 | Fast and leak-free, but unusable by keyboard and unindexable |
| `gallery-embed-mobile.md` | 0 | 7 | 11 | 3 | Usable on a phone, not good on it — geometry, not architecture |
| `create-editor.md` | 2 | 6 | 9 | 3 | Coloring, legends and templates solid; persistence isn't |
| `games.md` | 0 | 2 | 11 | 6 | Genuinely fun; the difficulty ladder is an illusion |
| `export.md` | 2 | 6 | 4 | 2 | Landscape path is excellent; damage is all at the edges |
| `code-health.md` | 0 | 1 | 4 | 4 | Single-file still earns its keep; no TDZ hazards remain |

## The through-line

**This app fails silently.** Across hundreds of probe runs the console was almost
always clean — while sharing was broken for every data map, the signed-in export
tier had never worked, undo destroyed county maps, and saves reported success and
stored nothing. That is why these survived so long.

## P0 status

Fixed and shipped (PR #41, #42):

- `encodeStateToURL` bare `btoa()` — threw on the en dash every data-map legend uses
- `window._supabase` undefined — signed-in free tier could never export
- `max-height: 100%` defeating the export frame for 3 of 4 presets
- html2canvas fallback dead on `color-mix()`
- County undo destroying the map (two stores that never synced)
- No keyboard path to the core task
- Data maps painting stale values under a fresh legend
- CSV import losing rows silently (three distinct paths)

Still open — two are product decisions, one is data correctness:

- Pro/Classroom entitlements are client-side booleans
- Anonymous exports are ungated and unwatermarked
- Mean Commute Time is systematically understated (universe mismatch; 33 of 39
  datasets are trustworthy as-is)

## Corrections made during the audit

Two claims were investigated and **withdrawn** — recorded here so they are not
re-reported later:

- A suspected double-bound quick-fill handler. There are genuinely two chip
  elements (one live in the rail, one in the dormant hidden mobile panel) with a
  single listener each. Quick fill works; the "paints nothing" reading was the
  Pro gate.
- The 744KB payload. It is **174KB gzipped**. The real waste is that 677KB of
  971KB of parsed JS never executes.
