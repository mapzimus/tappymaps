# Tappymaps — Data Maps / CSV Import / Colour Ramps / County View audit
Audited 2026-08-21 against `/home/user/tappymaps/index.html` (15,809 lines) at working-tree HEAD, driven live in Chromium via Playwright against the local dev server (`http://127.0.0.1:8123`) with `/api/census` intercepted by a purpose-built ACS payload synthesiser (`work/data/censusstub.mjs`) that returns correctly-shaped rows keyed on the real requested variable codes. Every finding below was reproduced in the browser unless marked UNVERIFIED.

## Verdict

The data plumbing is better than I expected — all 39 datasets load, all 28 templates load, the state resolver is genuinely good, county topology is cached correctly, XSS is properly defended, the session cache is keyed correctly and is shared with the games, and the storage-quota path degrades gracefully. Zero console errors across ~150 dataset/template/CSV loads.

But the feature is not trustworthy as shipped, for three independent reasons:

1. **Every Census data map, every colour-ramp legend, and every numeric CSV import produces a map that cannot be shared, saved, embedded, or survive a page refresh.** The legend labels contain a U+2013 EN DASH; `encodeStateToURL()` is a bare `btoa(JSON.stringify(...))`, which throws `InvalidCharacterError` on any codepoint > 255. The URL hash is never written, Share/Embed/Save-to-My-Maps all throw, and the user is told nothing. This is one line of code and it silently disables the entire distribution surface for the entire Pro data feature set.
2. **One dataset displays a number that is simply wrong, and wrong by a state-varying amount that re-orders the map.** `commute_time` divides aggregate travel time (universe: workers who did **not** work from home) by *all* workers (universe includes WFH). With real 2023 inputs the app reports Colorado at 19.0 min against a true 25.0, and inverts the true ordering of Colorado / Washington / Mississippi. Three more datasets (`poverty`, `disability`, `unemployment`) use a denominator whose universe doesn't match the numerator's, biasing each by 2–4% relative.
3. **The CSV importer loses data silently and then tells the user "All rows matched."** (Measured in the second run: three separate inputs — a headerless paste, non-numeric values, and accounting-style negatives — each paint fewer states than the status line claims, and each append the words *"All rows matched."*) Headerless pastes drop the first data row; non-numeric values are dropped but counted as coloured; category imports past 12 categories reuse palette colours while the legend caps at 12, so a state is painted the exact colour the legend attributes to a *different* category.

Counts after the second (verification) run: **6 P0, 11 P1, 12 P2, 8 P3** — 37 findings.
Changes made by the second run: the stale-colour finding was **upgraded P1 → P0** (a partial Census
response does not merely leave holes, it paints 45 states with the previous dataset's values under
the new dataset's legend — see Addition 3); a **new P1** was found (county colours live in two
stores that never sync, so undo desyncs the map from its own data — Addition 8); two **new P2**s
were added (degenerate legend buckets, equal-interval classification); and dataset `pop_under18`
was reclassified **OK → P2**.

Of the 39 datasets I would ship **33** as-is, hold **5** for a denominator/methodology fix (`poverty`, `disability`, `unemployment`, `pop_under18`, `income_growth_13_23`), and pull **1** (`commute_time`) until fixed. **Every ACS variable code in the file is real, current, and correctly identifies the concept its label claims** — the expansion-wave comment ("every variable verified against the live ACS 2023 registry") is honest. All 51 geographies clear the ACS 1-year 65k threshold, so no state silently drops out for that reason.

---

## Verification pass (independent second run, 2026-08-21)

The findings below this section were produced by a first audit run. A second run re-derived
them from source and re-drove them in Chromium. **Result: the report is accurate.** Every P0 was
independently reproduced; nothing in it was found to be fabricated or overstated. **2 corrections**
and **10 additions** are recorded here; the sections below are otherwise confirmed as written.

**Scope caveat on numbers.** `/api/census` in this environment is stubbed — the dev server returns a
placeholder payload, and both runs replaced it with a synthesiser that echoes the real requested
variable codes. That is sufficient to judge plumbing, formatting, ramps, legends, error handling and
classification, all of which are verified live below. It is **not** sufficient to verify a *value*
against the real ACS. So: every claim about **which variable is divided by which** is verified from
source and is solid; the specific real-world figures quoted for `commute_time` (Colorado 19.0 vs a
true 25.0) are the first run's own arithmetic from published ACS inputs and were **not** re-derived
from a live Census call here. The *direction and mechanism* of that error are independently confirmed
and are not in doubt: dividing by all workers instead of non-WFH workers understates every state by
its work-from-home share (~13.8% nationally, far higher in states like Colorado), which is exactly
why it re-orders the map rather than shifting it uniformly.

**Independently re-confirmed from source (`index.html`) and live:**

| Claim | Status | Independent evidence |
|---|---|---|
| `encodeStateToURL` is a bare `btoa(JSON.stringify(...))` | **CONFIRMED** | `index.html:11169-11179` — no UTF-8 escaping |
| Every data-map legend label contains U+2013 | **CONFIRMED** | `applyDataMap`, `index.html:13543-13549` — all six format branches build `' – '` |
| Loading a dataset writes no URL hash and breaks Share/Embed | **CONFIRMED live** | After `executeDataMapLoad('population')` + 1.6 s debounce: `location.hash.length === 0`; `encodeStateToURL()` → `InvalidCharacterError`; `copyShareLink()` **THREW**; `copyEmbedLink()` **THREW`; two `pageerror`s captured. Control with an ASCII-only legend encodes fine (1,708 chars). |
| `commute_time` divides by the wrong universe | **CONFIRMED** | `B08136` universe = workers who did **not** work from home; `B08301_001E` = **all** workers incl. `_021E` "Worked from home". Correct denominator is `B08301_001E − B08301_021E` (or `B08134_001E`). |
| `poverty` / `disability` / `unemployment` denominators | **CONFIRMED** | `B17001_002E ÷ B01003_001E` (should be `B17001_001E`); `B18101 ÷ B01003_001E` (should be `B18101_001E`); `B23025_005E ÷ B23025_002E` — `_002E` is "In labor force" incl. Armed Forces, so the label "Civilian labor force unemployment rate" is wrong; should be `_003E`. |
| Headerless paste drops the first data row | **CONFIRMED** | `parseAndApplyCSV` row loop is `for (let i = 1; ...)` unconditionally (`index.html:13245`), while `stateIdx` is recovered by probing `lines[1]`. Line 0 is consumed as a header even when it is data. |
| Category #13 collides with category #1 | **CONFIRMED** | `CSV_CATEGORICAL_PALETTE` has exactly **12** entries (`index.html:12816-12820`); assignment is `[colorIdx % 12]`; legend is `.slice(0, MAX_LEGEND_ENTRIES)` with `MAX_LEGEND_ENTRIES = 12` (`index.html:5348`). Category 13 is painted `#0EA5E9` — the exact swatch the legend labels as category 1. |
| Identical-value CSV throws and wipes the map | **CONFIRMED** | The `mn === mx` guard returns `chroma(...).hex()` — a **string** — but callers do `scale(value).hex()`, so it throws `TypeError: scale(...).hex is not a function`, *after* `saveHistory()` and *after* the `delete appState.stateColors[k]` wipe loop (`index.html:13068-13092`). |
| Missing states keep their previous fill (census path) | **CONFIRMED** | `applyDataMap` never clears `appState.stateColors` before `Object.entries(data).forEach(...)` (`index.html:13538`). Note the **CSV path does** clear first (`index.html:13070`) — the inconsistency is itself a smell. |
| An empty/degenerate `200` is cached and served forever | **CONFIRMED** | `fetchCensusData` caches `rows` unconditionally after `resp.json()`; the read guard is `if (!rows)`, and `[]` is truthy, so a cached `[]` is served as data on every later call (`index.html:13455-13462`). |
| No fetch timeout | **CONFIRMED** | No `AbortController`/`AbortSignal.timeout` anywhere in `fetchCensusData`. |
| `year` format renders `2023`, not `2,023` | **CONFIRMED live** | `median_year_built` legend: `1952 – 1958`, `1958 – 1964`, … — `Math.round()` with no `toLocaleString()`. Correct. |
| Label formats applied correctly | **CONFIRMED live** | currency `$54,509 – $59,151`; percent `2.5% – 4.7%`; decimal `0.442 – 0.452`; decimal1 `2.20 – 2.37`; number `584,057 – 8,260,284`. |
| All 51 geographies clear the ACS 1-year 65k threshold | **CONFIRMED** | Smallest is Wyoming (~584k). No state silently drops out. There are **no county-level data maps**, which is what saves this — county `acs1` would drop the large majority of counties. |

### Correction 1 — `saveCurrentMapToGallery()` does not throw; it silently saves nothing

The P0 below states Save-to-My-Maps "throws". Live it is worse in a quieter way: the call **returns
normally** (no exception reaches the caller) but `localStorage['tappymaps_my_maps']` still contains
**0 entries** afterwards. So the user gets no error at all — and, depending on the toast path, may get
a success message — while nothing is saved. Same data loss, no signal whatsoever. Severity unchanged
(**P0**); only the mechanism description needs amending.

### Correction 2 — dataset #19 `pop_under18` is a universe mismatch, not "OK"

The inventory table marks `pop_under18` **OK**. It is a (small) instance of the same bug class as
`poverty` and `disability`: `B09001_001E` has universe **"Population under 18 years in households"** —
it excludes children in group quarters (juvenile facilities, group homes, some institutional
settings) — but it is divided by `B01003_001E`, total population **including** group quarters. The
result is a systematic understatement, larger in states with bigger institutional child populations.
Correct forms: divide by `B09001`'s own universe, or build the numerator from `B01001` under-18 age
cells (which share `B01003`'s universe). **Reclassify as P2** and read the inventory summary as
**33 OK · 5 denominator/methodology fixes · 1 pull-until-fixed**.

### Addition 1 — [P2] A degenerate value range produces five identical legend buckets

When every state shares one value the census path does **not** crash (unlike the CSV path — chroma
tolerates a zero-width domain), but it emits five buckets reading `23 – 23`, `23 – 23`, … each with a
different colour, over a map that is a single flat fill. `applyDataMap` should collapse to one legend
entry when `mn === mx`.
- **Location:** `index.html:13536-13552` · **Impact:** nonsense legend on any genuinely uniform
  measure · **Fix:** `if (mn === mx) { legendEntries = [{label: fmt(mn), color: scale(mn).hex()}]; }`
- **Note:** observed under a synthetic payload that made the measure constant; the mechanism is
  data-independent and applies to any real dataset with no state-level variation.

### Addition 2 — the CSV and census paths disagree about stale fills

`applyParsedChoropleth` explicitly clears `appState.stateColors` before painting ("Clear prior state
fills so partial sheets don't leave stale colors", `index.html:13069`). `applyDataMap` does not. The
census path therefore has exactly the bug the CSV path's author wrote a comment about fixing. The
one-line fix already exists in the file, ten screens away.

---

### Addition 3 — [P0, upgraded from P1] A partial Census response paints 45 states with the *previous* dataset's values under the *new* dataset's legend

The finding "Missing states keep their previous colour" appears below as **P1**. Second-run evidence
shows it is a **P0**: the map does not merely have holes, it *displays wrong values with a confident
legend*, and the app has the information needed to know better and says nothing.

- **Area:** data maps / `applyDataMap`
- **Repro:**
  1. `/design/make`, become Pro, Data panel.
  2. Load **Population** (green ramp) — 51 states painted, legend "Population".
  3. Intercept `/api/census` so the next response contains only the header + **6** data rows.
  4. Load **Median Household Income** (blue ramp).
- **Evidence** (`work/data/V3-toasts.mjs`, case `partial`):
  ```
  toast:        "Median Household Income data loaded for 6 states"
  legendTitle:  "Median Household Income"
  mapTitle:     "Median Household Income"
  colored:      51            ← 51 states painted, only 6 had data
  Texas:      #1f8340   ← Population ramp green (stale)
  Florida:    #5cb368   ← Population ramp green (stale)
  Wyoming:    #f7fcf5   ← Population ramp green (stale)
  Ohio:       #b9e3b4   ← Population ramp green (stale)
  California: #c7ddec   ← Income ramp blue (actually fresh)
  ```
  Texas is dark green because Texas is populous. The legend now asserts that dark = high income.
  A reader — and an exported PNG, which is the product's output — cannot tell the 6 real states
  from the 45 fabricated ones.
- **Location:** `index.html:13538` — `Object.entries(data).forEach(function(e) { appState.stateColors[e[0]] = scale(e[1]).hex(); });` with no preceding clear.
- **Why it is reachable in production:** `fetchYear` drops any state whose value is `NaN` **or
  negative** (`index.html:13470`). Census uses large negative sentinels (`-666666666`,
  `-999999999`) for suppressed/unavailable estimates, so a real ACS response with a suppressed
  state produces exactly this partial map. It does not require a broken server.
- **Impact:** the single worst class of bug for this product — a shareable, exportable map that
  states numbers that are not the numbers. Silent.
- **Fix:** clear `appState.stateColors` before painting (the CSV path already does exactly this at
  `index.html:13069-13070`), and when `Object.keys(data).length < 51` render the shortfall as a
  distinct "No data" fill **and** a persistent legend swatch rather than a 3-second toast.

### Addition 4 — error-path matrix (mission item 4), measured

Every case below was driven live by intercepting `/api/census`; toast text was captured by observing
`#confirmationMessage` (the real toast node — note it auto-hides after 3 s). Script:
`work/data/V3-toasts.mjs`.

| Injected response | User-facing message | Half-applied? | History corrupted? | Verdict |
|---|---|---|---|---|
| `500` + HTML body | `Failed to load data: Census API returned 500 for year 2023` | no | no | **OK-ish** — leaks internals, no user action implied |
| `403 {error:'Census API key required'}` | `Failed to load data: Census API key required` | no | no | **P2** — a server-config message shown to a paying consumer; they cannot act on it |
| `200 []` | `No data returned` | no | no | OK, but **poisons the cache** (below) |
| `200 {}` | `No data returned` | no | no | OK, but poisons the cache |
| `200` malformed rows (short rows, wrong header, non-numeric) | `No data returned` | no | no | **OK** — parser is robust, nothing half-applied |
| `200` all-`null` values | `No data returned` | no | no | **OK** |
| `200` HTML body (proxy error page) | ``Failed to load data: Unexpected token '<', "<!doctype "... is not valid JSON`` | no | no | **P2** — raw JS parser error rendered as product copy |
| network failure (`connectionrefused`) | `Failed to load data: Failed to fetch` | no | no | **P2** — should read "check your connection"; "Failed to fetch" is not user language |
| **hang (never resolves)** | **none, ever** | no | no | **P1 CONFIRMED** — after 10 s the dataset cards still carry `.loading` (`stuckLoading: 2`) and no message has appeared. No `AbortController` anywhere in `fetchCensusData`. |
| `200` partial (6 of 51 rows) | `… data loaded for 6 states` | **YES — 45 stale** | no | **P0** — see Addition 3 |

**Genuinely good news, verified:** no error path half-applies a choropleth, and **no error path
corrupts undo history** — `applyDataMap` calls `saveHistory()` only after its `values.length === 0`
guard, and thrown errors never reach it. Across every case `appState.history.length` was unchanged.

### Addition 5 — cache poisoning reproduced end-to-end, and cache keying verified correct

- **Poisoning (P1 CONFIRMED, mechanism proven):** with `/api/census` returning `200 []`, load
  Broadband → `No data returned`. Restore a *healthy* server and load Broadband again → **still**
  `No data returned`. sessionStorage holds
  `tappymaps_census_acs1_2023_B28002_004E,B28002_001E => []`. The read guard is `if (!rows)` and `[]`
  is truthy, so the dataset is dead for the remainder of the browser session — and, because the cache
  is shared, dead in Arcade Stat Duel and GeoDraft too. Only `200`-status-but-useless payloads poison;
  `500`, `403`, non-JSON and network failures correctly cache nothing (verified: `cacheKeys: 0`).
  **Fix:** only cache when `Array.isArray(rows) && rows.length > 1`.
- **Keying (verified CORRECT):** loading Population, Income and the 2013→2023 trend produced exactly
  three distinct keys —
  `tappymaps_census_acs1_2023_B01003_001E`, `tappymaps_census_acs1_2023_B19013_001E`,
  `tappymaps_census_acs1_2013_B19013_001E`. Survey, year and the full variable list are all in the
  key, so no two datasets, years or surveys can collide. This part of the design is right.

### Addition 6 — CSV hard-case matrix (mission item 6), measured

Driven live through `parseAndApplyCSV` with the map cleared between cases
(`work/data/V4-csv.mjs`). "Says" = the text rendered into `#csvImportStatus`, which is what the user
reads. **The status line is the villain in this table**: in three separate cases it reports more
states coloured than exist on the map, and appends *"All rows matched."*

| # | Input | matched | **coloured** | Says | Verdict |
|---|---|---|---|---|---|
| 1 | header, comma, full names | 5 | 5 | "5 states colored · All rows matched." | OK |
| 2 | **no header row** | 4 | **4** | "4 states colored · **All rows matched**." | **P0** — California silently gone; legend titled `"100"` |
| 3 | USPS abbreviations | 5 | 5 | All rows matched | OK |
| 4 | zero-padded FIPS (`06`) | 5 | 5 | All rows matched | OK |
| 5 | unpadded FIPS (`6`) | 5 | 5 | All rows matched | OK |
| 6 | mixed case + tabs/spaces (`  cALIFORNIA  `) | 3 | 3 | All rows matched | OK — resolver is genuinely good |
| 7 | **TAB-delimited** (Excel paste) | 3 | 3 | All rows matched | OK — delimiter sniffing works |
| 8 | `$1,234,567` / `45%` / `1,000` / `$500` | 4 | 4 | All rows matched | OK parse; but `%` is stripped so `45%` and `45` are indistinguishable, and the ramp mixes a rate with absolute counts without comment |
| 9 | **accounting negatives `(500)`** | 4 | **3** | "4 states colored · **All rows matched**." | **P1** — California dropped; `-200` parses fine, only parens fail |
| 10 | **non-numeric values (`N/A`, `--`)** | 10 | **8** | "10 states colored · **All rows matched**." | **P0** — 2 states silently uncoloured, counted as coloured |
| 11 | duplicate states | 2 | 2 | All rows matched | **P2** — silent last-wins (`California,100` then `California,1` → 1) |
| 12 | non-state rows (`Narnia`, `Total`, `United States`, `Puerto Rico`) | 2 | 2 | "4 rows could not be matched — fix the state name and re-apply" + list | **Good** — exactly the right behaviour |
| 13 | **all values identical** | — | **0** | `Could not parse that sheet: scale(...).hex is not a function` | **P0** — map wiped, raw JS TypeError as product copy |
| 14 | **single data row** | — | **0** | same TypeError | **P0** — same |
| 15 | `<img src=x onerror=…>` as a label | 2 | 2 | All rows matched | **Safe** — payload never executed (`window.__XSS` unset); stored and rendered as text |
| 16 | **13 categories** | 13 | 13 | "13 states colored · All rows matched." | **P0** — legend holds 12; the 13th state is painted `#0EA5E9`, the swatch the legend labels `Cat1` |
| 17 | DC + territories | 2 | 2 | "2 rows could not be matched" + `Puerto Rico`, `Guam` | **Good** — DC resolves, territories correctly rejected |
| 18 | **10,000 rows** | 5 | 5 | All rows matched | **Good — 47 ms**, no hang, no jank |

**Net:** the *parser* is strong (delimiters, FIPS padding, case, whitespace, `$`/`%`/commas, 10k rows,
XSS) and the *resolver* is strong (case 12 and 17 are model behaviour). Everything that is broken is
in the **reporting** layer: `matchedCount` is computed as `Object.keys(seen).length` — states whose
row *matched a state name* — while the map is painted only from rows that also produced a finite
number. The two counts are allowed to diverge and nothing compares them.
- **Location:** `index.html:13160` (`matchedCount`) vs `index.html:13077-13080` (the `isFinite` filter
  that actually decides who gets painted).
- **Fix:** report the painted count, and list value-parse failures in the same "could not be matched"
  panel that already works so well for unmatched *names* (case 12). The UI component needed already
  exists.

### Addition 7 — [P2] Equal-interval classification makes skewed data look uniform

Both `applyDataMap` and the CSV numeric path compute breaks as
`mn + (mx - mn) * (i / numClasses)` — **equal interval**, on every dataset, with no alternative.
For the many ACS measures that are heavily right-skewed (population, home value, aggregate counts)
this puts nearly every state in bucket 1 and one state alone in bucket 5. Observed on the population
legend (`584,057 – 8,260,284 … 31,288,966 – 38,965,193`: California alone occupies the top class) and
on CSV case 8 (three of four states share the lightest swatch).
- **Location:** `index.html:13536-13537` and `index.html:13091-13095`
- **Impact:** a paid "data map" that renders as a nearly flat single-colour map is the feature failing
  at its one job; users will read it as "no variation exists".
- **Fix:** quantile classification by default (or Jenks), with equal-interval as an option. Sorting 51
  values is free. For diverging measures, anchor the middle class at zero.


---

### Addition 8 — [P1, NEW] County colours live in **two** stores that never sync; undo desyncs the map from its own data

There are two county-colour objects in the file and they are not the same object:

- `const countyColors = {}` — a **bare module-level const** (`index.html:13757`). This is what the
  county click handler writes (`index.html:13828-13849`), what the county stats bar counts
  (`index.html:13933`, `index.html:10022`), and what the mobile IIFE writes (`index.html:15628-15671`).
- `appState.countyColors` — what `saveHistory()` snapshots (`index.html:10939`), what `undo()`/`redo()`
  restore (`index.html:10952`), and what the "recolour a legend entry" path rewrites
  (`index.html:10666-10669`).

Nothing ever copies between them, so `appState.countyColors` is permanently `{}` in normal use.

- **Repro / Evidence** (`work/data/V7-dualstore.mjs`, shots `dm-county-red.png`,
  `dm-county-after-undo.png`): enter county view for California, pick red, click 6 counties.
  ```
  after 6 clicks:   countyColors = 6   appState.countyColors = 0
                    statsBar "6 of 58 counties colored"   red paths on map = 6
  after undo():     countyColors = 6   appState.countyColors = 0
                    red paths on map = 0      ← map cleared, store untouched
  ```
- **Impact, in order of nastiness:**
  1. **Undo leaves the app incoherent.** The map shows zero coloured counties while the store still
     holds six, and the stats bar reads its count from the store (`index.html:13933`) — so the UI
     reports "6 of 58 counties colored" over a map with none.
  2. **The next click is dead.** County click is a toggle: `if (countyColors[fips] === selectedColor)
     delete … else set` (`index.html:13835-13839`). After an undo, clicking one of those six
     still-stored counties with the same colour *deletes* the entry instead of painting it — the user
     clicks a visibly blank county and nothing happens.
  3. **Recolouring a legend entry silently skips counties.** `index.html:10666` iterates
     `appState.countyColors`, which is always empty, so changing a legend colour recolours states but
     leaves every county on the old colour.
- **Fix:** delete one of the two. Make the click handler write `appState.countyColors` (it is already
  snapshotted, restored and re-rendered correctly), and drop the bare const. This is the same class of
  bug as the `appState.user` / `appState.currentUser` mix-up recorded in `CLAUDE.md` under "Account
  Menu" — worth a grep sweep for other duplicated state names.

### Addition 9 — county view, verified (mission item 9)

| Question | Answer | Evidence |
|---|---|---|
| Does it render? | **Yes** — California draws **58** paths, the correct county count | `work/data/V5-county.mjs` |
| Is the 795 KB topology re-fetched on every toggle? | **No — fetched exactly once.** Re-entering California, and then switching to Texas, issued **zero** further requests | network log empty on 2nd and 3rd entry |
| Do county colours survive states → counties round-trip? | **Yes, visually** — 9 red paths still present after `backToStateView()` + re-entry | `V5/V6` |
| Are county colours in the URL hash? | **No.** The encoded payload has exactly six keys | `atob(encodeStateToURL())` → `["colors","legend","title","subtitle","legendTitle","source"]` |
| Does export work in county mode? | **Yes** — `captureMapImage()` returned a 3252×2286 canvas | `V7` |
| Does the state legend persist into county view? | **Yes** — the stats bar showed state-level category tallies (`Cat1: 2Cat2: 1…`) while in county mode | `V5` |

On the hash omission: because `encodeStateToURL` reads neither county store, a county map **cannot be
shared, embedded, saved to My Maps, or survive a refresh** — the recipient of a shared county map gets
a blank 50-state map. Combined with the fact that county view is **Pro-gated**, the paid feature's
output is the one output that cannot leave the browser except as a PNG. I rate the surprise **P1**:
it is silent, it affects a paid feature, and the user has no way to discover it before sending the
link. (It is not P0 only because, unlike Addition 3, it loses data rather than *misstating* it.)

### Addition 10 — templates, verified (mission item 8)

All **28** templates were loaded in sequence in one session (`work/data/V6-county2.mjs`):

- **28/28 loaded with zero thrown errors and zero console errors.**
- **28/28 produced a non-empty legend.**
- **28/28 encode cleanly** via `encodeStateToURL()` — no template legend contains a non-Latin1
  character. This is a useful boundary on the en-dash P0: it is confined to **data maps and numeric
  CSV imports** (which build `–` labels) and does **not** affect templates or categorical CSV imports.
- **All 28 colour zero states on load** — this is by design (a template supplies a palette + legend
  scaffold for the user to fill in), not a defect. Worth stating explicitly because "0 states coloured"
  looks alarming in a sweep.

The substantive template findings (colour-vision collisions in 11 of 28, `darkMode` being dead
metadata, pale swatches colliding with the light theme) are recorded in the P2/P3 sections below and
were not re-litigated in this pass.

---

## P0 findings

### [P0] Every data map, colour ramp and numeric CSV import is unshareable, unsaveable and lost on refresh (en-dash breaks `btoa`)
- **Area:** data maps / colour ramps / CSV import / share / gallery / embed
- **Repro:**
  1. `/design/make`, become Pro, open the Data panel.
  2. Click **Population** → pick any palette. Map renders, toast says "Population data loaded for 51 states".
  3. Wait 1.5 s (the `updateURL` debounce). Look at the address bar: **there is no `#hash`.**
  4. Click **Share** → any copy action. Nothing is copied, no error toast.
  5. Console shows `Uncaught InvalidCharacterError: Failed to execute 'btoa' on 'Window': The string to be encoded contains characters outside of the Latin1 range.`
  6. Refresh the page → the map is gone.
- **Evidence:** measured for 7 datasets, all identical (`work/data/15-share.mjs`, `14-btoa.mjs`):
  ```
  population   hash len 0  copyShareLink() THREW  copyEmbedLink() THREW  saveCurrentMapToGallery() THREW  My Maps entries: 0
  income       hash len 0   …   poverty  hash len 0   …   gini  hash len 0   …
  control (ASCII legend, hand-coloured map): hash len 313  ← works fine
  CSV numeric import ("1 – 34"):             hash len 0    ← also broken
  captureMapImage(): captured 3252x2286      ← PNG export is the only surviving output path
  og:image meta: https://tappymaps.com/assets/social-og-image.png  ← falls back to the generic image
  user-visible toasts: ["Population data loaded for 51 states"]     ← no failure signal at all
  ```
  The offending bytes are `E2 80 93` (U+2013) — confirmed with `grep | cat -A` → `M-bM-^@M-^S`.
  Screenshot: `shots/share-datamap-broken.png`
- **Location:** `index.html:11153` (`return btoa(JSON.stringify(state));`), emitting sites `index.html:13512-13517` (data maps), `index.html:10215-10218`, `10261-10264`, `10435-10437` (colour-ramp auto-legend), `index.html:13065` (CSV numeric legend). `saveCurrentMapToGallery` at `index.html:6403` is `async`, so its throw becomes a swallowed rejection.
- **Impact:** Every paying Pro user. The three headline Pro features (Census data maps, 10 colour ramps, custom spreadsheet import) all produce maps that cannot leave the browser except as a PNG. Share links, `/embed`, `/s/<hash>` unfurls, `/api/render` OG images and the Gallery "My Maps" save are all dead for exactly the content the product charges for. It also fires an uncaught exception roughly once per second while editing.
- **Fix:** Make the encoder UTF-8 safe — `btoa(String.fromCharCode(...new TextEncoder().encode(json)))` (and the mirrored `TextDecoder` in `decodeStateFromURL`), or `encodeURIComponent`+`unescape`. Wrap `updateURL`, `copyShareLink`, `copyEmbedLink` and `saveCurrentMapToGallery` in try/catch that surfaces a real message. Belt-and-braces: swap the U+2013 separators for ASCII `-` (or `to`).

### [P0] Mean Commute Time is systematically understated and the error re-orders the map
- **Area:** dataset `commute_time`
- **Repro:**
  1. Intercept `/api/census` with real-shaped ACS values: for each state emit `B08136_001E = workersNotWFH × trueMeanMinutes` and `B08301_001E = allWorkers` (`work/data/02-commute.mjs`).
  2. Load **Mean Commute Time**.
  3. Compare `window._activeDataMap.data` to the true means fed in.
- **Evidence:**
  ```
  state           app shows   truth
  New York          27.4       33.0
  Maryland          26.7       32.8
  Washington        20.4       26.5
  Colorado          19.0       25.0
  Mississippi       23.8       25.3
  North Dakota      16.3       17.5
  ```
  True ordering WA (26.5) > MS (25.3) > CO (25.0). App ordering MS (23.8) > WA (20.4) > CO (19.0). Mississippi jumps two places and Colorado is depressed by 6 minutes. Screenshot: `shots/data-commute-time.png`.
  Mechanism: `B08136` ("Aggregate travel time to work") has universe *workers 16+ who did **not** work from home*; `B08301_001E` is *all* workers 16+, including the ~13.8% who worked from home in 2023. Dividing by the larger universe scales every state down by exactly its WFH share — which ranges from ~6% (MS) to ~24% (CO), so the distortion is not a constant offset.
- **Location:** `index.html:13387` — `variables: ['B08136_001E','B08301_001E'], compute: function(v){ return (v[0]/v[1]).toFixed(1); }`
- **Impact:** Every user of this dataset. The map is published with a "U.S. Census Bureau, ACS 2023" attribution and a legend in minutes; the numbers are ~14% low nationally and the state ranking is wrong. This is the exact failure mode the product cannot afford.
- **Fix:** Change the denominator to `B08303_001E` (universe: workers who did not work at home — already used correctly by `super_commuters` at `index.html:13381`) or `B08134_001E`. One-token change: `variables: ['B08136_001E','B08303_001E']`.

### [P0] CSV import silently drops rows it cannot parse, then reports them as coloured
- **Area:** spreadsheet paste → choropleth
- **Repro:**
  1. Data panel, Pro on. Paste:
     ```
     State,Value
     California,100
     Texas,80
     New York,60
     Florida,40
     Ohio,N/A
     Utah,pending
     Maine,20
     Iowa,30
     Nevada,40
     Oregon,50
     ```
  2. Click **Color map**.
- **Evidence:** (`work/data/07-csv.mjs`)
  ```
  actual states coloured : 8
  reported matched       : 10
  status panel           : "10 states colored · numeric ramp   All rows matched."
  toast                  : "Mapped 10 states"
  ```
  Ohio and Utah are uncoloured and are never mentioned. Same bug with accounting negatives: `New York,(500)` → `csvParseNumber` strips `$ % space` and commas but not parentheses, so `"(500)"` → `NaN` → dropped, while the status still says "6 states colored · All rows matched."
- **Location:** `index.html:13112` (`seen[state]=true` is set for every matched row regardless of value validity, and `matchedCount = Object.keys(seen).length`); numeric filter at `index.html:13034-13036`; `csvParseNumber` at `index.html:12928`.
- **Impact:** Anyone importing a real spreadsheet. Real sheets have `N/A`, `—`, `(1,234)`, footnote markers and blank cells. The user gets a map with holes and an explicit "All rows matched" reassurance that the holes aren't real.
- **Fix:** Count `Object.keys(data).length` (states that actually received a colour) as `matched`, and list value-parse failures in the unmatched panel with the reason ("Ohio — value 'N/A' is not a number"). Teach `csvParseNumber` about `(1,234)` → `-1234`, unicode minus, and trailing footnote characters.

### [P0] A paste with no header row silently discards the first data row and says "All rows matched"
- **Area:** spreadsheet paste → choropleth
- **Repro:**
  1. Copy two columns out of Google Sheets/Excel *without* selecting the header (the common case).
  2. Paste `California,100 / Texas,80 / New York,60 / Florida,40 / Ohio,20` and click **Color map**.
- **Evidence:** (`work/data/07-csv.mjs`)
  ```
  colored: 4   California present? false
  status : "4 states colored · numeric ramp   All rows matched."
  legend title: "100"     ← the discarded row's value became the legend title
  legend : 20 – 40 | 40 – 60 | 60 – 80
  ```
  `parseAndApplyCSV` unconditionally treats `lines[0]` as a header (`for (let i = 1; i < lines.length; i++)`), even when the fallback path has just *proved* line 0 is not a header by resolving `lines[1][0]` as a state.
- **Location:** `index.html:13139-13160` (header/fallback detection), `index.html:13203` (`for (let i = 1; …)`).
- **Impact:** The largest state in a headerless paste is always silently deleted, the legend domain is wrong for every remaining state, and the legend gets titled with a number. The status text actively tells the user nothing was lost.
- **Fix:** In the `stateIdx === -1` fallback branch, additionally test whether `lines[0][stateIdx]` resolves to a state; if it does, start the loop at `i = 0` and set `legendTitle` to a neutral default.

### [P0] Category imports past 12 categories reuse palette colours; the legend caps at 12, so states are painted a colour the legend attributes to a different category
- **Area:** spreadsheet paste → categorical choropleth
- **Repro:**
  1. Paste 20 rows of `State,Category` with 20 distinct categories (`Cat0`…`Cat19`).
  2. Click **Color map**. Read the legend, then look at the states.
- **Evidence:** (`work/data/08-csv2.mjs`)
  ```
  Cat0   California  #0EA5E9
  Cat12  Alaska      #0EA5E9   ← identical colour
  Cat4   Utah        #EF4444
  Cat16  Delaware    #EF4444   ← identical colour
  legend entries: 12  =>  Cat0,Cat1,…,Cat11   (Cat12–Cat19 absent)
  status: "20 states colored · category palette   All rows matched."
  ```
  `CSV_CATEGORICAL_PALETTE` has 12 entries and is indexed `colorIdx % 12`; the legend is `.slice(0, MAX_LEGEND_ENTRIES)` = 12. No warning is emitted.
- **Location:** `index.html:12770` (palette), `index.html:13073` (`% CSV_CATEGORICAL_PALETTE.length`), `index.html:13089` (`.slice(0, MAX_LEGEND_ENTRIES)`).
- **Impact:** A reader of the exported map looks up Alaska's blue in the legend and reads "Cat0". The map asserts something false, and the importer says everything matched. Realistic for any >12-category dimension (industry, primary crop, dominant carrier, sports conference).
- **Fix:** Cap categorical imports at `MAX_LEGEND_ENTRIES` distinct categories: colour the first 12, group the rest into an explicit "Other" swatch, and say so loudly in the status panel ("8 categories beyond the 12-colour limit were grouped as Other"). Never reuse a palette colour for a second category.

---

## P1 findings

> One further P1 was added by the verification run and is written up above:
> **county colours live in two stores that never sync, so undo desyncs the map from its own data**
> (Addition 8).


### [P1 → **UPGRADED TO P0** by the verification run — see Addition 3] States missing from a Census response keep their previous colour, producing a fully-painted "Census" map with values that aren't in the data
- **Area:** data maps (`applyDataMap`)
- **Repro:**
  1. Hand-colour CA / TX / FL / NY / AK bright red (`#FF0000`).
  2. Intercept `/api/census` and return the standard Census suppression jam value `-666666666` for those five states only.
  3. Load **Median Household Income**.
- **Evidence:** (`work/data/04-stale.mjs`, screenshot `shots/stale-after.png`)
  ```
  data states returned : 46   ('California' in data? false)
  California colour    : #FF0000  ← unchanged from the previous map
  Nevada colour        : #dbe8f6  ← correctly overwritten
  total coloured       : 51
  toast                : "Median Household Income data loaded for 46 states"
  stats bar            : "50 states colored"
  legend               : five blue income buckets — #FF0000 appears nowhere in it
  ```
  `applyDataMap` merges into `appState.stateColors` and never clears it first, so any state absent from the response silently retains whatever it was. Also fires whenever a trend dataset drops a state (`index.html:13481` skips states missing from either year).
- **Location:** `index.html:13506` — `Object.entries(data).forEach(function(e){ appState.stateColors[e[0]] = scale(e[1]).hex(); });` with no preceding clear. Contrast `index.html:13024`, where the CSV path *does* clear first and comments on exactly this hazard.
- **Impact:** The exported map is titled "Median Household Income", sourced "U.S. Census Bureau, ACS 2023", and carries five states whose colour means nothing. The 46-vs-51 discrepancy lives only in a transient toast.
- **Fix:** Clear `appState.stateColors` at the top of `applyDataMap` exactly as `applyParsedChoropleth` does, and add an explicit "No data" legend swatch (see next finding) for the remainder.

### [P1] Uncoloured "no data" states are visually indistinguishable from the dark end of the ramp, and there is no "No data" legend swatch
- **Area:** data maps — legend generation
- **Repro:** As above, with 10 states suppressed; view in the default Midnight theme.
- **Evidence:** `shots/err-partial.png`. The unfilled `--state-fill` is `#2a2a4a`; the top bucket of the default income ramp renders `#124a89`. Both read as "dark blue" at export size. AZ / CO / AR / AL sit as dark blobs that a reader will file under "highest income". The legend has five buckets and no "no data" entry; the stats bar reads "50 states colored".
- **Location:** `index.html:13509-13521` (legend build), `index.html:61` (`--state-fill: #2a2a4a`).
- **Impact:** Incomplete data maps read as complete and mis-assign the missing states to the extreme bucket.
- **Fix:** When `Object.keys(data).length < 51`, append a `{label: 'No data', color: 'var(--state-fill)'}` legend entry, force a distinct hatch or neutral grey for the missing states, and put the count in a persistent line under the legend rather than a toast.

### [P1] The only trend dataset uses a sequential ramp, so income *gains* and *losses* are the same colour
- **Area:** dataset `income_growth_13_23`
- **Repro:**
  1. Intercept `/api/census` so 2013 > 2023 for roughly half the states.
  2. Load **Median Income Growth (2013 → 2023)**.
- **Evidence:** (`work/data/13-final.mjs`, screenshot `shots/trend-negative.png`)
  ```
  value range : -40.0% … +50.0%   (23 of 51 states negative)
  legend      : -40.0% – -22.0% #e3eef9
                -22.0% – -4.0%  #b4d2ea
                -4.0% – 14.0%   #6baed6   ← this bucket straddles zero
                14.0% – 32.0%   #307dbc
                32.0% – 50.0%   #1257a1
  ```
  A state that lost 3% and a state that gained 13% are painted the identical `#6baed6`. Lightness is monotonic across the whole ramp (verified: `lightnessMonotonic: true`, `work/data/06-ramps.mjs`), so there is no visual break at zero anywhere.
- **Location:** `index.html:13383` (`colorScale: ['#f7fbff','#c6dbef','#6baed6','#2171b5','#084594']`), break computation `index.html:13502-13504`.
- **Impact:** A change map that cannot show the sign of the change is worse than no map. Ten diverging-capable ramps already exist in `DATA_MAP_RAMPS.more`.
- **Fix:** Give trend datasets a `diverging: true` flag; default them to `Red–Blue` or `Brown–Green`; anchor the scale symmetrically on zero (`domain([-M, 0, M])` where `M = max(|min|,|max|)`) so the midpoint colour always means "no change"; and prefix the legend labels with an explicit `+` on positives.

### [P1] "Median Income Growth" is nominal, not inflation-adjusted, and is labelled simply "Growth"
- **Area:** dataset `income_growth_13_23`
- **Repro:** Read the dataset definition; load the map.
- **Evidence:** `variables: ['B19013_001E'], years: [2013, 2023]`, `computeTrend` defaults to `((b - a) / a) * 100`. ACS publishes each year's median household income in that survey year's dollars. CPI-U rose roughly 32% from 2013 to 2023, so a state showing "+45% growth" had roughly +10% real growth; a state showing "+25%" actually went *backwards*. Title on the exported map: "Median Income Growth (2013 → 2023)"; subtitle: "Percent change in median household income, 2013 vs 2023". Neither says "nominal" or "not adjusted for inflation".
- **Location:** `index.html:13383`; trend maths at `index.html:13478-13487`.
- **Impact:** The single most viral-looking dataset in the set publishes a number that means the opposite of what a reader will take from it.
- **Fix:** Either deflate by CPI in `computeTrend` and relabel "Real Median Income Growth", or keep nominal and change the title/subtitle/source line to say "nominal dollars, not adjusted for inflation" — and add the diverging ramp from the previous finding so a real-terms decline is at least visible as a sign change.

### [P1] Poverty Rate, Disability Rate and Unemployment Rate use denominators whose universe doesn't match the numerator
- **Area:** datasets `poverty`, `disability`, `unemployment`
- **Repro:** Static reading of the definitions, confirmed against the ACS table universes. Each renders without error (`work/data/01-datasets.mjs`), so the defect is in the arithmetic, not the plumbing.
- **Evidence:**
  | dataset | numerator (universe) | denominator used | correct denominator | effect |
  |---|---|---|---|---|
  | `poverty` | `B17001_002E` — below poverty (universe: *population for whom poverty status is determined*) | `B01003_001E` total population | `B17001_001E` | rate biased ~2–3% low; a published 12.5% shows as ~12.2% |
  | `disability` | `B18101_*` with-a-disability (universe: *civilian noninstitutionalized population*) | `B01003_001E` total population | `B18101_001E` | rate biased ~2% low, despite the description saying "civilian population" |
  | `unemployment` | `B23025_005E` unemployed | `B23025_002E` **total** labor force (includes Armed Forces) | `B23025_003E` civilian labor force | description literally says "Civilian labor force unemployment rate"; error is negligible nationally but material in HI / VA / AK / NC |
  Every one of these correct denominators is in a table the app already fetches for that dataset, so the fix costs nothing extra.
- **Location:** `index.html:13374` (poverty), `index.html:13400` (disability), `index.html:13376` (unemployment).
- **Impact:** A user who checks any of these against census.gov gets a different number under the same ACS 2023 attribution. Ranking is broadly preserved, so this is a credibility rather than a cartography failure — but it is still "the map shows a number that is wrong".
- **Fix:** `poverty` → `['B17001_002E','B17001_001E']`; `disability` → append `B18101_001E` instead of `B01003_001E`; `unemployment` → `['B23025_005E','B23025_003E']`.

### [P1] A cached empty/failed `200` poisons the session cache and is served as data forever
- **Area:** `fetchCensusData` sessionStorage cache
- **Repro:**
  1. Intercept `/api/census` and return `200` with body `[]` (what a Census hiccup or a proxy misconfiguration looks like).
  2. Load **Median Home Value** → "No data returned".
  3. Restore the intercept to a healthy payload.
  4. Load **Median Home Value** again.
- **Evidence:** (`work/data/05-cache.mjs`)
  ```
  first attempt  -> cached sessionStorage value: "[]"   network hits: 1
  retry (upstream healthy) -> network hits: 0   toast: "No data returned"
  ```
  `JSON.parse("[]")` is truthy, so `if (!rows)` never re-fetches. `{}` behaves the same. The user cannot recover without closing the tab; every dataset sharing those variables is poisoned too.
- **Location:** `index.html:13457` — `try { sessionStorage.setItem(cacheKey, JSON.stringify(rows)); } catch(_) {}` runs unconditionally after `resp.json()`.
- **Impact:** One transient upstream blip permanently bricks a dataset for the rest of a Pro user's session, with an error message that implies the data doesn't exist.
- **Fix:** Only cache when `Array.isArray(rows) && rows.length > 1`. Consider caching the *derived* result keyed by dataset id and stamping it with a timestamp so it can be invalidated.
- **Note (verified good):** the cache key `tappymaps_census_<survey>_<year>_<vars>` correctly separates surveys, years and variable sets (trend datasets produce two distinct entries), it is genuinely shared with the games (a direct `fetchCensusData()` call after an editor load did zero network requests), and filling sessionStorage to the 5 MB quota degrades gracefully — the `setItem` throw is swallowed and the map still loads.

### [P1] A hung `/api/census` request never times out; the loading spinner spins forever
- **Area:** `fetchCensusData` / `executeDataMapLoad`
- **Repro:** Intercept `/api/census` with a promise that never resolves, then click any dataset.
- **Evidence:** (`work/data/03-errors.mjs`, screenshot `shots/err-hang-12s.png`) after 12 s: `{"loadingCards":2,"anySpinner":true,"colored":2,"toasts":[<the previous test's toast>]}`. No `AbortController`, no `setTimeout` race, no user-facing timeout message. The `finally` block only runs once the promise settles, so the card's `.loading` class persists until the browser's own socket timeout (~300 s).
- **Location:** `index.html:13453` (client `fetch` with no signal); `api/census.js:65` (`const upstream = await fetch(url)` — also unbounded, relies on the Vercel function limit).
- **Impact:** A slow Census upstream (they are frequently slow) leaves a Pro user staring at a spinner with no way to tell whether it is working, and no cancel.
- **Fix:** `AbortController` with a 15 s timeout on the client, a matching timeout on the proxy, and a "Census is slow right now — retry?" message with a working retry button.

### [P1] A CSV where every value is identical (or a single data row) throws and wipes the user's map
- **Area:** spreadsheet paste → choropleth
- **Repro:**
  1. Hand-colour a few states and write a legend.
  2. Paste `State,Value / California,5 / Texas,5 / Ohio,5` → **Color map**.
- **Evidence:** (`work/data/08-csv2.mjs`; `shots/csv-crash-before.png` → `csv-crash-after-render.png`)
  ```
  TypeError: scale(...).hex is not a function
  appState.stateColors after : 0 entries   (was 5)
  DOM still showing           : 5 filled paths   ← state/DOM desync
  after the next renderMap()  : 0 filled paths   ← the user's work visibly vanishes
  undo()                      : restores 5 colours
  status: "Could not parse that sheet: scale(...).hex is not a function"
  ```
  When `mn === mx` the ternary assigns a function that **returns a hex string**, and the caller then does `scale(value).hex()`. The wipe happens because `saveHistory()` and the `delete appState.stateColors[k]` loop run *before* the throw.
- **Location:** `index.html:13049-13053`.
- **Impact:** Guaranteed for any single-row paste and for any legitimately flat dataset ("all 50 states = 1"). The user sees a raw JS TypeError and their map disappears; recovery requires knowing to press Ctrl+Z.
- **Fix:** `const flat = chroma(CSV_NUMERIC_RAMP[2]).hex(); const scale = (mn===mx) ? () => ({hex: () => flat}) : chroma.scale(...)`, or normalise both branches to return a hex string. Separately, wrap the whole apply in try/catch that restores the pre-clear snapshot.

### [P1] Numeric legends round to integers, so fractional data produces "0 – 0" buckets
- **Area:** CSV numeric legend + data-map `format:'number'`
- **Repro:** Paste `State,Rate / California,0.123 / Texas,0.456 / New York,0.789 / Ohio,0.234 / Florida,0.567` → **Color map**.
- **Evidence:** (`work/data/07-csv.mjs`) legend renders `0 – 0 | 0 – 1 | 1 – 1`. Five states get five distinct colours whose legend is meaningless. Same mechanism gives `format:'number'` data maps integer-only buckets — `median_age` renders `33 – 34 | 34 – 36 | 36 – 37 | 37 – 39 | 39 – 41` over a true range of 32.7–40.6, and a low-spread `commute_time` collapsed to `23 – 23` five times in testing.
- **Location:** `index.html:13065` (CSV), `index.html:13517` (data maps `format:'number'`).
- **Impact:** Rates, indices, per-capita ratios and scores — exactly the shapes a spreadsheet user brings — get a legend that says nothing, and the map ships with it.
- **Fix:** Choose precision from the value range: `const d = Math.max(0, 2 - Math.floor(Math.log10(Math.max(1e-9, mx - mn))))` and format with `toLocaleString(undefined,{minimumFractionDigits:d, maximumFractionDigits:d})`. Give `median_age` and `commute_time` a `decimal1` format.

### [P1] County colours are absent from the URL hash and from Save-to-My-Maps — sharing a county map ships an empty state map
- **Area:** county view
- **Repro:**
  1. `/design/make` as Pro. Colour three states. Wait for the hash to settle.
  2. **County View** → Ohio. Paint five counties.
  3. Read `location.hash` and decode it.
- **Evidence:** (`work/data/11-county.mjs`)
  ```
  hash length before painting counties : 257
  hash length after painting 5 counties: 257   (unchanged)
  decoded keys : ["colors","legend","title","subtitle","legendTitle","source"]
  decoded colors: {"California":"#22c55e","Texas":"#22c55e","Ohio":"#22c55e"}   ← no county data at all
  ```
  The county click handler at `index.html:13787` calls `updateStatsBar()` but never `updateURL()`, and `encodeStateToURL` has no `countyColors` field.
- **Location:** `index.html:11145-11152` (state shape), `index.html:13711` (`const countyColors = {}`), `index.html:13787-13797` (click handler).
- **Impact:** A Pro user spends ten minutes colouring 88 Ohio counties, hits Share, and the recipient opens an uncoloured national map. Same for "Save to My Maps" and `/embed`. Nothing warns them. Within a session the county work survives toggling (verified: re-entering Ohio restored all five painted counties), which makes the loss on share/refresh more surprising, not less.
- **Fix:** Either add `counties` + `countyState` to the encoded state and restore them in `loadStateFromURL` (a 5-digit-FIPS→hex map for one state is well under the 8 000-char hash budget), or — if that is out of scope — hard-block Share/Save while `countyMode` is true with an explicit "County maps can only be exported as an image" message.

### [P1] The `election-prediction` template is unreadable for red-green colour-blind viewers
- **Area:** templates
- **Repro:** Load **Presidential Election Map (your prediction)**; simulate deuteranopia on the five legend colours.
- **Evidence:** (`work/data/10-tplcolor.mjs`, Viénot/Brettel LMS simulation, CIE76 ΔE)
  ```
  Solid Democrat #3b82f6  ⇄  Toss-up #a855f7   ΔE(deuteranope) = 1.9   ← effectively identical
  ```
  ΔE below ~2.3 is the just-noticeable-difference threshold. 11 of the 28 templates have at least one pair below ΔE 15 under deuteranopia; the worst after election-prediction are `states-by-friendliness` and `state-reputation` at ΔE 5.2 (`#22c55e` ⇄ `#f87171`), then `states-by-road-trip` at 12.0 and `states-by-vibes` at 13.1.
- **Location:** `index.html:14247-14640` (`TEMPLATES`).
- **Impact:** ~8% of men cannot distinguish "Solid Democrat" from "Toss-up" on the flagship political template, and cannot read six of the red/green opinion templates at all.
- **Fix:** Move Toss-up to a neutral light grey/tan rather than purple; replace the green/red opinion pairs with a blue↔orange or purple↔orange axis (both survive deuteranopia and protanopia); add the CVD ΔE check to the template review checklist.

---

## P2 findings

> Two further P2s were added by the verification run and are written up above:
> **degenerate value ranges produce five identical legend buckets** (Addition 1) and
> **equal-interval classification makes skewed data look uniform** (Addition 7).
> Dataset `pop_under18` was also reclassified OK → P2 (Correction 2).


### [P2] Ramp fills and the per-theme state stroke have ~1.0 contrast — borders disappear on the choropleth
- **Area:** colour ramps × theme system
- **Repro:** Load **Population**, choose the **Purple** ramp, switch to Mint / Ocean / Cherry.
- **Evidence:** (`work/data/06-ramps.mjs`, screenshot `shots/ramp-theme-mint.png`) worst swatch-vs-stroke WCAG contrast per ramp:
  ```
  Purple         ocean 1.00   mint 1.00   cherry 1.00
  Orange-Purple  solarized 1.00   sunset 1.01   mint 1.02
  Blue           sunset 1.00   slate 1.01   nord 1.04
  Grey           light 1.01   slate 1.03   cyberpunk 1.03
  Red            dark 1.02   nord 1.03   slate 1.06
  Teal           slate 1.04   warm 1.07   nord 1.07
  ```
  Every one of the 10 ramps has at least one swatch that vanishes against at least one theme's `--state-stroke`. In the Mint screenshot, WY/ID/ND and NV/UT/AZ/NM merge into single blobs. This is structural: a 7-step ramp spanning 60–80 L\* will always contain a step near any fixed stroke luminance.
- **Location:** `index.html:968-970` (`stroke: var(--state-stroke)`), tokens at `index.html:62,127,152,171,194,215,236,257,282,303,324,348,369,394,419,444`.
- **Impact:** The core deliverable — a readable choropleth — degrades in most of the 16 themes, and the user has no way to diagnose it.
- **Fix:** When a data map or ramp is active, stop using the theme stroke: use a fixed hairline that adapts to the fill (white at ~0.6px over fills darker than L\* 55, near-black over lighter fills), computed per state at render time. Cheap, and it makes every ramp work in every theme.
- **Related (same shot):** the state abbreviation labels use a fixed colour and become illegible over the dark end of a ramp (`CA` and `TX` over the darkest purple). Same adaptive-contrast fix applies.

### [P2] The fuzzy state resolver silently maps city and multi-state strings onto a single state
- **Area:** CSV state resolution
- **Repro:** Paste `State,Value` with rows `Kansas City,42` and `Ohio and Kentucky,7` alongside real states.
- **Evidence:** (`work/data/07-csv.mjs`) both rows are *matched* — the unmatched list contains only `United States`, `Puerto Rico`, `Guam`, `Total`. `Kansas City` is painted onto Kansas; `Ohio and Kentucky` onto Ohio. Cause: `key.startsWith(nk)` in the prefix pass — any string beginning with a state name resolves to that state if no other state matches.
- **Location:** `index.html:12891-12895`.
- **Impact:** City-level or multi-state source data is silently attributed to the wrong geography with no warning. A Kansas City, Missouri figure paints Kansas.
- **Fix:** Require the prefix match to consume the whole token (`key === nk` or `key.startsWith(nk + ' ')` only when the remainder is a known suffix like "state"), and surface every prefix/fuzzy match as a reviewable "did you mean" list rather than applying it silently. Also add `Puerto Rico` (FIPS 72) to `FIPS_TO_STATE` — the map renders PR but the importer can't address it.

### [P2] Duplicate states silently last-wins with no warning
- **Area:** CSV import
- **Repro:** Paste `California,100` then `California,1`.
- **Evidence:** `colored: 2`, `matched: 2`, status "All rows matched", `California` ends at `1`. The 10 000-row test collapses 10 000 rows into 10 states the same way, reporting "Mapped 10 states".
- **Location:** `index.html:13000-13008` (comment says "Last row wins for duplicates" — the behaviour is intentional, the silence is not).
- **Impact:** A long sheet with an accidental repeated row, or a county-level sheet pasted by mistake, produces a plausible-looking map built from arbitrary rows.
- **Fix:** Count duplicates and report them: "12 states appeared more than once — the last value was used."

### [P2] County stats bar counts counties from other states
- **Area:** county view
- **Repro:** County View → Ohio, paint 5 counties → Back to States → County View → Texas.
- **Evidence:** (`work/data/11-county.mjs`) on entering Texas with nothing painted there, the bar reads **"5 of 254 counties colored"**; after painting 3 Texas counties it reads **"8 of 254"**. `updateStatsBar` uses `Object.keys(countyColors).length` (global) against `countyTotal` (current state). `loadCountyView` even computes the correct per-state count and then discards it.
- **Location:** `index.html:9995-9998`; the unused correct computation at `index.html:13890`.
- **Impact:** The progress bar lies, and can exceed 100% (it is clamped) for a user who paints several states' counties.
- **Fix:** `colored = Object.keys(countyColors).filter(k => k.startsWith(currentStateFips)).length` — store `currentStateFips` on entry.

### [P2] County view wastes ~half the canvas, the logo watermark lands on the map, and the state legend persists
- **Area:** county view rendering / export
- **Repro:** County View → Texas (or Ohio) with a state legend already present.
- **Evidence:** (`work/data/12-countyfit.mjs`, screenshots `shots/county-texas.png`, `county-ohio-painted.png`)
  ```
  Ohio: content fills 45% of the SVG width, 81% of the height
  Texas: logoWatermark rect [414,733,622,139] overlaps 8 of 254 county paths
  legendDisplay: display "block", text "Population 584,057 – 8,260,284 …"  ← the previous state-level legend
  county labels: font-size 1.32px in viewBox units, fill hard-coded rgb(184,184,184)
  ```
  The aspect-fit only ever widens the viewBox to the container aspect, so a tall or square state sits in a wide frame with large side margins; the logo, anchored to the container's bottom-centre, then sits over the map instead of over empty ocean as it does in state view. For Texas's 254 counties the labels overlap into unreadable mush.
- **Location:** `index.html:13830-13850` (viewBox fit), `index.html:13856-13884` (labels), `index.html:12720` (`const VB_W = 1010, VB_H = 710` — `updateLegendPosition` hard-codes the state viewBox, so the legend anchor is wrong in county mode too).
- **Impact:** County maps — a headline Pro feature — export at roughly half the useful resolution, with the brand mark sitting on the data and a legend describing a different map.
- **Fix:** Fit the viewBox to the content and let the container letterbox (`preserveAspectRatio` already handles it); reposition or shrink the logo when `countyMode`; hide or replace `legendDisplay` on entering county mode; suppress labels above ~80 counties (or only label counties above a size threshold) and derive the label fill from the theme.

### [P2] Server-configuration and raw JS parser errors are shown to end users
- **Area:** data-map error handling
- **Repro:** Return `403 {"error":"Census API key required. Set CENSUS_API_KEY in the deployment environment."}`, then `200` with `text/html`.
- **Evidence:** (`work/data/03-errors.mjs`) user-visible toasts:
  ```
  "Failed to load data: Census API key required. Set CENSUS_API_KEY in the deployment environment."
  "Failed to load data: Unexpected token '<', \"<html>not \"... is not valid JSON"
  "Failed to load data: Failed to fetch"
  ```
- **Location:** `index.html:13632` (`showMessage('Failed to load data: ' + err.message, 'error')`), message origin `api/census.js:70`.
- **Impact:** A paying customer is told to set an environment variable, or shown a JSON parse error. Not actionable, and it leaks operational detail.
- **Fix:** Map error classes to user copy ("Census data is temporarily unavailable — we've been notified. Try again in a minute.") and keep the operator string in `console.error` / analytics only.
- **Otherwise good (verified):** across `500`, `403`, `200 []`, `200 {}`, malformed rows, all-null, all-jam-value, network abort and non-JSON, the app **never** left a half-applied choropleth, never corrupted undo history (`saveHistory()` runs after validation), never hung on the non-timeout paths, and always preserved the existing map. That part is solid.

### [P2] `median_year_built` uses a diverging ramp for a sequential variable
- **Area:** dataset `median_year_built`
- **Evidence:** `colorScale: ['#8c510a','#d8b365','#f6e8c3','#5ab4ac','#01665e']` — brown → cream → teal, i.e. BrBG. Verified non-monotonic in lightness (`work/data/06-ramps.mjs`: `median_year_built  Lmono=false  diverging=true` — the only one of the 39). Median year structure built has no meaningful midpoint, and the cream inflection lands wherever `mn`/`mx` happen to fall for the current data.
- **Location:** `index.html:13396`.
- **Impact:** Readers infer a threshold ("pre-war vs post-war") that the map does not encode.
- **Fix:** Swap to a sequential ramp (the existing Orange or Teal), or make the diverging behaviour real by anchoring the midpoint at a stated year.

### [P2] Accounting-style negatives parse as NaN
- **Area:** `csvParseNumber`
- **Evidence:** `"(500)"` → strips `$ % whitespace` and commas → `"(500)"` → `Number()` → `NaN` → the row is silently converted to a *category* and then dropped in numeric mode. Verified in the dirty-numerics case (`colored: 5`, `matched: 6`).
- **Location:** `index.html:12928-12936`.
- **Impact:** Financial and budget spreadsheets — a natural fit for this feature — lose every negative row.
- **Fix:** `s = s.replace(/^\((.*)\)$/, '-$1')` before `Number()`, and normalise the unicode minus `−` (U+2212).

### [P2] 11 of 28 templates contain colour pairs that collide under colour-vision deficiency
- **Area:** templates
- **Evidence:** full table in `work/data/10-tplcolor.mjs` output; worst offenders listed under the election-prediction P1 above. The recurring pattern is `#22c55e` (green) paired with `#ef4444`/`#f87171` (red) as the two poles of an opinion scale — used in `states-i-could-find`, `states-by-outline`, `hardest-to-spell`, `states-own-country`, `walkable-vs-driveable`, `state-reputation`, `states-by-friendliness`, `states-overrated-underrated`.
- **Location:** `index.html:14247-14640`.
- **Impact:** These are the shareable, viral templates; ~8% of male viewers see two identical-looking poles.
- **Fix:** Retire the green/red pole pair in favour of blue↔orange; keep green/red only where a third dimension (lightness) already separates them.

---

## P3 findings

### [P3] `darkMode` is dead metadata on all 28 templates
- **Area:** templates
- **Evidence:** every template carries `darkMode: true` (28/28, `work/data/templates.json`), but `loadTemplate` never reads `tpl.darkMode` — `grep -n darkMode` shows only `appState.darkMode`, which is set by `applyTheme`. The field has no effect.
- **Location:** `index.html:14633-14707` (`loadTemplate`), field declared at `14259`, `14271`, … 28 times.
- **Impact:** None functionally; it misleads future maintainers into thinking templates are theme-aware.
- **Fix:** Delete the field, or make it real — set the theme (or at least warn) when a light-palette template is loaded into a dark theme.

### [P3] Template pale swatches collide with the light-theme unfilled state
- **Area:** templates × theme system
- **Evidence:** `work/data/10-tplcolor.mjs` vs the real light `--state-fill: #c8cfe0` (`index.html:126`): `states-ive-gotten-lost-in` "Found my way" `#facc15` → 1.02; `states-id-move-to` "Maybe for the right job" `#fbbf24` → 1.07; `states-ive-visited` "Passed through" `#86efac` → 1.11; 19 templates fall below 1.35.
- **Impact:** In light themes, "I marked this as X" and "I haven't marked this" look the same, which inverts the meaning of the map.
- **Fix:** Give unfilled states a visibly distinct treatment (a light hatch or a deeper neutral) in light themes, and lift template swatches out of the ≤1.35 band.

### [P3] Data-map toast says "51 states"
- **Area:** data maps
- **Evidence:** "Population data loaded for 51 states" — DC is in `FIPS_TO_STATE` and gets coloured, but it is in `nonColorable`, so the stats bar correctly says "50 states colored". The two counters disagree on screen simultaneously (`shots/ramp-theme-mint.png`).
- **Location:** `index.html:13539`.
- **Fix:** "…loaded for 50 states + DC".

### [P3] `updateLegendPosition` hard-codes the 1010×710 viewBox, so the legend anchor is wrong in county mode
- **Area:** legend positioning × county view
- **Evidence:** `const VB_W = 1010, VB_H = 710;` at `index.html:12720`, while county mode rewrites the viewBox (`639.8 198.9 167.3 105.9` for Ohio). The computed "map content rect" therefore describes a rectangle that isn't drawn.
- **Fix:** Read the live viewBox instead of the constants.

### [P3] The census sessionStorage cache never evicts
- **Area:** cache
- **Evidence:** entries are written once per `survey/year/vars` and never removed; a session that browses all 39 datasets accumulates ~40 entries. Measured harmless (well under 5 MB, and a full quota degrades gracefully), but there is no TTL, so a mid-session Census correction is never picked up.
- **Location:** `index.html:13444`, `13457`.
- **Fix:** Stamp entries with a timestamp and expire after an hour; prune oldest on `QuotaExceededError` instead of silently disabling the cache.

### [P3] The free CSV sample is real Census data labelled "Sample data (illustrative)"
- **Area:** CSV sample
- **Evidence:** `CSV_SAMPLE_POPULATION` values are the genuine Vintage-2023 estimates (CA 38,965,193; TX 30,503,301; FL 22,610,726; NY 19,571,216; WY 584,057 — all correct), but the map is titled "2023 State Population" with subtitle "Free sample · ACS-style totals" and source "Sample data (illustrative)".
- **Location:** `index.html:12777-12793`, `index.html:13231-13237`.
- **Impact:** A user exports a real, accurate population map that disclaims itself as illustrative — or trusts the disclaimer and doesn't share a perfectly good map.
- **Fix:** The numbers are real; source it honestly ("U.S. Census Bureau, Vintage 2023 population estimates").

### [P3] `format:'number'` is used for two datasets whose values have one decimal
- **Area:** `median_age`, `commute_time`
- **Evidence:** legend `33 – 34 | 34 – 36 | 36 – 37 | 37 – 39 | 39 – 41` over a 32.7–40.6 range. Duplicate boundary values appear because both ends round to the same integer.
- **Fix:** Give both `format: 'decimal1'` (which already renders two decimals) or add a `decimal1s` single-decimal format.

### [P3] Dead code / minor hygiene in `loadCountyView`
- **Evidence:** `const colored = Object.keys(countyColors).filter(k => k.startsWith(stateFips)).length;` at `index.html:13890` is computed and never used (it is exactly the value the stats bar needs — see the P2 above). County label fill is hard-coded `#b8b8b8` rather than a theme token (`index.html:13875`).

### [P3] Console hygiene — clean
- **Evidence:** zero console errors across all 39 dataset loads, all 28 template loads, 24 CSV paste scenarios, county entry/exit/re-entry, and theme switching. The only errors observed were (a) the deliberately induced error paths, which log appropriately via `console.error`, and (b) the `btoa` P0. Network: only the expected `/api/census` and one 795 KB `counties-albers-10m.json` fetch, correctly cached in `countyTopology` for the session (verified: 1 network request across three county-view entries).

---

## Dataset inventory

39 entries confirmed (`DATA_MAP_DATASETS`, `index.html:13370-13401`). All 39 load, colour 51 geographies, and generate a 5-class legend with zero console errors. Codes verified against ACS 2023 table structures. `acs1` (the default for all 39) publishes for every geography ≥65,000 population, which every state and DC clears — **no state silently drops out**.

| # | id | title | ACS variable(s) | yr | fmt | duel | Verdict |
|---|---|---|---|---|---|---|---|
| 1 | population | Population | B01003_001E | 2023 | number | ✓ | **OK** |
| 2 | income | Median Household Income | B19013_001E | 2023 | currency | | **OK** |
| 3 | income_growth_13_23 | Median Income Growth (2013→2023) | B19013_001E | 2013,2023 | percent | | **P1** nominal dollars, sequential ramp on a change variable, U+2192 in title |
| 4 | poverty | Poverty Rate | B17001_002E ÷ B01003_001E | 2023 | percent | | **P1** wrong denominator universe (use B17001_001E) |
| 5 | education | Bachelor's Degree+ | B15003_022–025E ÷ _001E | 2023 | percent | ✓ | **OK** |
| 6 | unemployment | Unemployment Rate | B23025_005E ÷ _002E | 2023 | percent | | **P1** denominator includes Armed Forces; label says "Civilian" (use _003E) |
| 7 | homevalue | Median Home Value | B25077_001E | 2023 | currency | ✓ | **OK** |
| 8 | median_age | Median Age | B01002_001E | 2023 | number | ✓ | **P3** integer-rounded legend loses the decimal |
| 9 | per_capita_income | Per Capita Income | B19301_001E | 2023 | currency | ✓ | **OK** |
| 10 | gini | Income Inequality (Gini) | B19083_001E | 2023 | decimal | | **OK** |
| 11 | homeownership | Homeownership Rate | B25003_002E ÷ _001E | 2023 | percent | ✓ | **OK** |
| 12 | median_rent | Median Gross Rent | B25064_001E | 2023 | currency | ✓ | **OK** |
| 13 | rent_burden | Rent Burden | B25071_001E | 2023 | percent | | **OK** |
| 14 | uninsured | Uninsured Rate | B27010_017/033/050/066E ÷ _001E | 2023 | percent | | **OK** — universe correctly matched |
| 15 | foreign_born | Foreign-Born Population | B05002_013E ÷ B01003_001E | 2023 | percent | ✓ | **OK** (B05002 universe = total population) |
| 16 | veterans | Veteran Population | B21001_002E ÷ _001E | 2023 | percent | ✓ | **OK** |
| 17 | commute_time | Mean Commute Time | B08136_001E ÷ B08301_001E | 2023 | number | ✓ | **P0** universe mismatch — understated ~14%, re-orders states |
| 18 | pop_65plus | Population 65+ | B01001_020–025E + _044–049E ÷ B01003_001E | 2023 | percent | ✓ | **OK** — all 12 age cells correct |
| 19 | pop_under18 | Population Under 18 | B09001_001E ÷ B01003_001E | 2023 | percent | ✓ | **P2** — `B09001` universe is "under 18 **in households**" (excludes group quarters); denominator includes GQ |
| 20 | broadband | Broadband Internet | B28002_004E ÷ _001E | 2023 | percent | ✓ | **OK** ("broadband of any type") |
| 21 | snap | SNAP/Food Stamps | B22010_002E ÷ _001E | 2023 | percent | | **OK** |
| 22 | disability | Disability Rate | B18101_004/007/010/013/016/019/023/026/029/032/035/038E ÷ B01003_001E | 2023 | percent | | **P1** wrong denominator (use B18101_001E); all 12 numerator cells correct |
| 23 | work_from_home | Work From Home | B08301_021E ÷ _001E | 2023 | percent | ✓ | **OK** |
| 24 | public_transit | Public Transit Commuters | B08301_010E ÷ _001E | 2023 | percent | ✓ | **OK** |
| 25 | super_commuters | Super Commuters | B08303_012E+_013E ÷ _001E | 2023 | percent | ✓ | **OK** — correct universe, unlike #17 |
| 26 | no_vehicle | No-Vehicle Households | B08201_002E ÷ _001E | 2023 | percent | ✓ | **OK** |
| 27 | vacation_homes | Vacation Homes | B25004_006E ÷ B25001_001E | 2023 | percent | ✓ | **OK** |
| 28 | mobile_homes | Mobile Homes | B25024_010E ÷ _001E | 2023 | percent | ✓ | **OK** |
| 29 | median_year_built | Median Home Age (Year Built) | B25035_001E | 2023 | year | | **P2** diverging ramp on a sequential variable; `year` format correct (no thousands separator) |
| 30 | mortgage_free | Homes Owned Free & Clear | (B25081_001E−_002E) ÷ _001E | 2023 | percent | ✓ | **OK** (B25081_008E would be more direct) |
| 31 | household_size | Average Household Size | B25010_001E | 2023 | decimal1 | ✓ | **OK** |
| 32 | living_alone | Living Alone | B11001_008E ÷ _001E | 2023 | percent | ✓ | **OK** |
| 33 | hh_with_kids | Households with Children | B11005_002E ÷ _001E | 2023 | percent | ✓ | **OK** |
| 34 | never_married | Never Married | B12001_003E+_012E ÷ _001E | 2023 | percent | ✓ | **OK** — male+female cells correct |
| 35 | divorced | Divorced | B12001_010E+_019E ÷ _001E | 2023 | percent | ✓ | **OK** |
| 36 | non_english | Language Other Than English | (C16001_001E−_002E) ÷ _001E | 2023 | percent | ✓ | **OK** |
| 37 | homegrown | Born in Their State | B05002_003E ÷ B01003_001E | 2023 | percent | ✓ | **OK** |
| 38 | movers | Moved in the Past Year | (B07003_001E−_004E) ÷ _001E | 2023 | percent | ✓ | **OK** |
| 39 | self_employment | Self-Employment Income | B19053_002E ÷ _001E | 2023 | percent | ✓ | **OK** |

Summary (revised by the verification run): **33 OK · 5 denominator/methodology fixes · 1 pull-until-fixed (P0)**. No deprecated codes, no nonexistent codes, no code that doesn't exist in `acs1/2023`, no `survey` override in use (all default to `acs1`), 25 `duel:true` (feeding Arcade Stat Duel and GeoDraft), all 39 `pro:true`.

### Colour ramps (10)

All 10 shared ramps are lightness-monotonic where they should be and diverging where they should be, and all survive dichromacy on lightness alone. Minimum adjacent-step ΔE under deuteranopia: Orange 8.5, Teal 9.1, Grey 9.8, Green 10.8, Blue 12.1, Purple 12.3, Red 13.7, Orange-Purple 14.9, Brown-Green 18.5, Red-Blue 20.2. **No ramp fails the colour-blindness test under deuteranopia.** The verification run reproduced
these deuteranopia figures independently (Viénot LMS simulation + CIE-Lab ΔE, `work/data/V8-ramps.mjs`)
and they match to one decimal place. It also added a **protanopia** column, which the first run did
not compute:

| ramp | lightness-monotonic | min ΔE normal | min ΔE deuteranopia | min ΔE **protanopia** |
|---|---|---|---|---|
| Teal | yes | 10.1 | 9.1 | **6.7** |
| Blue | yes | 12.6 | 12.1 | 12.4 |
| Red | yes | 15.4 | 13.7 | 9.4 |
| Green | yes | 11.4 | 10.8 | 10.8 |
| Orange | yes | 16.2 | 8.5 | 10.8 |
| Purple | yes | 11.8 | 12.3 | 12.4 |
| Grey | yes | 9.8 | 9.8 | 9.8 |
| Red–Blue | no (diverging — correct) | 21.1 | 20.2 | 19.4 |
| Brown–Green | no (diverging — correct) | 18.8 | 18.5 | 18.8 |
| Orange–Purple | no (diverging — correct) | 21.7 | 14.9 | 20.2 |

All seven sequential ramps are strictly lightness-monotonic and all three diverging ramps are
correctly non-monotonic, so every ramp stays readable on lightness alone. **[P3] Teal is the weakest
link at ΔE 6.7 under protanopia** — adjacent classes become genuinely hard to separate on small
states. Teal is a *recommended* ramp and the brand accent family, so it is the one most likely to be
chosen. Widening its two lightest steps would fix it. The failure is entirely in the ramp-vs-stroke interaction (P2 above). Per-dataset default `colorScale` values are also all monotonic except `median_year_built` (P2).

---

## Ideas — what a ground-up rebuild should do differently

1. **Make the transport layer UTF-8 native and typed.** The `btoa` P0 is what happens when share state is an ad-hoc base64 blob. A versioned, compressed, UTF-8-safe codec (e.g. `TextEncoder` + LZ-string + a `v` field) with a single `serialize/deserialize` pair — and *county colours, the active dataset id and the ramp id inside it* — removes five separate findings at once, including the county-share data loss and the inability to reproduce a data map from a link.

2. **Give a dataset a declared universe, not just a variable list.** Every P0/P1 arithmetic bug here is a numerator and a denominator drawn from different ACS universes. If a dataset declared `{numerator: {...}, denominator: {table: 'B17001', line: '001'}}` and a build-time check asserted that both belong to the same table (or to a whitelisted cross-table pair with a written justification), `commute_time`, `poverty`, `disability` and `unemployment` would all have been caught before shipping. A tiny fixture test that compares each computed national aggregate to the Census's own published national figure would catch the rest.

3. **Make "no data" a first-class colour.** Missing states should never inherit a previous fill and should never share a value-range with the ramp. One `NO_DATA` swatch, always rendered as a distinct hatch, always present in the legend when `coverage < 51`, with the count shown persistently rather than in a toast.

4. **Every import must produce a reconciliation report, not a toast.** "N rows in → M states coloured → here are the K rows we couldn't use, and why." Silence is what makes the four CSV findings dangerous; the parsing itself is already decent. Show the parsed table back to the user before applying, with the state column, the value column and the unmatched rows highlighted — a preview step turns all four silent-loss bugs into visible ones.

5. **Derive the stroke and label colours from the fill, not from the theme.** A single `contrastOn(fill)` helper used by state borders, county borders and abbreviation labels makes all 10 ramps legible in all 16 themes, fixes the illegible labels over dark ramp ends, and removes the whole class of "looks fine in Midnight, unreadable in Mint" bug.

6. **Type the legend formatter off the data, not off a string enum.** `format: 'number' | 'currency' | 'percent' | 'decimal' | 'decimal1' | 'year'` already needed six branches and still produces "0 – 0" and "23 – 23". A formatter that takes `(min, max, kind)` and picks its own precision from the range handles fractional CSV data, median age, commute minutes and Gini with one code path.

7. **Sequential vs diverging should be a property of the measure, not a per-dataset colour array.** Tag each dataset `sequential | diverging | cyclical`; refuse to render a diverging ramp without an anchor value, and refuse to render a change measure with a sequential ramp. That is the single most valuable cartographic guardrail for a product whose users aren't cartographers.

8. **Budget the county view as its own render target.** It currently reuses the state SVG, the state legend, the state logo anchor and the state legend-position constants, and all four are wrong for it. Given it is a paid feature, a dedicated county renderer with its own fit, its own label-density policy (label the largest N that fit; tooltip the rest) and its own legend would be a genuinely better product than the state map with a different viewBox.
