# Deploy Deck Score on Render (free tier)

## What gets deployed

| Service | Type | Plan |
|---------|------|------|
| `deck-backend` | Web (Node + Socket.io) | Free |
| `deck-frontend` | Static Site (Vite) | Free |
| `deck-keepalive` | Cron (every 14 min) | Free |

The cron job pings `/health` on the backend and the frontend URL so the backend stays awake on the free tier.

---

## Option A — Render Dashboard (recommended)

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

## Option B — Render CLI

```bash
# Install CLI (macOS)
brew update && brew install render

# Log in (opens browser)
render login

# From deck-backend repo
cd deck-backend
git push origin main   # ensure render.yaml is on GitHub

# Launch blueprint
render blueprint launch
```

When asked for `MONGODB_URI`, paste your MongoDB Atlas connection string.

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
