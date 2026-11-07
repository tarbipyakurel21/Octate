# Octate

Octate is a surgical-video annotation application with its own Next.js
interface: the dashboard and the annotation editor are both Next.js pages. The
CVAT server is the engine behind them (video ingestion, frames, annotation
storage, exports), and the only CVAT code in the repository is its 2D canvas.
Octate adds an isolated local model gateway for surgical detection,
segmentation, and tracking.

> Octate is not intended for clinical or production use. Use synthetic or properly de-identified demo data. Models can produce incorrect annotations; human review is required. Authentication and authorization are intentionally simplified.

## Workflow

1. Upload or select a surgical video.
2. Open the job in Octate.
3. Draw or correct rectangles, polygons, polylines, points, and ellipses.
   Run the detector on a frame to pre-fill rectangles.
4. Tick **Track** to draw a track. Editing it on another frame adds a keyframe,
   and the timeline marks keyframes.
5. Save, then export annotations from the task page.

## Start

Prerequisites: Docker Desktop with Compose. The first start downloads the
pinned `v2.80.0` images and may take several minutes.

```bash
./run_octate.sh
```

Open [http://localhost:8080](http://localhost:8080).

On the first run, create an administrator:

```bash
docker compose exec cvat_server python manage.py createsuperuser
```

The model gateway health endpoint is available only on the local machine at
`http://localhost:8091/health`.

## Architecture

- **Frontend:** the Octate Next.js app for home, projects, tasks, jobs,
  sign-in, and the job editor at `/tasks/<id>/jobs/<job>`.
- **Canvas:** CVAT's 2D canvas, vendored under `vendor/cvat/canvas` and mounted
  by `CvatEditor`. The editor reads and writes `/api/jobs/<job>/annotations/`
  and loads frames from `/api/jobs/<job>/data`.
- **Engine:** the official `cvat/server` image, pinned to `v2.80.0` and routed
  under `/api`. CVAT's own UI is not deployed.
- **Persistence:** PostgreSQL for records, named volumes for media, and
  Redis/Kvrocks for queues and cache.
- **Background processing:** one consolidated worker processes video
  chunks, annotation jobs, imports, exports, and cleanup tasks. Dedicated
  enterprise-scale workers are intentionally omitted.
- **Model gateway:** a separate Octate service with three local models: an
  instrument detector, a click segmenter, and a rectangle tracker. CVAT
  registers them as lambda functions.
- **Routing:** Traefik sends `/api` to the CVAT server, `/model-api` to the
  model gateway, and everything else to Next.js, all on port 8080.

See [architecture](docs/architecture.md), [setup](docs/setup.md), and [limitations](docs/limitations.md).

## Local models

The model gateway runs on this machine and does not call an external API.
In the job editor, **Detect** runs the **Octate instrument detector** on the
current frame through CVAT's `/api/lambda/functions` endpoint. The detector
supplies the task labels, so detections map onto them by name. Labels are
estimated from the tool's shape. The tissue segmenter and instrument tracker
are registered with CVAT but are not wired into the Next.js editor yet.

Set `OCTATE_MODEL_MODE=demo` to return fixed shapes instead of reading the frame.
Every model result needs human review.

## Attribution

CVAT is Copyright (C) CVAT.ai Corporation and contributors, licensed under MIT.
The deployment uses the official, unmodified CVAT server image, and the
repository vendors only CVAT's 2D canvas. See
[`vendor/cvat/ATTRIBUTION.md`](vendor/cvat/ATTRIBUTION.md) and [`LICENSE`](LICENSE).

## Legacy prototype

The former SQLite `app-server/` remains only for migration reference and is not
part of the default runtime. The active Next.js frontend talks directly to
the annotation API. New backend work should target that API and the
separate model gateway.
