# Tappymaps Handover

> **If you're a new Claude session: read this first.** Then read `.claude/CLAUDE.md` for technical context, then the design + plan docs in `docs/superpowers/`. This file is the live "where are we, what's next" pointer — updated at session boundaries.

---

## Where we are right now (2026-05-29)

**Production:** https://tappymaps.com — live, stable, auto-deploys on every push to `master` via Vercel.

**Reimagining status:**
- **Phase 0 (Foundation + Audit Fixes)** — SHIPPED 2026-05-24. All 10 punch-list items live.
- **Tester mode** — LIVE since 2026-05-23. Auth UI hidden, access code `tap26` unlocks Pro. REMOVE BEFORE PUBLIC LAUNCH.
- **Source field autofill defeat** — LIVE since 2026-05-25. Three-layer fix (HTML + CSS + JS) prevents Chrome from autofilling the user's email into the Source citation field.
- **Phase 1 (Mode router + Hub + Create rebuild)** — SHIPPED 2026-05-29 (cutover commit `619e309`). The editor now lives at `/design/make`; `/` is the Hub. Verified across desktop + mobile portrait/landscape. See the "Reimagining — Phase 1 shipped" section below.
- **Phase 2 (Arcade engine + Find the State)** — BUILT 2026-06-10 on branch `claude/tappymaps-setup-launch-ceiqp1` (draft PR). `/games/arcade` is now a real mode: manifest-driven game shell + the first playable game (Find the State), seeded-share URLs, anon localStorage high scores, hub tile grid. Logic unit-tested against the real source; **needs a real-browser/device pass before merge to `master`** (no headless Chrome in the build env). Writeup: `docs/superpowers/plans/2026-06-10-tappymaps-phase-2-arcade.md`.

**Your next action:** Verify Phase 2 Arcade in a real browser (load `/games/arcade`, play Find the State end-to-end, check timer/toasts/medal/seeded-share). Once green, merge the PR. Then Phase 3 (Distribution: embeds + OG renderer + Devvit) or Phase 4 (Gallery + more games) — each gets its own spec → plan → build. Still open before public launch: remove Tester Mode (`tap26`), wire Arcade sign-in score sync, promote Find the State to landscape-required.

---

## Reimagining — Phase 1 shipped (2026-05-29)

**Design spec:** `docs/superpowers/specs/2026-05-25-tappymaps-phase-1-implementation-design.md` (commit `8dd2f5c`)
**Implementation plan:** `docs/superpowers/plans/2026-05-25-tappymaps-phase-1.md` (commit `b70aa88`)
**Executed via** `superpowers:subagent-driven-development` — fresh subagent per task, two-stage review (spec compliance, then code quality). Shipped as 15 commits `26485ea`→`619e309`.

**What shipped:**
- **Mode router** — `Router` IIFE (grep `const Router = (function()`) dispatches History-API paths to mode handlers (`enter/exit/meta`): `/` → Hub, `/design/make` → Create editor, `/tap-in` → access-code unlock, `/gallery` `/arcade` `/geodraft` `/embed/*` → ComingSoon stub. `vercel.json` rewrites every non-asset path to `/index.html` so deep links resolve; `init().then(Router.dispatch)` activates the router on load.
- **Hub** landing page at `/` — "Tap. Color. Share." + mode cards.
- **Create 5-panel rail** at `/design/make` — Map / Color / Legend / Data / Upgrade (`createPanelMap/Color/Legend/Data/Upgrade`), switched by `switchPanel()`. One information architecture at every viewport size; the old dual desktop-sidebar / mobile-bottom-sheet split is gone from the live UI.
- **Per-route SEO** meta helpers, a **landscape rotate-overlay** for portrait phones on Create, and **legacy `/#<base64>` URLs** that auto-rewrite to `/design/make#<base64>` so old shared links still open.

**What is HIDDEN, not deleted — read this before editing the editor:**
The cutover did NOT delete the legacy markup. It **re-parents** live DOM nodes at runtime and hides the old shell with CSS:
- `body[data-mode] .container { display:none !important }` hides the entire legacy single-page layout whenever a route is active; the same rule hides `.mobile-icon-bar / .mobile-panel / .mobile-panel-backdrop / .mobile-account-menu`.
- On first entry to Create, `setupCreateCutover()` (guarded by `_createCutoverDone`) `appendChild`-moves the whole `#mapContainer` plus the control sections (`secColorPalette / secTemplatesBtn / secDisplay / secProFeatures / secActions / secExport`) into the new panels. Moving a live node preserves its attached listeners, so the editor works with **zero re-wiring**.
- `#mapTitle` (on-map title) STAYS and is mandatory for `captureMapImage()`; a new top-bar `#createMapTitleInput` two-way-syncs with it. `#sourceInput` (desktop, autofill-defeat intact) is the field that lands in the Map panel; `#mobileSourceInput` stays dormant in the hidden mobile markup.
- Net diff was **+155 / −8** (the 8 "deletions" are lines that merely gained `id=` attributes), NOT the ~1000-line delete-and-rebuild the plan originally imagined. Rollback = a single `git revert 619e309`.

**Verified (Task 16 smoke test, production):** `/` Hub renders with legacy hidden; `/design/make` (real SPA-rewrite nav) → editor with map re-parented, 5 rail buttons, 51 states, zero console errors; coloring applies and toggles off cleanly; legacy `/#<hash>` rewrites and restores state. `captureMapImage` + `handleProCodeSubmit` are both global.

**Next:** Phase 2+ (Arcade games / GeoDraft / Gallery / Distribution) — each needs its own design spec → plan → subagent execution. Specs land in `docs/superpowers/specs/`, plans in `docs/superpowers/plans/`.

---

## Recent commits (latest 25, newest first)

| SHA | Message | Phase |
|---|---|---|
| `619e309` | feat(create): atomic cutover to mode router + 5-panel Create rail | **Phase 1 cutover** |
| `2afdb5d` | chore: gitignore _*.md throwaway working docs | Phase 1 |
| `8de928c` | feat(create): add Modes.Create lifecycle + register with Router | Phase 1 Task 13 |
| `4439d0e` | feat(create): wire switchPanel + rail delegate + Upgrade panel handlers | Phase 1 Task 12 |
| `b6e0396` | feat(create): add 5-button rail + 5 panel content templates (skeletons) | Phase 1 Task 11 |
| `e23f7f1` | feat(create): add new Create mode shell with top bar | Phase 1 Task 10 |
| `5016a69` | compat: rewrite legacy /#<base64> URLs to /design/make#<base64> | Phase 1 Task 9 |
| `2a3a76a` | feat(create): add landscape rotate-overlay for portrait phones in Create | Phase 1 Task 8 |
| `d5de931` | feat(router): add data-route click delegate for in-app navigation | Phase 1 Task 7 |
| `17ceb0a` | feat(tap-in): add minimal /tap-in mode with access-code unlock form | Phase 1 Task 6 |
| `ca38224` | feat(hub): add Hub markup + CSS + Modes.Hub registration | Phase 1 Task 5 |
| `11cbf62` | feat(router): add ComingSoon stub + register Gallery/Arcade/GeoDraft/embed | Phase 1 Task 4 |
| `2a9c4f2` | feat(router): add Mode Router IIFE (dormant, no auto-dispatch) | Phase 1 Task 3 |
| `142f26d` | seo: add per-route meta tag helpers (dormant until Router lands) | Phase 1 Task 2 |
| `26485ea` | infra: add vercel.json SPA rewrites for client-side routing | Phase 1 Task 1 |
| `b70aa88` | docs(reimagining): add Phase 1 implementation plan | Phase 1 plan |
| `4becd77` | docs: refresh CLAUDE.md, cartographer agent, HANDOVER.md for new session | Phase 1 docs |
| `8dd2f5c` | docs(reimagining): add Phase 1 implementation design spec | Phase 1 design |
| `187cad1` | fix: kill Chrome autofill chip on Source field (readonly + CSS overlay) | Polish |
| `decaf8c` | fix: actually clear autofilled email Source (drop broken guard, add input listener) | Polish |
| `aa0fa64` | test: auto-grant Pro in TESTER_MODE so testers see full app | Tester mode |
| `9afa442` | fix: actively clear Source field if Chrome autofills it with an email | Polish |
| `c5f8461` | fix: stop browser autofill from prefilling email in Source field | Polish |
| `a1acb4a` | test: add TESTER_MODE + tap26 access code, hide auth UI | Tester mode |
| `7136308` | docs: mark Phase 0 of reimagining complete in HANDOVER | Phase 0 docs |

---

## Active decisions (read these before changing related code)

- **Logo is mandatory on every export for every tier.** No "Show Logo" toggle. No Pro option to remove. Spec §9. Phase 0 commits `6258a4e`, `997ade4`, `1cd8102` enforce this. The cartographer agent's Tribal Knowledge section has the full reasoning.
- **Slogan is "Tap. Color. Share."** (NOT "Tap. Color. Play. Share." — user reversed that during brainstorm). Apply consistently across all surfaces. Games sections get their own framing copy without modifying the slogan.
- **No Tap-or-Crap.** Cut from the spec during brainstorming on 2026-05-25. Gallery (Phase 4) has Recent / Featured / My Maps tabs, no voting, no swipe feed. Don't bring it back.
- **All games are FREE forever.** Notion's product direction was firm: Arcade + GeoDraft are top-of-funnel acquisition surfaces, not Pro revenue. Pro gates exist only in Create + Gallery + Distribution.
- **Single-file HTML deployment stays.** Per the Landing Hub Notion doc: "Don't give this up for architecture theater." The Phase 1 mode router IS still in `index.html` as IIFEs.
- **Mobile-first landscape on Create + GeoDraft.** Spec §2. Rotate-overlay forces phone users into landscape for those modes. Gallery + hub stay portrait-friendly.
- **Tester mode is temporary.** Tagged with `TESTER MODE` comments at 4 locations for grep. Remove before public launch.

---

## Where things live

| What | Where |
|---|---|
| Live app | https://tappymaps.com |
| Repo | https://github.com/mapzimus/tappymaps (`master` branch) |
| Local working copy | `C:\Users\mhowe\tappymaps\` |
| AI context | `.claude/CLAUDE.md` |
| Cartographer subagent (Engineering / Editorial / Automation modes) | `.claude/agents/tappymaps-cartographer.md` |
| Reimagining design spec (full product vision) | `docs/superpowers/specs/2026-05-23-tappymaps-reimagining-design.md` |
| Phase 0 implementation plan | `docs/superpowers/plans/2026-05-23-tappymaps-reimagining-phase-0.md` |
| **Phase 1 design spec (next to implement)** | `docs/superpowers/specs/2026-05-25-tappymaps-phase-1-implementation-design.md` |
| Phase 1 implementation plan | TBD — invoke `superpowers:writing-plans` to create |
| Brand kit (logos, favicons, social assets) | `C:\Users\mhowe\Downloads\tappymaps-brand\` |
| Idea backlog (1500+ map ideas) | `C:\Users\mhowe\Downloads\tappy_ideas_1500` |
| Mapparatus editorial playbook | `C:\Users\mhowe\Downloads\mapparatus-playbook.md` |
| Past viral map exports | `C:\Users\mhowe\Downloads\batch0_hd\`, `batch1_hd\` |
| JS validator helper (gitignored) | `_validate.py` at repo root |
| Brainstorm mockups (gitignored, persist locally) | `.superpowers/brainstorm/` |

---

## Working pattern (validated through Phase 0)

1. **Read** the spec for whatever you're implementing
2. **Brainstorm** if there are open architectural questions (invoke `superpowers:brainstorming`)
3. **Plan** via `superpowers:writing-plans` — produces task-by-task plan in `docs/superpowers/plans/`
4. **Execute** via `superpowers:subagent-driven-development` — dispatches fresh subagent per task with two-stage review (spec compliance, then code quality)
5. **Validate** every JS edit with `python _validate.py` before commit
6. **Push** to `master` triggers Vercel auto-deploy in ~30s

The `_validate.py` helper extracts both inline `<script>` blocks and runs `node --check` on each. Non-zero exit if either fails. Use it.

**Subagent dispatch rules from Phase 0:**
- Each subagent prompt is self-contained — they don't inherit session context
- The auto-mode classifier soft-blocks subagent pushes to `master` — controller (you) pushes after spec + code quality reviews pass
- chrome-devtools-mcp probes are the test pattern for UI changes (no formal test framework wired)

---

## Genuinely open items (Phase 1+ work)

- **Reddit Developer account** — external task for Max. Apply at https://developers.reddit.com/ to reserve the Tappymaps Devvit app name. Takes a few days for approval. Needed for Phase 5 (Distribution).
- **Mobile architectural rot** — RESOLVED in the live UI by Phase 1: the unified 5-panel rail is the only editor IA at all sizes, and the legacy mobile bottom-sheet chrome is hidden whenever a route is active (`body[data-mode] .mobile-* { display:none }`). Caveat: the rotted handlers still EXIST in the file — the cutover *hid* the markup, it didn't delete it, so they're dead-but-present. A future cleanup could delete the dormant mobile IIFE; harmless where it is.
- **Form-label a11y fixes** — STILL OPEN; NOT closed by Phase 1. The cutover re-parented the existing control nodes rather than rebuilding the form markup, so fields that lacked `<label>` elements before still lack them (the audit flagged ~5). Needs a dedicated pass: re-audit the live `/design/make` panels and label the real, now-relocated inputs.
- **`.gitattributes` for line endings** — CRLF/LF warnings fire on every edit on Windows. Cosmetic, doesn't affect deploys. Add a `.gitattributes` whenever someone gets tired of the warnings.
- **Analytics rewire** — STILL OPEN. The old Supabase project at `qbhqdicppoahhvnuvcwd.supabase.co` is dead; Phase 0 no-op'd the network call. Analytics was NOT in Phase 1 scope. Rewire writes to the new project whenever the gallery + game_scores tables land (Phase 4).

---

## Quick-start commands

```powershell
# Pull latest
Set-Location C:\Users\mhowe\tappymaps
git pull origin master
git status --short --branch

# Local dev (static)
python -m http.server 8000
# → http://localhost:8000

# Local dev (with API routes for Stripe webhook testing)
npx vercel dev

# Validate JS syntax before commit
python _validate.py

# Commit + push (auto-deploys to tappymaps.com)
git add <files>
git commit -m "..."
git push origin master
```

---

## Project context summary (for new Claude sessions)

Tappymaps is a single-file HTML/CSS/JS web app at https://tappymaps.com. Users tap US states, build legends, and export publication-ready maps. Free tier with watermark + 3 exports/month; Pro tier at $5/mo or $48/yr unlocks unlimited exports + 22 Census ACS data maps + 10 color ramps + county view + custom labels.

**Stack:** Vanilla JS (no framework, no build step), Vercel + Supabase + Stripe backend, single `index.html` (~9,400 lines, plus a client-side mode router as of Phase 1). See `.claude/CLAUDE.md` for the full technical context including the Mode Router (Phase 1), Critical Patterns (captureMapImage, updateLegendPosition, history/undo), Mobile UX architecture, Theme system, Data maps, Templates.

**Brand:** Part of Mapparatus Organization. Tappymaps (consumer, casual) ↔ Mapzimus (editorial brand for viral content) ↔ Mapparatus (future pro GIS tool). Primary turquoise `#0EA5E9` for Design contexts, orange `#F97316` for Games. Outfit Bold headings, Instrument Sans body, Geist Mono code.

**The reimagining:** A full product reimagining was designed + spec'd 2026-05-23. Phase 0 (audit fixes) shipped. Phase 1 (mode router + Hub + Create rebuild) designed + ready to plan. Phases 2-5 (Arcade games / GeoDraft / Gallery / Distribution) are scoped in the spec but not yet planned in detail. Each phase's design spec is at `docs/superpowers/specs/`; each phase's implementation plan lands at `docs/superpowers/plans/` when ready.

---

## Owner

- **GitHub**: [@mapzimus](https://github.com/mapzimus)
- **Contact**: see README
