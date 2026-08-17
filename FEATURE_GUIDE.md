# SLGRVTRS — Feature Guide

> **Live**: https://slgrvtrs.ritz-analytics.workers.dev
> **Updated**: 2026-08-17
> **Phase**: 10 (all features deployed)

---

## Map Visualization

### Choropleth Layers
- **Parliament** (22 seats) — 10 switchable metrics (Total Voters, Male/Female %, Malay/Chinese/Indian/Others %, Mean/Median Age, Contact %)
- **DUN** (56 seats) — 9 metrics with DUN-tuned color scales
- **DM Bubbles** (945 centroids) — proportional circles with race/gender filters

### Visualization Modes
- **Choropleth** (default) — standard color scale based on the active metric
- **Heatmap** — red-orange gradient (light beige → orange → red → dark red) based on the **active metric** (not just total_voters), for both parliament and DUN layers. Legend shows heatmap colors with a "HEATMAP" badge when active.

### Basemaps
- **Light** — soft blue-gray background (#f0f4f8)
- **Dark** — slate-900 background (#0f172a)
- **Satellite** — ESRI World Imagery raster tiles (real terrain visible through choropleth overlay)

### Dark Mode
Full dark mode support across:
- Sidebar (header, search, dropdowns, filters, legend, quick-stats)
- Map popups (parliament, DUN, DM) via CSS specificity overrides
- Drawers (Analytics, AI Insights, Ranking, Bookmarks)
- Map background and layer opacities
- Toast notifications

---

## Interactivity

### Search
- Fuzzy search by Parliament code (P.xxx), DUN code (N.xx), or name
- Click result → flyTo + auto-open popup with full voter statistics
- Press `/` to focus the search bar

### Seat Comparison
- Add up to 3 seats from any popup's "+ Compare" button
- **Comparison Radar Chart** — 6-axis normalized radar (Voters, Malay %, Chinese %, Indian %, Age, Contact %) with dashed state-average overlay
- **Comparison Bar Chart** — grouped race composition bars (Malay/Chinese/Indian/Others %)
- **Comparison CSV Export** — download comparison seats as side-by-side CSV (no password needed)
- Toast notifications on add/duplicate/full

### Bookmarks
- Save constituencies to localStorage (`slgrvtrs:bookmarks`)
- Fly-to on click, remove with trash icon
- Toast notifications on save/remove/duplicate

### Shareable URLs
- Encodes map center, zoom, active metric, and drilled parliament into URL hash
- `#m=total_voters&lng=101.5862&lat=3.2328&z=10.0&p=P.106`
- Restores view on page load (flyTo + metric + drill-down)
- Copies to clipboard with toast notification

### Fullscreen Map
- Toggle button next to sidebar toggle (top-left)
- Press `F` to hide sidebar for maximum map area
- Toast notification on toggle

---

## Data & Analytics

### Analytics Drawer
- 3 KPI cards (Parliaments, DUNs, DMs)
- Ethnic distribution donut (voter-weighted)
- Gender split donut
- Top 5 / Bottom 5 parliaments by active metric (horizontal bars)
- Mean age distribution (ascending bar chart)
- DUN seats per parliament (bar chart)

### AI Insights
- **Powered by**: Cloudflare AI Workers (Llama 3.3 70B, FP8 quantized)
- **Endpoint**: `POST /api/insights`
- 4 insight types: statewide, parliament, DUN, DM
- Returns 3-5 numbered bullet insights with specific numbers and percentages
- Uses Malaysian context (Bumiputera/Melayu, Cina, India)
- Free tier: 10,000 neurons/day (~1,400 insights/day)

### Ranking Table
- Sort all 22 parliaments or 56 DUNs by any of 10 metrics
- Click column headers to sort (asc/desc with arrow indicator)
- Search filter by code or name
- Inline bar visualization showing relative magnitude
- Fly-to button per row

### Data Table Explorer
- Full-screen modal with sortable, filterable table
- 10 columns: Code, Name, Voters, Male %, Female %, Malay %, Chinese %, Indian %, Mean Age, Contact %
- Export CSV (client-side, no password needed)
- Parliament/DUN level toggle
- **Click any row** → fly to that constituency on the map + auto-open popup with voter stats
- Hover shows a location-pin icon (indigo)

### Constituency Detail Card
- Appears at top of Layers tab when a seat is selected
- Shows type badge (PARL/DUN/DM) + code + name
- Mini-stats grid: Voters (K), Malay %, Age
- Quick action buttons: AI Insights, Bookmark
- Clear (✕) button to deselect

### Quick Statistics
- Collapsible panel in sidebar
- Largest/smallest seat by voters
- Statewide averages: Malay %, Chinese %, Indian %, Mean Age, Contact %

---

## Password-Protected Exports (All password: `PAStimenang1`)

All download endpoints use PBKDF2 password hashing (10K iterations via WebCrypto),
verified against the D1 `app_settings` table before returning data.

### Export Endpoints

| Endpoint | Description | Rows |
|----------|-------------|------|
| `POST /api/export/csv` | Parliament/DUN/DM aggregated stats (with filters) | 22 / 56 / 945 |
| `POST /api/export/dm-xlsx` | All 945 DMs sorted by DM code | 945 |
| `POST /api/export/comparison` | User-selected comparison seats (up to 3) | 1-3 |
| `POST /api/export/dm-voters/[dm_code]` | Individual voters per DM (from R2) | ~4,203 avg |

### UI Download Buttons

| Button | Endpoint | Password |
|--------|----------|----------|
| Download CSV (green) | `/api/export/csv` | PAStimenang1 |
| Download All 945 DMs (Sorted) (rose) | `/api/export/dm-xlsx` | PAStimenang1 |
| Download Individual Voters (dark red) | `/api/export/dm-voters/[dm_code]` | PAStimenang1 |
| Export CSV in Data Table (green) | `/api/export/csv` | PAStimenang1 |
| Export CSV in Compare tab (green) | `/api/export/comparison` | PAStimenang1 |

### DUN Filter Options
- **All DUNs (56)** — download all DUNs
- **By Parliament** — filter DUNs by parent parliament
- **By DUN** — filter by specific DUN (dropdown with all 56 DUNs)

### Individual Voter Download
- 945 pre-generated CSV files stored in R2 bucket (`slgrvtrs-tiles/voters/`)
- Each CSV contains individual voter records (Voter_ID, Voter_Code, Gender, Race, Age, DOB, Contact, DM_Code, DUN_Code, Parliament_Code, Locality)
- Average ~4,203 voters per DM, ~821 KB CSV per DM
- Password verified before R2 fetch

---

## UX & Polish

### Onboarding Tour
- 4-step first-visit guided tour (auto-starts after 2.5s)
- Spotlight cutout + tooltip with progress dots
- Steps: Search, Sidebar, Feature Toolbar, Keyboard Shortcuts
- Skip / Back / Next buttons
- Persists completion in localStorage

### Keyboard Shortcuts
Press `?` to open the shortcuts overlay:

| Key | Action | Group |
|-----|--------|-------|
| `/` | Focus search bar | Navigation |
| `1` | Switch to Layers tab | Navigation |
| `2` | Switch to Metrics tab | Navigation |
| `3` | Switch to Compare tab | Navigation |
| `A` | Toggle Analytics drawer | Drawers |
| `I` | Toggle AI Insights panel | Drawers |
| `R` | Toggle Ranking table | Drawers |
| `B` | Toggle Bookmarks menu | Drawers |
| `D` | Open Data Table explorer | Drawers |
| `F` | Toggle fullscreen map | View |
| `T` | Toggle theme (light/dark) | View |
| `S` | Open Share menu | View |
| `Esc` | Close any open drawer/popup | View |
| `?` | Show shortcuts overlay | Help |

### Toast Notifications
4 types with auto-dismiss:
- **Success** (green ✓) — "Added X to comparison", "Bookmarked X", "Exported CSV", "Link copied"
- **Error** (red ✕) — "Failed to copy link"
- **Info** (blue ℹ) — "Metric: Malay %", "Switched to heatmap", "Fullscreen map"
- **Warning** (amber ⚠) — "Comparison is full (max 3 seats)"
- **Info** (blue ℹ) — "Parliament layer on/off", "DUN layer on/off", "DM Bubbles layer on/off"

### Loading State
- Enhanced spinner (w-12 h-12) with pulsing inner circle
- Shimmer skeleton bars (3 lines, varying widths)
- "Loading Selangor Voter Map" + "Loading boundaries & statistics…"

### Responsive Design
- Mobile sidebar auto-collapse (375px tested)
- Vertical toolbar stacking on right edge
- Touch-friendly button sizes (44px+ minimum)
- Drawer full-screen on mobile

---

## Floating Toolbar (8 buttons)

| # | Button | Feature | Shortcut |
|---|--------|---------|----------|
| 1 | 📊 | Analytics drawer | A |
| 2 | 🧠 | AI Insights | I |
| 3 | 📋 | Ranking table | R |
| 4 | 🔖 | Bookmarks menu | B |
| 5 | 📄 | Data Table explorer | D |
| 6 | 🔗 | Share view | S |
| 7 | ☀️/🌙 | Theme & basemap toggle | T |
| — | ❓ | Keyboard shortcuts | ? |

Plus: Fullscreen toggle (F) and Sidebar toggle on the left side.
