# Architecture

The browser loads the React frontend from the independent `frontend` service on port 3000. Vite proxies `/api` requests to the app-server service, which stores projects, annotations, review items, and model runs in SQLite and forwards inference to the model service. If the model service is unavailable, the product API uses the same deterministic contract so the demo stays usable.

`CvatCanvasAdapter` is the only translation point between Octate annotations and CVAT-style object state. It handles shapes, tracks, keyframes, and interpolation. The interactive proof currently renders an original lightweight SVG surface against that adapter boundary. The pre-refactor CVAT-derived source is preserved in Git commit `441c9f9`, not in the runtime tree.

The uncertainty queue uses understandable signals: detection confidence, temporal instability, tracking gaps or jumps, and shape anomalies. Review items always contain reasons.

SQLite tables are limited to the prototype domain: projects, annotations, review items, and model runs. Users, videos, labels, tracks, and settings remain implicit until they require independent persistence. The repository keeps frontend files under `frontend/`, API files under `app-server/`, and inference files under `model-server/`.
