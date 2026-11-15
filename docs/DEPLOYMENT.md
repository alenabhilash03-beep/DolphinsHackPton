# Going live — the simplest pipeline

Hypothesim ships as **one Docker image** (`Dockerfile`). The visual web app (`frontend/`) listens on the public port and the scientific API runs inside the same container. Any host that runs a Dockerfile can serve it. Sign-in uses **Supabase Auth with Google**; experiments, each user's notes, papers and saved experiments (`/data/workspaces/visual`), and the community feed live in the container's data folder (`/data`).

You need **three environment variables**:

| Variable | Where it comes from |
| --- | --- |
| `NVIDIA_API_KEY` | build.nvidia.com (the key you already use) |
| `SUPABASE_URL` | Supabase project → **Connect** button (top bar) → Project URL, `https://<ref>.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | Same **Connect** dialog: the publishable key (`sb_publishable_…`). If none exists, create one under **Project Settings → API Keys** |

Accounts switch on automatically when `SUPABASE_URL` is set. Leave the Supabase variables out and the app runs as the single-user local demo.

## Option A (recommended): Railway, about 15 minutes, no Vercel needed

Railway builds the Dockerfile straight from GitHub and keeps `/data` on a volume. New accounts get a one-time $5 trial credit for 30 days, enough for the hackathon; after that the Hobby plan is $5/month. Check the current terms on [railway.com/pricing](https://railway.com/pricing).

1. Sign in at railway.com with GitHub. Choose **New Project → Deploy from GitHub repo → DolphinsHackPton**. Under the service's **Settings → Source**, pick the branch to deploy. Railway finds `railway.toml` and the `Dockerfile` itself.
2. **Variables** tab: add `NVIDIA_API_KEY`, `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. Railway supplies `PORT`.
3. Right-click the service, choose **Attach Volume**, and set the mount path to `/data`. Without it, experiments and shares reset on every redeploy.
4. **Settings → Networking → Generate Domain**. This is your live URL (`https://<name>.up.railway.app`).
5. Finish Google sign-in (next section) with that URL.

Health check: `https://<your-url>/api/health` should show `"status":"ok"` and `"ai_credentials_configured": true`.

## Google sign-in (Supabase + Google Cloud), about 10 minutes

1. In Supabase, open **Authentication → Sign In / Providers → Google** and copy the **Callback URL** shown there (`https://<ref>.supabase.co/auth/v1/callback`).
2. In Google Cloud Console, open **Google Auth Platform**. Set up branding/consent (External; your email). Then go to **Clients → Create client → Web application** and paste the callback URL under **Authorized redirect URIs**. Copy the client ID and client secret.
3. Back in Supabase **Google**, paste the client ID and secret, enable the provider, and save.
4. Under Supabase **Authentication → URL Configuration**, set **Site URL** to your live URL. Add `<your live URL>/**` to **Redirect URLs**. For local testing also add `http://localhost:3000/**`, and for Option B add `https://*.trycloudflare.com/**`.
5. While the Google app is in testing, add judges' Google accounts as **test users**, or publish the app (basic sign-in scopes need no review).

## Option B (zero cost): your laptop plus a free Cloudflare tunnel

This is the most reliable setup for a live presentation, because it runs on the machine you rehearse on. The link only works while the laptop is on.

```bash
docker build -t hypothesim .
```

```bash
docker run -p 3000:3000 -v hypothesim-data:/data -e NVIDIA_API_KEY=... -e SUPABASE_URL=... -e SUPABASE_PUBLISHABLE_KEY=... hypothesim
```

```bash
cloudflared tunnel --url http://localhost:3000
```

`cloudflared` prints a public `https://<random>.trycloudflare.com` address; no Cloudflare account is needed. Without Docker, run `bash scripts/start_container.sh` from a checkout after `uv sync --locked --no-dev` and `cd frontend && npm ci && npm run build`, with the same three variables plus `DATA_DIR` and `PORT=3000` exported, then tunnel port 3000.

## Acceptance on the live URL

- Signed out: the saved demo, sliders and follow-up proposal cards work. Running research or a follow-up, sharing and the community feed show **Sign in with Google**.
- Account A runs the demo question, then uses **Share your experiment**. The shared page shows the step log, the log summary and an AI summary in which each statement cites steps.
- Account B (another Google account) sees it under **Community**, opens it read-only and cannot remove it. B's own history is separate.

## What is stored where

- Google display name and avatar come from Supabase; email addresses are never stored by Hypothesim.
- Each user's experiments and all shares live in SQLite files under `/data` on the host's volume.
- The NVIDIA key never reaches the browser. The browser receives only the Supabase project URL and publishable key, which are public by design.
