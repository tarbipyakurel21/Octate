# Setup

Copy `.env.example` to `.env` only when changing the default port or model mode, then run `./run_octate.sh`. Docker builds the frontend, API, and model services separately. Runtime SQLite data is stored in the `octate-data` volume.

Open the frontend at `http://localhost:3000`. The API health endpoint is `GET http://localhost:8080/api/health`, and the model health endpoint is `GET /api/models` inside the model service.

For local development, install frontend dependencies and start Vite from the frontend directory:

```bash
cd frontend
npm install
npm run dev
```

In another terminal, start the API with `python app-server/server.py`. Vite proxies `/api` requests to the API on port 8080.
