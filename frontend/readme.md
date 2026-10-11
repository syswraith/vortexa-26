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

`action` is `"login"` or `"create"`. On success the app navigates to `/demo`.
If email confirmation is enabled, creating an account shows a "check your
email" notice instead; after confirming, the user can log in. Supabase errors
are shown inline.

## Scripts

| Command           | Description                          |
| ----------------- | ------------------------------------ |
| `bun run dev`     | Start the Vite dev server with HMR   |
| `bun run build`   | Build for production into `dist/`    |
| `bun run preview` | Serve the production build locally   |
| `bun run lint`    | Run oxlint                           |

## Routes

- `/` — login/signup page (fingerprint collection + Supabase auth)
- `/demo` — authenticated welcome page (redirects to `/` when signed out)

## Configuration

- Supabase credentials live in `frontend/.env.local` (see `.env.example`).
- The backend target for the `/auth` proxy is set in `vite.config.js`.
