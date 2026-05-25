# Tappymaps Handover

> **If you're a new Claude session: read this first.** Then read `.claude/CLAUDE.md` for technical context, then the design + plan docs in `docs/superpowers/`. This file is the live "where are we, what's next" pointer — updated at session boundaries.

---

## Where we are right now (2026-05-25)

**Production:** https://tappymaps.com — live, stable, auto-deploys on every push to `master` via Vercel.

**Reimagining status:**
- **Phase 0 (Foundation + Audit Fixes)** — SHIPPED 2026-05-24. All 10 punch-list items live. See "Recent commits" table below.
- **Tester mode** — LIVE since 2026-05-23. Auth UI hidden, access code `tap26` unlocks Pro. REMOVE BEFORE PUBLIC LAUNCH.
- **Source field autofill defeat** — LIVE since 2026-05-25. Three-layer fix (HTML + CSS + JS) prevents Chrome from autofilling the user's email into the Source citation field.
- **Phase 1 (Mode router + Hub + Create rebuild)** — DESIGN APPROVED 2026-05-25. Implementation plan NOT YET WRITTEN.

**Your next action:** Invoke `superpowers:writing-plans` to convert the Phase 1 design spec into a task-by-task implementation plan. Then dispatch via `superpowers:subagent-driven-development` (the pattern that worked for Phase 0).

---

## Phase 1 — ready to plan

**Design spec:** `docs/superpowers/specs/2026-05-25-tappymaps-phase-1-implementation-design.md` (commit `8dd2f5c`)

**Scope locked during brainstorm (2026-05-25):**
- Full Phase 1 atomically (router + Hub + Create rebuild together, not split into 1a/1b)
- Routing via History API + Vercel rewrites (clean URLs, real per-route SEO)
- Hub sub-mode previews: static text + links (no backend dependencies)
- Migration: clean rebuild of editor presentation, keep underlying logic untouched
- Testing: continue Phase 0 pattern (`_validate.py` + chrome-devtools-mcp probes), no new test framework
- Coexistence: none — atomic deletion of old markup in cleanup commit

**Key architectural decision baked into the plan:** Tasks 3-14 add new code with new mode divs `display:none` and Router defined but NOT auto-dispatching. Task 15 (cleanup + activation) atomically deletes old markup AND adds the `addEventListener('DOMContentLoaded', Router.dispatch)` line. Every commit before that is safely dormant in production.

**To start Phase 1 implementation:**
1. Read the spec at `docs/superpowers/specs/2026-05-25-tappymaps-phase-1-implementation-design.md`
2. Invoke `superpowers:writing-plans`
3. It produces `docs/superpowers/plans/2026-05-XX-tappymaps-phase-1.md` (~15 tasks)
4. Invoke `superpowers:subagent-driven-development` to execute task-by-task

---

## Recent commits (latest 25, newest first)

| SHA | Message | Phase |
|---|---|---|
| `8dd2f5c` | docs(reimagining): add Phase 1 implementation design spec | Phase 1 design |
| `187cad1` | fix: kill Chrome autofill chip on Source field (readonly + CSS overlay) | Polish |
| `decaf8c` | fix: actually clear autofilled email Source (drop broken guard, add input listener) | Polish |
| `aa0fa64` | test: auto-grant Pro in TESTER_MODE so testers see full app | Tester mode |
| `9afa442` | fix: actively clear Source field if Chrome autofills it with an email | Polish |
| `c5f8461` | fix: stop browser autofill from prefilling email in Source field | Polish |
| `a1acb4a` | test: add TESTER_MODE + tap26 access code, hide auth UI | Tester mode |
| `7136308` | docs: mark Phase 0 of reimagining complete in HANDOVER | Phase 0 docs |
| `86ed0c1` | seo: add basic head tags, OG/Twitter cards, and h1 element | Phase 0 Task 8 |
| `77e8b99` | fix: stop firing dead Supabase analytics request on every page load | Phase 0 Task 7 |
| `36be1b0` | fix: close ~270px portrait wasted band between map and palette | Phase 0 Task 6 |
| `490cfb9` | fix: scroll onboarding modal within viewport on landscape phones | Phase 0 Task 5 |
| `943e949` | fix: show map title in mobile landscape | Phase 0 Task 4 |
| `1cd8102` | brand: keep logo visible in exports (spec §9: mandatory for everyone) | Phase 0 Task 2A |
| `997ade4` | brand: remove Show Logo toggle entirely, logo always visible | Phase 0 Task 3 |
| `1362cbc` | brand: update logoWatermark comment to match new scale + drop TaC ref | Phase 0 Task 2 followup |
| `6258a4e` | brand: drop diagonal text watermark, enlarge pin+wordmark logo | Phase 0 Task 2 |
| `8f7e685` | docs(reimagining): add Phase 0 implementation plan | Phase 0 plan |
| `5e62f6d` | docs(reimagining): add full design spec + gitignore .superpowers/ | Reimagining design |
| `8960c8c` | docs: add public README and remove email from HANDOVER | Repo polish |
| `d1df68a` | HANDOVER.md: mark four "known issues" as resolved | Pre-Phase-0 |
| `dd9fcad` | Workspace cleanup: gitignore session-context files, rewrite CLAUDE.md | Pre-Phase-0 |
| `fe16b1d` | Undo coverage + legend cap for config/CSV import | Pre-Phase-0 |
| `1ed6036` | Stripe API hardening: priceId allowlist + dead import strip | Pre-Phase-0 |
| `f9f260b` | Mobile portrait: render legend inline below the map | Pre-Phase-0 |

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
- **Mobile architectural rot** — some mobile handlers may still target desktop-only DOM. Phase 1's unified 5-panel rail (one IA at all sizes) closes this entire category, so don't bother spot-fixing individual cases.
- **Form-label a11y fixes** — live audit found 5 form fields missing `<label>` elements. Phase 1's Create rebuild handles this.
- **`.gitattributes` for line endings** — CRLF/LF warnings fire on every edit on Windows. Cosmetic, doesn't affect deploys. Add a `.gitattributes` whenever someone gets tired of the warnings.
- **Analytics rewire** — the old Supabase project at `qbhqdicppoahhvnuvcwd.supabase.co` is dead. Phase 0 no-op'd the network call. Phase 1 rewires writes to the new project (whichever lands the gallery + game_scores tables in Phase 4).

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

**Stack:** Vanilla JS (no framework, no build step), Vercel + Supabase + Stripe backend, single `index.html` (~7,500 lines). See `.claude/CLAUDE.md` for the full technical context including Critical Patterns (captureMapImage, updateLegendPosition, history/undo), Mobile UX architecture, Theme system, Data maps, Templates.

**Brand:** Part of Mapparatus Organization. Tappymaps (consumer, casual) ↔ Mapzimus (editorial brand for viral content) ↔ Mapparatus (future pro GIS tool). Primary turquoise `#0EA5E9` for Design contexts, orange `#F97316` for Games. Outfit Bold headings, Instrument Sans body, Geist Mono code.

**The reimagining:** A full product reimagining was designed + spec'd 2026-05-23. Phase 0 (audit fixes) shipped. Phase 1 (mode router + Hub + Create rebuild) designed + ready to plan. Phases 2-5 (Arcade games / GeoDraft / Gallery / Distribution) are scoped in the spec but not yet planned in detail. Each phase's design spec is at `docs/superpowers/specs/`; each phase's implementation plan lands at `docs/superpowers/plans/` when ready.

---

## Owner

- **GitHub**: [@mapzimus](https://github.com/mapzimus)
- **Contact**: see README
