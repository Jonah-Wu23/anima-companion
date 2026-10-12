# Free Render deploy

Repository: https://github.com/Jonah-Wu23/anima-companion

## Layout

- Web: Next.js on Render free Node service, root repository workspaces.
- API: FastAPI on Render free Python service.
- Browser API requests: `/backend/v1/...` (rewritten by Next.js to `BACKEND_PROXY_TARGET/v1/...`). Same-origin session cookies.
- Data: SQLite and album files are ephemeral on free instances.
- Large 3D PMX/VMD source assets are missing from Git, so original character models cannot render until uploaded.

## Environment

Web (build and runtime):
```text
NEXT_PUBLIC_API_BASE_URL=/backend
BACKEND_PROXY_TARGET=https://anima-companion-api.onrender.com
```

API:
```text
AUTH_COOKIE_SECURE=true
AUTH_SESSION_SECRET=<generate a strong secret in Render UI>
LLM_API_BASE_URL=<your API base>
LLM_API_KEY=<set only in Render UI>
LLM_MODEL=<your supported model>
```

Set `BACKEND_PROXY_TARGET` to the exact public URL of the API service (including `https://`), not `hostport`. On the free plan no persistent disk is available; restarting/redeploying resets users/chat history. External SMS/captcha/voice credentials are required for their corresponding features.

## Render service configuration

For the API use runtime `python`, build `pip install -e ./server`, start `cd server && uvicorn app.main:app --host 0.0.0.0 --port $PORT`, health `/healthz`.

For the Web use runtime `node`, build `npm ci && npm run build:web`, start `cd web && ../node_modules/.bin/next start -p $PORT`.

The root directory for both services must remain the repository root, since Next.js reads `../assets` and `../configs` and npm uses root workspaces.

After changing `NEXT_PUBLIC_API_BASE_URL`, manually redeploy the web service to rebuild browser code.

Check `/healthz` on the API and `/`, `/chat`, and `/api/local-files/configs/motions/phainon-motion-manifest.json` on the Web.
