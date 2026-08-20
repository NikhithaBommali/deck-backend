# Deploy Deck Score on Render (free tier)

## What gets deployed

| Service | Type | Plan |
|---------|------|------|
| `deck-backend` | Web (Node + Socket.io) | Free |
| `deck-frontend` | Static Site (`runtime: static`) | Free |

Keep-alive uses **GitHub Actions** (`.github/workflows/keepalive.yml`) — Render cron jobs are not on the free tier.

---

## Option A — Render Dashboard (required for first deploy)

Blueprints **cannot be launched from the CLI** in Render CLI v2.x (only `validate` is supported). Use the dashboard:

1. Push latest `deck-backend` to GitHub (must include `render.yaml`).
2. Go to [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**.
3. Connect repo: **NikhithaBommali/deck-backend**.
4. When prompted for **MONGODB_URI**, paste your Atlas string:

   ```text
   mongodb+srv://USER:PASSWORD@cluster0.ua8n8pz.mongodb.net/deck-score?retryWrites=true&w=majority
   ```

5. Click **Apply** and wait for all 3 services to deploy (~10 min).
6. Open `deck-frontend` URL and test the game.

---

## Option B — Render CLI (validate only)

```bash
render login
render workspace set   # pick your workspace if prompted
cd deck-backend
render blueprints validate ./render.yaml
```

If validation passes, deploy using **Option A** (Dashboard → New → Blueprint).

After services exist, use the CLI to manage them:

```bash
render services              # list deployed services
render deploys create --help # trigger redeploys
render logs --help           # view logs
```

---

## Backup keep-alive (GitHub Actions)

If Render cron is not available on your account, use the workflow in `.github/workflows/keepalive.yml`:

1. GitHub → **deck-backend** → **Settings** → **Secrets** → **Actions**
2. Add:
   - `BACKEND_URL` = `https://deck-backend.onrender.com`
   - `FRONTEND_URL` = `https://deck-frontend.onrender.com`
3. The workflow runs every 14 minutes automatically.

---

## Verify

```bash
curl https://deck-backend.onrender.com/health
# → {"status":"ok","game":"Deck Score"}
```

Open the frontend URL → create room → join from incognito → play.

---

## Notes

- **Frontend static sites do not sleep** on Render free tier; the cron mainly keeps the **backend** awake for Socket.io.
- First backend request after idle may take ~30s (free tier cold start).
- Rotate your MongoDB password if it was ever shared in chat.
