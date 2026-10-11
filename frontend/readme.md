# vortexa frontend

React + Vite single-page app. It renders a login/signup page, collects browser
fingerprints (FingerprintJS + ThumbmarkJS), and posts them to the backend when
the user logs in or creates an account.

## Requirements

- [Bun](https://bun.sh) (used for install and scripts)
- A backend listening on `http://localhost:3000` exposing `POST /auth`

## Install

```sh
bun install
```

## Run (development)

```sh
bun run dev
```

Vite starts on <http://localhost:5173>. Open that URL to see the login page.

The dev server proxies `/auth` to `http://localhost:3000`, so run the backend
alongside it. The `Login page` generates fingerprints on load; once ready,
"Log in" and "Create account" send this JSON to `POST /auth`:

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

`action` is `"login"` or `"create"`. On a `2xx` response the app navigates to
`/demo`, which shows the welcome page. Non-`2xx` responses are surfaced on the
page using the response `message` or `error` field.

## Scripts

| Command           | Description                          |
| ----------------- | ------------------------------------ |
| `bun run dev`     | Start the Vite dev server with HMR   |
| `bun run build`   | Build for production into `dist/`    |
| `bun run preview` | Serve the production build locally   |
| `bun run lint`    | Run oxlint                           |

## Routes

- `/` — login/signup page (fingerprint collection)
- `/demo` — static welcome page shown after a successful login/signup

## Configuration

The backend target for the `/auth` proxy is set in `vite.config.js`. Change it
there if the backend runs on a different host or port.
