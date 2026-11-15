# Hosted deployment — 5C.2

Hypothesim runs as three pieces:

| Piece | Service | What it holds |
| --- | --- | --- |
| Web app (`apps/web`, Next.js) | **Vercel** | Pages, Google sign-in in the browser, same-origin `/api/*` routes that forward to the API |
| Scientific API (`apps/api`, FastAPI) | **Render** (Starter + 1 GB disk) | Agent, solver, structures; each user's experiments and the community feed in SQLite on the disk |
| Accounts | **Supabase Auth** (Google provider) | Sign-in only. The API checks each request's token with Supabase; no experiment data is stored there |

The NVIDIA key lives only on Render. The browser receives the Supabase **public** anon key and its own session token, nothing else.

**Cost.** Supabase (free) and Vercel Hobby (free) cost nothing. Render Starter with a 1 GB disk is about $7.25/month. Render's free tier has no persistent disk, so it would erase every account's experiments and the community feed on each restart. It also sleeps after about 15 idle minutes.

## 1. Google sign-in (Google Cloud + Supabase), about 10 minutes

1. Create a Supabase project. Under **Project Settings → API**, copy the **Project URL** and the **anon public** key.
2. In Google Cloud Console, open **APIs & Services → OAuth consent screen**. Choose *External* and fill in the app name and your email. You can stay in testing mode and add judges as test users, or publish (basic scopes need no verification).
3. Open **Credentials → Create credentials → OAuth client ID → Web application**. Under **Authorized redirect URIs**, add `https://<project-ref>.supabase.co/auth/v1/callback`. Copy the client ID and secret.
4. In Supabase, open **Authentication → Sign In / Providers → Google**. Enable it and paste the client ID and secret.
5. In Supabase **Authentication → URL Configuration**, set **Site URL** to your Vercel URL (step 3). Add it, plus `http://localhost:3000/**` for local testing, to **Redirect URLs**.

## 2. API on Render

1. Create a Render account and connect GitHub with access to `DolphinsHackPton`.
2. Choose **New → Blueprint**, pick the repository and the branch to deploy, and Render reads `render.yaml`.
3. Enter the secret values when prompted:
   - `SUPABASE_URL` and `SUPABASE_ANON_KEY` from step 1.
   - `NVIDIA_API_KEY`.
   - `HYPOTHESIM_CORS_ORIGINS` as `["https://<your-app>.vercel.app"]`.
4. Deploy. Check `https://hypothesim-api.onrender.com/api/health` (your service name may differ): it must report `"ai_credentials_configured": true`.

## 3. Web app on Vercel

1. Choose **Add New → Project** and import `DolphinsHackPton`. Set **Root Directory** to `apps/web` (framework: Next.js). Keep the default install and build commands; the repository is an npm workspace.
2. Add these environment variables:
   - `API_BASE_URL` = the Render URL from step 2, with no trailing slash.
   - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from step 1.
3. Deploy, then put the final Vercel URL in Supabase **Site URL / Redirect URLs** and Render's `HYPOTHESIM_CORS_ORIGINS` if they differ.

## 4. Acceptance on the live URL

- Signed out: the saved demo and slider simulations work. **Research hypothesis**, sharing and the community feed ask you to sign in with Google.
- Account A runs the demo question, then clicks **Share your experiment**. The shared page shows the step log, the log summary and an AI summary in which each statement cites steps.
- Account B (a different Google account) sees it in **Community**, opens it read-only and cannot remove it. B's own investigations are separate: the same question gives B an independent history.
- `AUTH_MODE=off` (the default) keeps the local single-user demo working with no accounts, as before.

## Behavior notes

- Sharing publishes an immutable snapshot of the path from the original question to the shared result. Later work does not change it, and the owner can remove it.
- Shares are visible to every signed-in user (feed and direct link). Email addresses are never stored or shown; only the Google display name and avatar are.
- AI summaries are validated before publication. Each statement must cite existing steps, numbers must appear in the cited steps, and clinical, safety or dosing claims are rejected. When validation or the model fails, the page shows the deterministic log summary and says why.
