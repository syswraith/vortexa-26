# vortexa frontend

React + Vite single-page app. It renders a login/signup page, collects browser
fingerprints (FingerprintJS + ThumbmarkJS), posts them to the backend, and
authenticates users with Supabase.

## Requirements

- [Bun](https://bun.sh) (used for install and scripts)
- A [Supabase](https://supabase.com) project (Project URL + publishable/anon key)
- A backend listening on `http://localhost:3000` exposing `POST /api/auth`

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

The dev server proxies `/api` to `http://localhost:3000`, so run the backend
alongside it. The login page generates fingerprints on load; once ready,
"Log in" and "Create account" do the following:

1. Report the attempt to `POST /api/auth` with this JSON:

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

## Routes

- `/` — login/signup page (fingerprint collection + Supabase auth). Redirects to
  `/demo` when already signed in.
- `/demo` — authenticated welcome page (redirects to `/` when signed out)

## Configuration

- Supabase credentials live in `frontend/.env.local` (see `.env.example`).
- The backend target for the `/api` proxy is set in `vite.config.js`.
- Session tracking SQL lives in `supabase/migrations/`.

## Deploy (Vercel)

The repository deploys as one Vercel project with two services (`vercel.json` at
the repo root): `frontend` (Vite) is public at `/`, and `backend` (Express) is
public under `/api/*`. The backend runs as a Vercel Function and serves its
routes under `/api` (`GET /api/health`, `GET /api/test`).

Set these Vercel environment variables:

- Build (frontend): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Runtime (backend): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

Add the production domain to Supabase under **Authentication → URL
Configuration**, and run `vercel dev` to exercise both services locally.
