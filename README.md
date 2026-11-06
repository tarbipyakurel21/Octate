# Octate

Octate is a focused hatchathon proof of concept for turning surgical video into reviewed, exportable annotations. It combines a small original interface with an isolated adapter for valuable MIT-licensed CVAT canvas concepts.

> Octate is not intended for clinical or production use. Use synthetic or properly de-identified demo data. Models can produce incorrect annotations; human review is required. Authentication and authorization are intentionally simplified.

## Six-step demo

1. Upload or select a surgical video.
2. Run **Detect** or **Segment** in deterministic demo mode.
3. Correct rectangles and polygons in the annotation canvas.
4. Use **Track** and review keyframes on the timeline.
5. Work through uncertain frames with human-readable reasons.
6. Export approved annotations as Octate JSON.

The Projects screen accepts video uploads. The app server extracts frames with FFmpeg and stores them in the runtime data volume.

## Start

Prerequisites: Docker Desktop with Compose.

```bash
./run_octate.sh
```

Open [http://localhost:3000](http://localhost:3000). The React frontend runs on port 3000 and calls the API service on port 8080.

For UI development, run `cd frontend && npm install && npm run dev`; in another terminal run `python app-server/server.py` and optionally `python model-server/server.py`.

## Architecture

- **Frontend service:** Next.js/React UI in `frontend/`, served independently on port 3000.
- **App server:** A small standard-library Python product API and SQLite persistence on port 8080.
- **Model service:** explicit Detect, Segment, and Track endpoints. Deterministic demo mode works without weights.
- **Canvas boundary:** `CvatCanvasAdapter` translates the small Octate schema to canvas object states. CVAT-specific types do not spread into the product.
- **Runtime:** three application services, one Compose file, one startup command. No Django, PostgreSQL, Redis, RQ, OPA, Traefik, Nuclio, ClickHouse, Grafana, or enterprise tenancy.

See [architecture](docs/architecture.md), [setup](docs/setup.md), and [limitations](docs/limitations.md).

## Model requirements

No weights are required for the deterministic demo. Optional real inference is designed for YOLO detection, SAM 2 segmentation, and a SAM 2 video predictor. Models should load once in the model service and be reused.

## Attribution

CVAT is Copyright (C) CVAT.ai Corporation and contributors, licensed under MIT. Adapted CVAT files retain their copyright and MIT notices. See [`vendor/cvat/ATTRIBUTION.md`](vendor/cvat/ATTRIBUTION.md) and [`LICENSE`](LICENSE).

## Migration history

The obsolete CVAT application tree was removed after the focused replacement passed its build, API, persistence, and Docker checks. The complete pre-refactor source remains recoverable from Git commit `441c9f9`; the working tree contains only the focused application and attribution boundary.
