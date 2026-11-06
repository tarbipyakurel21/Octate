# Setup

Copy `.env.example` to `.env` only when changing the default port or model mode, then run `./run_octate.sh`. Docker builds the UI and starts the app and model services. Runtime SQLite data is stored in the `octate-data` volume.

Health endpoints are `GET /api/health` on port 8080 and `GET /api/models` inside the model service.
