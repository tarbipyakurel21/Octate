# Octate

Octate is a branded surgical-video annotation application with its own Next.js
interface. CVAT runs headlessly behind it and owns video ingestion, task data,
annotations, and exports. Octate adds an isolated local model gateway for
surgical detection, segmentation, and tracking.

> Octate is not intended for clinical or production use. Use synthetic or properly de-identified demo data. Models can produce incorrect annotations; human review is required. Authentication and authorization are intentionally simplified.

## Workflow

1. Upload or select a surgical video.
2. Annotate in CVAT's original annotation workspace.
3. Correct rectangles, polygons, and masks with CVAT's mature canvas tools.
4. Use tracks and review keyframes on the timeline.
5. Export annotations in any format supported by CVAT.

## Start

Prerequisites: Docker Desktop with Compose. The first start downloads the
pinned CVAT `v2.80.0` images and may take several minutes.

```bash
./run_octate.sh
```

Open [http://localhost:8080](http://localhost:8080).

On the first run, create a CVAT administrator:

```bash
docker compose exec cvat_server python manage.py createsuperuser
```

The model gateway health endpoint is available only on the local machine at
`http://localhost:8091/health`.

## Architecture

- **Product shell:** the Octate Next.js dashboard and workflow. The generic
  CVAT UI is not started.
- **Processing backend:** the CVAT Django API and processing pipeline, pinned
  to upstream `v2.80.0` and routed under `/api` on the same origin.
- **Persistence:** PostgreSQL for CVAT records, named volumes for media, and
  Redis/Kvrocks for queues and cache.
- **Background processing:** one consolidated CVAT worker processes video
  chunks, annotation jobs, imports, exports, and cleanup tasks. Dedicated
  enterprise-scale workers are intentionally omitted.
- **Model gateway:** a separate Octate service publishes detector, interactor,
  and tracker contracts. Deterministic demo mode works without weights.
- **Routing:** Traefik serves the CVAT UI and API from one origin on port 8080.

See [architecture](docs/architecture.md), [setup](docs/setup.md), and [limitations](docs/limitations.md).

## Model requirements

No weights are required for the deterministic gateway. Optional real inference
is designed for YOLO detection, SAM 2 segmentation, and a SAM 2 video
predictor. Models load once in the model service and are reused.

## Attribution

CVAT is Copyright (C) CVAT.ai Corporation and contributors, licensed under MIT.
The deployment uses official, unmodified CVAT images. See
[`vendor/cvat/ATTRIBUTION.md`](vendor/cvat/ATTRIBUTION.md) and [`LICENSE`](LICENSE).

## Legacy prototype

The former SQLite `app-server/` remains only for migration reference and is not
part of the default runtime. The active Next.js frontend talks directly to
CVAT's API. New backend work should target CVAT extension points and the
separate model gateway.
