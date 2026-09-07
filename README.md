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

Core features work without an account. Guest bookmarks and preferences stay in browser storage.
Signed-in bookmarks and private wallpapers sync through Supabase Auth, PostgreSQL, and Storage.
Location tracking is off by default and requests browser permission when enabled.

## Development

Requires Node.js 24 and Bun.

```bash
bun install --frozen-lockfile
bun dev
```

Copy `.env.example` to `.env.local` and configure the Supabase public URL and publishable key.
Weather and AQI require server-only `CWA_API_KEY` and `MOENV_API_KEY` values.
Without the corresponding key, that metric is omitted.

```bash
bun run lint
bun test
bun run build
```

## Deployment

Production runs in the Vercel project `homepage-startup-check` under Hsi's Lab,
serving <https://homepage.hsichen.dev>. The connected `sago-cream/homepage` repository
deploys `main` to production and pull requests to preview deployments.

`vercel.json` configures Next.js, the frozen Bun install, and the custom `dist` build directory.
Set these project environment variables for production and previews:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `CWA_API_KEY`
- `MOENV_API_KEY`

The homepage is pre-rendered and served by Vercel's CDN. A service worker caches
HTML and static assets locally for fast repeat openings. Weather, AQI, authentication,
bookmarks, and wallpapers use separate server endpoints; they do not block the initial HTML.
`/api/health` provides a basic health check.

Cloudflare manages DNS only: the `homepage` CNAME points to Vercel with proxying disabled.
Oracle containers, Caddy routing, Cloudflare Tunnel ingress, and GHCR image builds are no longer used.

Supabase remains the persistent backend. Schema migrations are tracked in `supabase/migrations/`;
apply them separately before deploying code that requires a schema change.
