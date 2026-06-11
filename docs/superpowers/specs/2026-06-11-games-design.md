# Tappymaps Games — Locked Roster & Design Bar

**Date:** 2026-06-11 · **Status:** LOCKED with Max (conversation 2026-06-11)

This is the canonical Arcade game list. GeoDraft sits **above** this roster as the
marquee strategy game — its improvement plan is a separate doc
(`2026-06-11-geodraft-improvement-design.md`).

## The two shared mechanics

Every Arcade game uses one of two input pillars:

1. **Locate & Tap** — prompt given, find it on a full visible map. (The original
   engine: Find the State, Shape ID, Capitals.)
2. **Recall & Fill** — the map starts blank (or shows only an origin state) and
   **fills in as the player names correct answers**. Input is a search bar with
   autocomplete (primary) or multiple choice (Casual difficulty). This flips
   visual lookup into recall: you can't read the answer off the map, and wrong
   guesses are forgiving by construction (they just don't paint). Max's design,
   2026-06-11. Shared component to build: blank-canvas renderer (faint ghost
   outline for orientation, regional zoom with padding) + autocomplete search
   input + fill-on-correct animation.

## Locked roster (12 games)

### Recall & Fill family
| Game | Status | Notes |
|---|---|---|
| Neighbor Challenge | rebuild | Origin state alone on a blank regional map; name its neighbors, they fill in. First consumer of the shared component. |
| Speed Run | upgrade | Blank USA assembles itself as you name all 50. The most shareable use of the mechanic. |

### Locate & Tap
| Game | Status |
|---|---|
| Find the State (Classic + Shuffle) | built |
| State Shape ID | built |
| State Capitals | built |
| Alphabet Race (tap a state per letter A–Z) | new, no data needed |

### Stat Duel family (shared `kind:'duel'` engine + reveal)
| Game | Status | Notes |
|---|---|---|
| Stat Duel | built | Pick the higher of 2 on a real ACS stat. |
| Distance Duel | new | "Which is closer to {anchor} — X or Y?" Centroid distance as the value function. |
| Rank It | new | 4 states, tap high→low on a metric; reveal animates true order. |

### Content-gated (build shell, then author JSON)
| Game | Content needed |
|---|---|
| City-to-State | ~150 curated famous cities |
| Mystery State | ~200-clue bank, progressive difficulty |
| Data Detective | MCQ banks over existing data-map datasets |

## Cut (with reasons, so we don't relitigate)
- **Region Builder** — dropped by Max 2026-06-11 (Recall & Fill's region play is
  covered by Neighbor Challenge + Speed Run).
- **Flag Match** — state flags are near-identical blue seals; frustrating.
- **Compass Call** — diagonal neighbors make answers ambiguous.
- **Statehood Timeline** — pure memorization, punishing, low replay.
- **Capital Match Blitz** — redundant with State Capitals, not map-tap.
- **Odd One Out** — shared-attribute fairness problem.
- *(Distance Duel and Ranking were cut, then rescued in redesigned form above.)*

## Quality bar (applies to every game)
Forgiving feedback (wrong answers never hard-end a run) · difficulty via label
toggle · fat tap-zones for small states (zoom is mandatory, `makeMapZoom`) ·
consistent scoring + medals · seeded share URLs (`?seed=`, `?mode=`) · orange
games accent `#F97316` · own SVG from cached topology, zero contact with
`#mapContainer` / `captureMapImage` / Block 1.

## Build order
1. Recall & Fill shared component (unblocks 2 games)
2. Neighbor rebuild → Speed Run upgrade
3. Stat Duel family: Distance Duel + Rank It
4. Alphabet Race
5. Content-gated three (shell + author JSON banks)
6. Quality pass on the built four
