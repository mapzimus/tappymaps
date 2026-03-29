# Mapparatus

## Project Overview
Mapparatus (formerly Cakemapper) is a client-side web app for creating colored US state and county maps. Users pick colors, click states, build legends, and export publication-ready maps. The long-term vision is a subscription SaaS product marketed through automated social media content.

- **Tagline**: "Simple maps, simple tools"
- **Domain**: mapparatus.org (registered, via Google Domains)
- **Email**: max@mapparatus.org

### Brand Identity
- **Logo**: Hexagon with map pin icon, available in 3 versions: stacked (icon + text below), horizontal (icon left + text right), icon-only
- **Primary color**: Teal (#2B7A8C / dark teal #1D5A6A — extract exact values from logo files)
- **Secondary color**: Lighter teal for gradients/accents
- **Typography**: Serif/slab-serif for "mapparatus" wordmark, clean sans-serif for tagline and UI
- **Tagline**: "simple maps, simple tools"
- **Aesthetic**: Clean, professional, cartographic feel. Teal color palette throughout the app and all marketing materials. The hexagon motif can be used as a design element.
- **Logo files**: 3 versions provided (stacked, horizontal, icon-only) — store in repo as `/assets/logo-stacked.png`, `/assets/logo-horizontal.png`, `/assets/logo-icon.png`
- **Current live site**: https://mapzimus.github.io/cakemapper/ (to be migrated)
- **Repo**: https://github.com/mapzimus/cakemapper (to be renamed)
- **Local path (Windows)**: `C:\Users\mhowe\cakemapper\index.html`
- **Single file**: `index.html` (~2615 lines, all CSS/HTML/JS inline)

---

## Phase 1: Rename & Polish
**Goal**: Rebrand to Mapparatus and fix all known issues so the app is rock-solid.

### Rename Checklist
- [ ] Rename GitHub repo: cakemapper → mapparatus
- [ ] Update GitHub Pages URL or set up custom domain
- [x] Replace all "Cakemapper" / "cakemapper" references in index.html
- [x] Update Pro unlock codes (now: `MAPPRO2026`, `mapparatus`)
- [ ] Update HANDOVER.md in repo
- [x] Update .claude/CLAUDE.md in repo
- [x] Register mapparatus.org domain
- [x] Set up max@mapparatus.org email (via Google Workspace)
- [ ] Point domain to hosting (Vercel — see Phase 3)

### Known Bugs — FIXED
- [x] County tooltips now show "County Name, State" instead of FIPS codes (data has `properties.name`)
- [x] Puerto Rico removed entirely (SVG group, setupPuertoRico function, FIPS entry, region list, abbreviation)
- [x] Small NE state labels (CT, RI, NJ, DE, MD) now use leader lines to offset outside crowded area
- [x] Mobile/responsive layout added (media queries at 900px and 600px breakpoints — sidebar stacks above map)
- [x] DC tooltip now shows "District of Columbia (DC) — not colorable"
- [x] index_b64.txt deleted from repo

### Polish Priorities
- [x] **Restyle to brand colors**: All `#667eea` purple/blue accents replaced with teal (#2B7A8C primary, #3A9BB0 hover, #1D5A6A dark). Only remaining `#667eea` is in the user-facing color palette array (intentional — it's a usable paint color).
- [x] Responsive/mobile layout (breakpoints at 900px and 600px)
- [ ] Smooth onboarding UX (first-time user should understand the app in 10 seconds)
- [ ] Performance audit (~2600-line single file may need modularization eventually)

---

## Phase 2: Subscription & Auth
**Goal**: Implement tiered access so the app can generate revenue.

### Pricing
| Tier | Monthly | Annual | Annual Savings |
|------|---------|--------|----------------|
| **Free** | $0 | $0 | — |
| **Pro** | $5/mo | $48/yr | 20% |
| **Enterprise** | $20/mo | $150/yr | 38% |

### Feature Matrix
| Feature | Free | Pro | Enterprise |
|---------|------|-----|------------|
| **Map Creation** | | | |
| State-level coloring (50 states + DC) | ✓ | ✓ | ✓ |
| County-level view | — | ✓ | ✓ |
| State zoom (individual state maps) | — | ✓ | ✓ |
| **Colors & Styling** | | | |
| Curated palette (12 colors) | ✓ | ✓ | ✓ |
| Full palette (24 colors) + custom hex | — | ✓ | ✓ |
| Custom saved palettes | — | — | ✓ |
| **Text & Display** | | | |
| Title | ✓ | ✓ | ✓ |
| Subtitle | — | ✓ | ✓ |
| Legend builder | — | ✓ | ✓ |
| Ocean background, north arrow, scale bar | — | ✓ | ✓ |
| Dark/light theme | ✓ | ✓ | ✓ |
| **Export** | | | |
| PNG export | 3/month | Unlimited | Unlimited |
| SVG export | — | ✓ | ✓ |
| "Made with Mapparatus" watermark | Always | None | None |
| Bulk export | — | — | ✓ |
| White-label exports (no branding) | — | — | ✓ |
| **Tools** | | | |
| Quick fill by region | — | ✓ | ✓ |
| Undo | 1 step | Unlimited | Unlimited |
| Shareable URLs | — | ✓ | ✓ |
| Save/load map configs | — | ✓ | ✓ |
| Templates | — | ✓ | ✓ |
| **Business** | | | |
| API access | — | — | ✓ |
| Embed licensing | — | — | ✓ |
| Priority email support | — | — | ✓ |

### Design Decisions
- **No CSV/data import** — Mapparatus is a visual map builder, not a data viz tool. Data import is out of scope.
- **No GeoJSON/CSV export** — Removed. PNG and SVG cover all real use cases.
- **Free tier = marketing engine** — Every watermarked export is an ad. 3 exports/month is enough for casual users but pushes regular users to Pro.
- **State zoom as Pro gate** — Instagram content features state-specific county maps, driving viewers to the site where they hit the Pro wall immediately.

### Tech Decisions
- **Hosting**: Migrate from GitHub Pages → Vercel (free tier, supports serverless functions)
- **Auth**: Supabase or Clerk (both have generous free tiers, handle OAuth/email login)
- **Payments**: Stripe Checkout + Stripe Billing for subscriptions
- **No backend rewrite needed**: Auth and payment verification can be handled via serverless API routes on Vercel. The app itself stays client-side.
- **Export tracking (free tier)**: localStorage counter for 3/month PNG limit. No account required for free users.

---

## Phase 3: Hosting & Domain Setup
**Goal**: Get mapparatus.org live on Vercel with the app deployed.

### Steps
- [x] Register mapparatus.org
- [ ] Create Vercel project, connect to GitHub repo
- [ ] Configure custom domain in Vercel dashboard
- [ ] Set up SSL (automatic with Vercel)
- [ ] Configure DNS (nameservers or CNAME to Vercel)
- [x] Set up email (max@mapparatus.org via Google Workspace)
- [ ] Verify GitHub Pages redirect or sunset old URL

---

## Phase 4: Social Media Content Engine
**Goal**: Build an automated pipeline that generates maps and posts them to social media to drive traffic to mapparatus.org.

### Platform Strategy
| Platform | Why | Handle |
|----------|-----|--------|
| Instagram | Visual-first, map content performs well, reels/carousels | @mappratus (mapparatus was taken) |
| TikTok | Short-form video of maps being built, huge organic reach | @mapparatus |
| X / Twitter | Data viz community is very active, easy API for posting | @mapparatus |
| Pinterest | Evergreen map content gets long-tail search traffic | @mapparatus |
| Reddit | Post to r/MapPorn, r/dataisbeautiful (manual, not automated) | u/mapparatus |

### The Idea Database
A structured collection of map ideas, each with:
```json
{
  "id": "001",
  "title": "Most Popular Pizza Chain by State",
  "category": "food",
  "data_source": "manual / survey aggregation",
  "data_availability": "easy",
  "virality_score": "high",
  "caption_hook": "Your state's favorite pizza chain might surprise you",
  "hashtags": ["#maps", "#pizza", "#dataviz", "#mapparatus"],
  "colors_needed": 5,
  "controversy_level": "medium",
  "status": "draft"
}
```

**Idea Categories**:
- Food & drink (chains, regional dishes, alcohol preferences)
- Sports (team fandom, championships, athlete origins)
- Politics & elections (results, turnout, policy positions)
- Economics (income, rent, cost of living, unemployment)
- Culture (slang, accents, music, religion)
- Demographics (population, migration, age, diversity)
- Geography & nature (weather, disasters, wildlife, terrain)
- Crime & safety (FBI UCR data, gun laws, drug laws)
- Education (test scores, college enrollment, school funding)
- Health (obesity, life expectancy, insurance, CDC data)
- Internet & tech (search trends, broadband access, app usage)
- Trivia & fun (state mottos, weird laws, celebrity birthplaces)

**Key principle**: The best-performing maps trigger regional pride or debate. "Wait, MY state does that?" content drives comments and shares.

### Map Idea Rules

**Legend constraints:**
- Max 5–7 legend entries per map
- Yes/No binary maps (2–3 entries) are valid and often the most shareable
- Choropleth-style tier maps work (e.g. Low / Medium / High) but state assignment is manual so buckets need to be obvious
- Category maps with distinct groups work well up to 7

**Data rules:**
- Must be backed by real, citable data
- Source should be listed in every map's comments
- AI must be able to assign all 50 states confidently — anything ambiguous gets flagged as "Medium" confidence

**Format rules:**
- Every idea should have states pre-assigned per legend entry
- Single-state callout maps are a separate high-value format — one weird state highlighted, 49 grey, caption does the work

**Shareability filters:**
- Humor, regional identity, and debate bait outperform purely informational maps
- Binary maps work because they're instant and force people to pick a side
- Single-state callouts work because the "wait, really?" reaction drives reshares

### Automation Pipeline
```
1. IDEA SELECTION
   AI picks an idea from the database → checks data availability

2. DATA GATHERING
   AI fetches/compiles state-by-state data from public sources
   (Census, BLS, BEA, USDA, CDC, FBI UCR, Wikipedia, etc.)

3. MAP GENERATION
   AI uses Mapparatus programmatically:
   - Assigns colors based on data categories or gradient
   - Sets title/subtitle
   - Builds legend
   - Configures display options

4. EXPORT
   Exports as PNG (for Instagram/social) and SVG (for website gallery)

5. CAPTION & HASHTAGS
   AI writes engaging caption with hook + data source credit
   Generates platform-specific hashtag sets

6. POSTING
   Posts to Instagram via Meta Graph API (requires Business account + app review)
   Posts to X via Twitter API v2
   Posts to TikTok (video format — may need map-building animation)
   Posts to Pinterest via Pinterest API

7. ANALYTICS
   Track engagement per post to refine idea selection over time
```

### Prerequisites for Automated Posting
- **Instagram**: Meta Business account → Meta Developer app → Instagram Graph API → App Review for `instagram_content_publish` permission. This takes 1-4 weeks for approval.
- **X / Twitter**: Developer account → API v2 access (free tier allows posting). Straightforward.
- **TikTok**: TikTok Developer account → Content Posting API. Requires app review.
- **Pinterest**: Pinterest Developer account → API access. Relatively easy.

---

## Phase 5: Growth & Iteration
**Goal**: Use analytics to refine content, grow audience, convert followers to paid users.

- Track which map topics get the most engagement
- A/B test caption styles, color schemes, posting times
- Add "Made with Mapparatus" watermark + link on all social posts
- Create a gallery page on mapparatus.org showing all generated maps
- SEO: each map becomes a page (e.g., mapparatus.org/maps/pizza-chains-by-state)
- Consider adding world maps, election maps, or custom geography as premium features

---

## Architecture (Current)
Everything lives in one HTML file. No build tools, no framework.

**External dependencies** (CDN):
- `topojson-client@3` — TopoJSON parsing
- `html2canvas` — PNG export

**Map data**: `us-atlas@3` (pre-projected Albers USA)

**SVG setup**: viewBox `-20 -30 1010 710`, statesGroup has `transform="translate(5, -20) scale(0.95)"`

### Critical Technical Gotchas
1. **statesGroup transform**: `translate(5,-20) scale(0.95)` is critical. County view resets it to `''` and restores on exit. Forgetting to restore breaks all label positions.
2. **Color via style.fill**: CSS `.state-path` sets default fill. Coloring MUST use `element.style.fill` (inline style). `setAttribute('fill')` will NOT work.
3. **Puerto Rico**: REMOVED. PR SVG group, `setupPuertoRico()` function, FIPS entry, abbreviation, and all PR references have been deleted.
4. **DC**: Non-colorable by design. Uses `nonColorable` Set. Excluded from click listeners, Select All, region fills, Invert, and stats count. Tooltip shows "not colorable" note. Label hidden via `labelOffsets` `hide: true`.
5. **Ocean background**: CSS class (`ocean-on`) on map-container, NOT an SVG rect. Prevents visible partition lines.
6. **Git on Windows CMD**: Commit messages with spaces break. Write message to file, use `git commit -F filename`, then delete.
7. **GitHub Pages caching**: Hard refresh (Ctrl+Shift+R) after deploy. Deploys take ~15-30 seconds.
8. **Scale bar**: Text extends +14px below bar's y position. Max y for bottom positions is 645.
9. **SVG namespace for dynamic content**: `innerHTML` on SVG `<g>` elements creates children in the HTML namespace, breaking rendering and export. Use the `setSVGContent()` helper which creates a temp `<svg>` element for proper namespace parsing.
10. **Label positioning**: Labels use bbox center (`getBBox()`) with manual offsets in `labelOffsets`. Do NOT change these values — they are hand-tuned and locked in.

### Label Offsets (LOCKED — do not modify without visual verification)
These offsets are applied to the bbox center of each state path. Values are in SVG coordinate units.
```javascript
const labelOffsets = {
  'District of Columbia': { hide: true },
  // Leader line states (small NE states — label placed outside with connecting line)
  'Delaware': { dx: 30, dy: 4, leader: true },
  'New Jersey': { dx: 0, dy: 0 },
  'Connecticut': { dx: 24, dy: 6, leader: true },
  'Rhode Island': { dx: 28, dy: 0, leader: true },
  'Maryland': { dx: 28, dy: 10, leader: true },
  // Irregular shapes that need nudging from bbox center
  'Michigan': { dx: 18, dy: 30 },
  'Florida': { dx: 46, dy: -5 },
  'Louisiana': { dx: -10, dy: 0 },
  'Virginia': { dx: 5, dy: 0 },
  'Massachusetts': { dx: 5, dy: -2 },
  'New York': { dx: 5, dy: 0 },
  'Oklahoma': { dx: 5, dy: 2 },
  'Idaho': { dx: 0, dy: 14 },
  'New Hampshire': { dx: 0, dy: 6 },
  'Alaska': { dx: 16, dy: -12 },
  'Hawaii': { dx: 5, dy: 0 },
  'Arizona': { dx: 18, dy: 0 },
  'Oregon': { dx: 0, dy: 8 },
  'Indiana': { dx: 0, dy: -15 },
  'Mississippi': { dx: 12, dy: 0 },
  'Missouri': { dx: -10, dy: 0 },
  'Minnesota': { dx: -8, dy: 0 },
  'Montana': { dx: 15, dy: 0 },
  'California': { dx: -8, dy: 0 },
};
```

### Key Code Sections (line numbers approximate — may shift with edits)
| Section | Description |
|---------|-------------|
| CSS styles (~7-860) | All styling, dark/light mode, sidebar, map, modals, responsive media queries |
| Sidebar HTML | Controls: palette, legend, display, quick fill, export |
| SVG + map HTML | SVG element, statesGroup, north arrow, scale bar (PR group removed) |
| Modals | Upgrade, county select, clear confirm |
| appState | Central state object with all app data |
| init/loadUSMap | Initialization and TopoJSON loading |
| fipsToState | FIPS code to state name mapping (50 states + DC, no PR) |
| renderStatesFromTopology | Main render with centroid labels + leader lines for NE states |
| Color/interaction | Palette, click handlers, tooltips (DC shows "not colorable") |
| Legend | Legend builder and display |
| Quick fill | Select all, regions, invert, clear |
| URL state | Base64 encode/decode for shareable URLs |
| Export | PNG, SVG export |
| County view | Pro county mode with zoom, county tooltips show "Name County, State" |
| Event listeners | All UI event bindings incl. leader line toggle |

---

## Commit History
```
818b4b7 Rebrand to Mapparatus: tier system, state zoom, remove PR/CSV, professional polish
(pending) Phase 1 bug fixes: county tooltips, remove PR, NE labels, responsive, DC tooltip, brand colors
7f3dded Fix WA/MA labels, remove background partition by moving ocean to CSS
a834229 Remove basemap, fix label centering with geometric centroids
8ad52e2 Make DC non-colorable and fix count to 51
1ced28e Fix basemap with real geographic data and fix state count text
1cb2a15 Fix county view centering, scale bar clipping, PR label, and UI bugs
4794192 Make Puerto Rico larger and more visible on the map
b4270a6 Add county view, CSV import/export, basemap, Puerto Rico, more exports
5f38b81 Fix MD/DE labels, UI polish
dc29f93 Label contrast, NE cluster fix, remove DC, hide subtitle, better hover
da37b1e Fix FL label, enlarge north arrow and scale bar
e71f4a9 Fix FL label, add north arrow and scale bar toggles
2b6fc60 Add title color, north arrow, scale bar, watermark, fix labels
a60e8f4 Fix export: hide stats bar, prevent AK/HI clipping
987ed29 Fix color fills, label positions, add label toggle
bba059f Fix critical bugs: FIPS mapping, SVG sizing, tooltip shaking, color selection
bd45e26 Initial release of Cakemapper
```

---

## Monthly Cost Estimate (at launch)
| Item | Cost |
|------|------|
| mapparatus.org domain | ~$10/yr |
| Vercel hosting | Free tier |
| Supabase auth | Free tier |
| Stripe | 2.9% + 30¢ per transaction |
| Meta API / X API | Free |
| Google Workspace (email) | ~$7/mo |
| **Total fixed cost** | **~$94/year** |

---

## Owner
- **Name**: Max
- **Email**: max@mapparatus.org (primary), mhowe.gis@gmail.com (personal)
- **GitHub**: mapzimus
