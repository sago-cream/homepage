# Homepage

A personal browser homepage for fast bookmark access across browsers with instant search.

![Homepage](https://raw.githubusercontent.com/sago-cream/homepage/main/docs/demo.webp)

## Use

- Set your browser homepage as <https://homepage.hsichen.dev>.
- Press <kbd>Space</kbd> to start searching, and <kbd>Enter</kbd> to
  open.
- Sign in to upload a wallpaper; guests keep the default mountain scene.
- Turn on the map pin in Preferences to follow your location, or turn it off to choose a Taiwan weather and AQI location.

> After combining this with [HandyTab](https://github.com/sago-cream/handy-tab), opening any tabs feels like a breeze.

## Privacy

Core features work without an account. Location tracking is off by default. Enabling the map pin requests browser permission
and remembers the preference; while the homepage is open, it follows movement and
updates the nearest supported Taiwan location. Turning the pin off stops tracking
and keeps the last location available for manual selection. The selected Taiwan location is stored in a same-site cookie for
SSR and mirrored in browser storage with weather/AQI caches. Guest bookmarks stay in
browser local storage; signed-in bookmarks sync to PostgreSQL under the Clerk
account. Wallpaper sync requires sign-in and uses private, authenticated object
storage.

## Development

### Quick Start

Requires Node.js 22+ and Bun.

```bash
git clone https://github.com/sago-cream/homepage.git
cd homepage
bun i
bun dev
```

Weather requires a server-side `CWA_API_KEY` in `.env.local` (see `.env.example`).
Production must set the same variable in the container environment. The key is
never sent to the browser. Weather uses CWA's
[10-minute station observations (O-A0003-001)](https://opendata.cwa.gov.tw/dataset/observation/O-A0003-001),
selecting the nearest WGS84 station with valid observations from the past hour.
Requests are cached for five minutes, with up to 30 minutes of stale weather on
upstream failure. Without a key, the weather metric is omitted.

### Stack Map

- **Runtime:** Bun, Next.js 16 App Router, React 19, TypeScript, Turbopack in dev,
  Node.js standalone server in production.
- **SSR:** Hydrates location, weather, AQI, Clerk state, and signed-in wallpaper.
- **Auth:** Clerk auth
- **Storage:** Standard PostgreSQL for bookmarks and wallpaper metadata; local files
  in development, Cloudflare R2 in production, and Vercel Blob as a migration-only
  compatibility provider.
- **External data:** Taiwan CWA for weather; Taiwan MOENV for AQI.

### Oracle Deployment

Production runs on the Oracle VM behind Caddy. Every push to `main` publishes
`ghcr.io/sago-cream/homepage` for Linux AMD64 and ARM64. Dependencies and standalone
output are built inside the target Linux image, so production never receives
native modules from the development Mac.

Changes reach `main` through a pull request. Deploy from a clean local `main`
that matches `origin/main`; the command waits for that commit's image and asks
the Oracle platform to pull it. It never pushes code:

```bash
bun run deploy
```

The container listens on `0.0.0.0:3102` and exposes `/api/health` for health
checks.

### Persistence

Schema changes are tracked in `migrations/` and never run from an application
request. Set `DATABASE_URL` to any PostgreSQL connection string, then apply and
verify migrations before starting the application:

```bash
bun run db:migrate
bun run db:verify
```

Local wallpaper files are selected with
`WALLPAPER_STORAGE_PROVIDER=local` and default to `.data/wallpapers`. Production
uses `WALLPAPER_STORAGE_PROVIDER=r2` with a private bucket and an R2 API token
scoped to object read/write for that bucket. Configure `R2_ENDPOINT`, `R2_BUCKET`,
`R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`; do not put their values in Git.

During migration, `WALLPAPER_STORAGE_PROVIDER=vercel-blob` remains supported with
the existing Blob token. Metadata is read through provider-neutral object keys,
so the database is ready for copying objects to R2 and switching the provider.
The non-destructive copy, byte-level verification, cutover, and rollback process
is documented in [the persistence migration runbook](docs/persistence-migration.md).
