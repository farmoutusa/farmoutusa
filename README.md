# Callback Window Checker

A simple tool for 24/7 technical support teams: type a customer's phone number, instantly see whether it's currently OK to call them back (DST-aware, based on their local time), and if not, when to try again.

No database, no accounts — just a stateless phone-number → verdict checker.

---

## Local setup (development)

### Prerequisites
- Node.js 18+ (`node --version`)
- Two terminal windows

### 1. Install dependencies

```bash
# Terminal A
cd callback-window-checker/backend
npm install

# Terminal B
cd callback-window-checker/frontend
npm install
```

### 2. Start the backend

```bash
# Terminal A (stays running)
cd backend
npm run dev        # uses node --watch for auto-restart
```

The backend listens on **http://localhost:3001**.

### 3. Start the frontend

```bash
# Terminal B (stays running)
cd frontend
npm run dev
```

Open **http://localhost:5173** in your browser.
The Vite dev server proxies `/api/*` calls to the backend automatically.

---

## Test numbers

| Number | Country | Timezone |
|--------|---------|----------|
| `+1 415 555 2671` | US | America/Los_Angeles |
| `+1 212 555 1234` | US | America/New_York |
| `+44 20 7946 0958` | UK | Europe/London |
| `+63 2 8123 4567` | Philippines | Asia/Manila |
| `+61 2 9374 4000` | Australia | Australia/Sydney |
| `+61 8 9321 1234` | Australia | Australia/Perth |
| `+81 3 1234 5678` | Japan | Asia/Tokyo |
| `+91 22 6180 0000` | India | Asia/Kolkata |
| `+55 11 9999 8888` | Brazil | America/Sao_Paulo |

Multi-timezone countries (US, AU, BR) will show a dropdown so the agent can confirm which zone applies.

---

## Architecture

```
callback-window-checker/
├── backend/              Express, stateless
│   ├── server.js         Entry point; serves API + built frontend in prod
│   └── routes/
│       └── check.js      POST /api/check  ← phone→timezone→verdict logic
└── frontend/             React + Vite + Tailwind
    └── src/
        ├── App.jsx        Page shell
        ├── api.js         Fetch wrapper
        └── components/
            ├── PhoneChecker.jsx   Input + triggers /api/check
            └── ResultCard.jsx     Green/amber verdict card with timezone picker
```

### How it works

1. `libphonenumber-js` parses the raw number → validates it + extracts country code.
2. `libphonenumber-geo-carrier` maps the parsed number to one or more IANA timezone IDs using area-code data. For multi-zone countries this narrows down to the most likely zone.
3. If `libphonenumber-geo-carrier` can't resolve a zone, a country → timezone fallback map covers 50+ countries.
4. `luxon` computes `DateTime.now().setZone(zone)` — always DST-correct because it uses the IANA database, never a hardcoded UTC offset.
5. Business hours (08:00–19:00) and retry interval (3h15m) are constants at the top of `backend/routes/check.js` — edit them directly to change behavior.

---

## Deploying online (free: Netlify + Render)

Since there's no database, this is about as simple as full-stack deploys get — both services are stateless.

### 1. Backend → Render

1. Push the repo to GitHub.
2. [render.com](https://render.com) → sign up with GitHub → **New → Web Service** → pick this repo.
3. Render reads `render.yaml` automatically (region: Singapore, plan: free). Click **Deploy**.
4. Copy the resulting URL, e.g. `https://callback-window-checker-api.onrender.com`.

### 2. Frontend → Netlify

1. [netlify.com](https://netlify.com) → **Add new site → Import an existing project** → pick this repo.
2. Netlify reads `netlify.toml` automatically (base: `frontend`, publish: `dist`).
3. **Site configuration → Environment variables** → add `VITE_API_URL` = the Render URL from step 1.
4. Trigger a deploy. Share the resulting `*.netlify.app` URL with your team.

> Render's free tier sleeps after inactivity and takes ~30s to wake on the next request — harmless here since there's no data to lose. If that wake delay is annoying, ping `https://your-app.onrender.com/api/health` every 10 min with a free service like cron-job.org to keep it warm.

### Alternative: single-service deploy (no Netlify)

Render can serve both the API and the built frontend from one service, skipping Netlify entirely:

```bash
cd frontend && npm run build   # outputs to ../backend/public/ (when NETLIFY env var isn't set)
```

Then on Render, use build command `cd frontend && npm install && npm run build && cd ../backend && npm install` and start command `node backend/server.js`. Express serves `backend/public` automatically when present.

---

## Future work / known limitations

- **Shared callback queue**: an earlier version of this app included a shared queue (so agents could log callbacks and avoid double-calling) plus configurable settings and a name/password gate. That was intentionally removed to keep this tool to a single purpose. If you want it back, it's in this repo's git history.
- **Configurable business hours**: currently hardcoded constants in `backend/routes/check.js`. Add a small settings UI + storage if you need this adjustable without a code change.
- **Dark mode**: Tailwind's `dark:` variant is ready to wire up.
