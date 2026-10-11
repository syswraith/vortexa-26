# vortexa frontend

React + Vite single-page app. It renders a login/signup page, collects browser
fingerprints (FingerprintJS + ThumbmarkJS), posts them to the backend, and
authenticates users with Supabase.

## Requirements

- [Bun](https://bun.sh) (used for install and scripts)
- A [Supabase](https://supabase.com) project (Project URL + publishable/anon key)
- A backend listening on `http://localhost:3000` exposing `POST /auth`

## Install

```sh
bun install
```

## Configure

Copy the env template and fill it in:

```sh
cp .env.example .env.local
```

`.env.local` (git-ignored):

```
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<your publishable/anon key>
```

In the Supabase dashboard, add `http://localhost:5173` under **Authentication →
URL Configuration** (Site URL and Redirect URLs) so confirmation links work.

## Run (development)

```sh
bun run dev
```

Vite starts on <http://localhost:5173>. Open that URL to see the login page.

The dev server proxies `/auth` to `http://localhost:3000`, so run the backend
alongside it. The login page generates fingerprints on load; once ready,
"Log in" and "Create account" do the following:

1. Report the attempt to `POST /auth` with this JSON:

```json
{
  "action": "login",
  "fp1": "<FingerprintJS visitor id>",
  "fp2": "<ThumbmarkJS id>",
  "email": "user@example.com",
  "password": "…",
  "isBot": false
}
```

2. Authenticate with Supabase (`signInWithPassword` or `signUp`).

`action` is `"login"` or `"create"`. On success the app redirects to `/demo`
via React Router. If email confirmation is enabled, creating an account shows a
"check your email" notice instead; after confirming, the user can log in.
Supabase errors are shown inline.

## Session tracking

Once authenticated, the frontend writes directly to Supabase (RLS-scoped to the
signed-in user):

- **Session** — one `user_sessions` row per login, keyed per user in
  `sessionStorage` (`vortexa.sessionId:<userId>`). The id is reused across page
  reloads in the same tab and cleared on sign-out.
- **Heartbeat** — immediately on session start and then every 10s,
  `last_seen_at` is refreshed for as long as the session is active (no tab
  visibility gate). If the update matches no row, it logs an error so RLS
  misconfiguration is visible instead of silently dropped.
- **Navigation** — a `session_navigation_events` row is inserted per route
  change, deduped by session + path.

Apply the schema and RLS policies from
`supabase/migrations/20260101000000_session_tracking.sql` (Supabase SQL editor or
`supabase db push`). The tables reference `auth.users(id)`.

## Scripts

| Command           | Description                          |
| ----------------- | ------------------------------------ |
| `bun run dev`     | Start the Vite dev server with HMR   |
| `bun run build`   | Build for production into `dist/`    |
| `bun run preview` | Serve the production build locally   |
| `bun run lint`    | Run oxlint                           |

## Deploy (Vercel)

The app is deployed as two separate Vercel projects from this same repository:
one for the frontend (`frontend/`) and one for the backend (`backend/`). The
frontend proxies `/auth` and `/api/*` to the backend via `frontend/vercel.json`,
so the relative `fetch` paths in the source keep working in production.

### 1. Backend project

1. Create a new Vercel project from this repo with **Root Directory** `backend`.
2. Add environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. Deploy, then note the assigned production domain (Project → **Domains**).

### 2. Frontend project

1. Create a new Vercel project from this repo with **Root Directory** `frontend`.
2. Framework preset **Vite** (auto-detected). Build `bun run build` (Bun is
   detected from `bun.lock`) and output directory `dist`.
3. Add environment variables (values from `.env.local`):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. In `frontend/vercel.json`, set the `destination` of the `/auth`, `/auth/:path*`
   and `/api/:path*` rewrites to the backend production domain from step 1.
   Rewrite destinations cannot use environment variables, so this value is
   hardcoded. The bundled `https://vortex-26.vercel.app` is a placeholder.
5. Deploy, then verify:
   - Refreshing a client route such as `/demo` or `/dashboard` returns the app
     (SPA fallback rewrite).
   - Logging in reaches the backend (`/auth`) and the dashboard loads
     (`/api/risk-assessments`).

### 3. Supabase

Add the frontend production URL (e.g. `https://<frontend>.vercel.app`) to
**Authentication → URL Configuration** (Site URL and Redirect URLs) so
confirmation and redirect links resolve to the deployed app.

## Routes

- `/` — login/signup page (fingerprint collection + Supabase auth). Redirects to
  `/demo` when already signed in.
- `/demo` — authenticated welcome page (redirects to `/` when signed out)

## Configuration

- Supabase credentials live in `frontend/.env.local` (see `.env.example`).
- The backend target for the `/auth` proxy is set in `vite.config.js`.
- Session tracking SQL lives in `supabase/migrations/`.
