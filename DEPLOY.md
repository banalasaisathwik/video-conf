# Fly Deployment

Deploy the server first, then the frontend.

## 1. Server

From `server/`:

```powershell
fly auth login
fly launch --no-deploy
```

Update `server/fly.toml`:

- Replace `app` with your real Fly app name.
- Replace `MEDIASOUP_ANNOUNCED_ADDRESS` with `<your-app-name>.fly.dev`.

Allocate a dedicated IPv4 for UDP:

```powershell
fly ips allocate-v4
```

Deploy:

```powershell
fly deploy
fly logs
```

Health check:

```powershell
curl https://<your-app-name>.fly.dev/health
```

## 2. Frontend

From `frontend/`:

```powershell
fly launch --no-deploy
```

Update `frontend/fly.toml`:

- Replace `app` with your real frontend app name.
- Replace `VITE_WEBSOCKET_URL` with `wss://<your-server-app>.fly.dev`.

Deploy:

```powershell
fly deploy
fly logs
```

## Notes

- The server exposes WebSocket signaling on port `8080`.
- mediasoup uses port `40000` for both UDP and TCP on Fly.
- If the server deploys but calls fail, double-check the dedicated IPv4 and `MEDIASOUP_ANNOUNCED_ADDRESS`.
