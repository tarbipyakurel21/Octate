# Setup

Copy `.env.example` to `.env` only when changing the default port or model mode, then run `./run_octate.sh`. Docker builds the frontend, CVAT API, and model gateway. The first YOLO-World or SAM action downloads its weights into the persistent `octate_models` Docker volume.

Open the application at `http://localhost:8080`. The model health endpoint is `http://localhost:8091/health`.

For local development, install frontend dependencies and start Next.js from the frontend directory:

```bash
cd frontend
npm install
npm run dev
```

Keep the Docker services running for CVAT and the models. Next.js rewrites `/api` requests to port 8080.

The Projects screen accepts video-file uploads. CVAT stores the video, extracts frames, and exposes them to the editor through the job data API.
