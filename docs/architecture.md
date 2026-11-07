# Architecture

The browser loads the Next.js React frontend from the independent `frontend` service on port 3000. Next.js rewrites `/api` requests to the app-server service, which stores projects, annotations, review items, and model runs in SQLite and forwards inference to the model service. If the model service is unavailable, the product API uses the same deterministic contract so the demo stays usable.

`CvatCanvasAdapter` is the only translation point between Octate annotations and CVAT-style object state. It handles shapes, tracks, keyframes, and interpolation. The interactive proof still renders an original lightweight SVG surface. The CVAT canvas and canvas3d TypeScript is vendored, unmodified, under `vendor/cvat/`. The app server exposes that contract at `/api/canvas/2d/<project>/frames/<frame>` and `/api/canvas/3d/<project>/frames/<frame>` without loading either package into the Next.js bundle.

The uncertainty queue uses understandable signals: detection confidence, temporal instability, tracking gaps or jumps, and shape anomalies. Review items always contain reasons.

SQLite tables are the prototype domain: projects, annotations, review items, model runs, plus `canvas_frames` for the vendored canvas contract. Users, videos, labels, tracks, and settings remain implicit until they require independent persistence. The repository keeps frontend files under `frontend/`, API files under `app-server/`, and inference files under `model-server/`.
