# Sidelines

A personalized sports news reader. Pick the sports and teams you follow and get a focused feed — headlines from NewsAPI, plus a live "Up Next" widget showing your teams' upcoming games.

## Live site

**[sidelines.onrender.com](https://sidelines.onrender.com)**

Note: the app is hosted on Render's free tier, so it spins down after periods of inactivity — the first load after a while may take up to a minute to wake up.

## Features

- **Personalized onboarding** — two-step setup to select sports and specific teams/players
- **7 sports** — Tennis, NBA Basketball, Soccer, NFL Football, Formula 1, College Football, UFC/MMA
- **Team filtering** — follow specific clubs, players, or programs (e.g. Arsenal, Knicks, Verstappen)
- **Up Next widget** — sidebar showing the next scheduled game for every team and player you follow, powered by TheSportsDB (no NewsAPI quota used)
- **Accounts** — sign in with Google to sync preferences across devices; guest mode falls back to `localStorage`
- **Server-side caching** — Redis-backed cache (3h TTL for news, hours-to-days for fixtures) keeps day-to-day browsing well under the NewsAPI free-tier quota, with stale-cache fallback if the API is down or rate-limited
- **Backend proxy** — API key stays server-side; the browser never sees it
- **Edit anytime** — "Edit" button in the header reopens the full onboarding flow

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, TanStack Query, Framer Motion, Axios |
| Backend | Python 3.12, uvicorn (ASGI), httpx, Google Identity Services (Sign in with Google), PyJWT (RS256 to verify Google, HS256 for our own session tokens) |
| Persistence | Upstash Redis (REST API) — the sole datastore: users, prefs, news/fixtures cache, and visitor counter, so nothing resets on a Render spin-down |
| Data sources | [NewsAPI](https://newsapi.org) (articles), [TheSportsDB](https://www.thesportsdb.com) (fixtures, free/keyless) |
| Deployment | Docker (multi-stage build), Render (free tier, single web service) |

## Architecture

Sidelines runs as a single Docker service: a Python backend that serves both the JSON API and the built React static files, with no separate frontend host or database server.

```
Browser ── GET /        → static React app
        └─ /api/*        → auth & prefs (Redis) · news (NewsAPI, cached in Redis)
                            fixtures (TheSportsDB, cached in Redis) · visitor count (Redis)
```

- **Auth & prefs** — the frontend uses Google Identity Services to get a Google ID token; the backend verifies it against Google's public keys (audience-checked against `GOOGLE_CLIENT_ID`) and, on first sign-in, creates a user keyed by the verified email, then issues its own short-lived-session JWT (stored client-side) for subsequent requests. A logged-in user's sport/team selections are saved server-side, while guests fall back to `localStorage` so the app still works without an account.
- **News & fixtures** — the backend proxies every third-party call, so API keys never reach the browser. Each response is cached in Redis, without a Redis-native TTL — freshness is checked in-app, so a stale response is never simply evicted; it's served as a fallback if an upstream call fails or rate-limits, rather than showing an error.
- **Why Redis for everything** — Render's free tier has no persistent disk, so anything kept in a local file gets wiped on every redeploy. Redis is external and stateless from the app's perspective, so a redeploy or spin-down never loses users, prefs, or cache — this used to only cover the visitor counter, with the rest on a local SQLite file, until that same wipe-on-redeploy problem started hitting news caching too (see Issues below).
- **Build & deploy** — a multi-stage Docker build compiles the frontend to static assets, then copies them into a slim Python image alongside the backend, so the shipped container has no Node runtime. In local dev, Vite proxies `/api/*` to the backend so both run side by side without CORS configuration.

## Running locally

Requires a free [Upstash](https://upstash.com) Redis database (500K commands/month free tier — more than enough for local dev) — Redis is the only datastore, so the backend won't start without it. Sign-in also requires a Google OAuth client id — create one at the [Google Cloud Console credentials page](https://console.cloud.google.com/apis/credentials) (OAuth client ID → Web application) with `http://localhost:5173` added as an authorized JavaScript origin.

```bash
# backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cat > .env <<EOF
NEWS_API_KEY=your_key_here
UPSTASH_REDIS_REST_URL=your_upstash_rest_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_rest_token
GOOGLE_CLIENT_ID=your_google_oauth_client_id
VITE_GOOGLE_CLIENT_ID=your_google_oauth_client_id
EOF
uvicorn server:app --reload --port 8000

# frontend (separate terminal)
npm install
npm run dev
```

Both env vars hold the same client id — `GOOGLE_CLIENT_ID` is what the backend checks token audiences against, `VITE_GOOGLE_CLIENT_ID` is what the frontend embeds to request tokens. In production, Vite inlines `VITE_GOOGLE_CLIENT_ID` at Docker build time, not at container runtime, so it has to be supplied as a Docker build argument (see `Dockerfile`) rather than a plain Render environment variable — double-check this in Render's dashboard when deploying, since a value that only reaches the running container and never reaches the build step would silently ship a frontend with no client id (the same class of "credential set in the wrong place" mistake as the Redis deploy failure below).

## Issues run into (and fixes)

**NewsAPI quota exhaustion.** The free NewsAPI tier caps out at 100 requests/day. Early on, the news cache TTL was only 30 minutes, and each unique combination of a user's followed teams minted its own cache key (a per-team query on top of the per-sport one) — so quota usage scaled with the user base instead of staying fixed. Once the app hit the daily cap, a routine redeploy wiped the SQLite file the cache lived in at the time (Render's free tier has no persistent disk), which took the stale-cache fallback down with it and killed headlines for every sport at once. Fixed short-term by (1) raising the cache TTL to 3 hours, keeping worst-case daily requests well under quota even under continuous traffic, and (2) dropping per-team NewsAPI queries entirely — the backend now always fetches the shared sport-wide result set, with team relevance tagged client-side instead of firing a dedicated request per team combination. The root cause — anything on local disk getting wiped on redeploy — was fixed for good later by moving the whole datastore (users, prefs, and the cache) off SQLite onto Redis, the same fix already used for the visitor counter.

**Article rendering: hero card collapse.** The top article in each sport section renders as a large "hero" card that spans two grid rows, sized implicitly by the four compact cards next to/below it. Sports with very few results (boxing had as little as one article on a given day) had no sibling cards to establish that second row's height, so the hero card collapsed to a ~14px sliver. Fixed by only rendering the hero variant when a section has at least 5 articles; below that, everything renders as compact cards.

**Black screen from stale local preferences.** After removing a few sports (cricket, college basketball, boxing) from the app, any browser that still had one of those sport IDs saved in `localStorage` from before the removal would hit an unguarded lookup (`SPORT_MAP[sportId].color`) that returned `undefined`, crashing the whole render tree with no error boundary to catch it — a blank black page with no indication of what went wrong. Fixed with a `sanitizePrefs()` step that strips unrecognized sport IDs wherever preferences are loaded (from `localStorage` or from the server), so retired sport IDs degrade gracefully instead of crashing the app.

**Sparse results from over-narrow queries.** A few sport queries (tennis, NCAA basketball) initially matched only the sport's generic name (e.g. `"tennis"`), which most real headlines don't actually contain — they mention tournaments, tours, or players instead. This produced near-empty sections. Fixed by broadening each query to include tour/event names (ATP, WTA, Wimbledon, March Madness, etc.) and expanding the per-sport domain allowlists against sources confirmed live against NewsAPI.

**Deploy failure from Redis credentials that were never actually set.** When the datastore migrated fully to Redis, the backend was changed to fail fast at startup if `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` are missing. The very next deploy failed immediately — it turned out those variables had never actually been added in Render's dashboard, despite `render.yaml` listing them. The visitor counter (the only feature that previously used Redis) had been silently running on its SQLite fallback in production the entire time, so nothing looked broken until Redis became a hard requirement for everything. Render doesn't take a service offline on a failed deploy — it keeps the last successful one live — so the site kept working on the old SQLite-based build until the real Upstash credentials were created and added to Render's environment variables.
