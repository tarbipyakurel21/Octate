# Octate

Octate is a surgical-video annotation application with its own Next.js
interface. The dashboard holds projects, tasks, and jobs. Video ingestion,
the annotation workflow, and exports stay in the annotation workspace. Octate
adds an isolated local model gateway for surgical detection, segmentation,
and tracking.

> Octate is not intended for clinical or production use. Use synthetic or properly de-identified demo data. Models can produce incorrect annotations; human review is required. Authentication and authorization are intentionally simplified.

## Workflow

1. Upload or select a surgical video.
2. Open the job in Octate.
3. Correct rectangles, polygons, and masks with the canvas tools.
4. Use tracks and review keyframes on the timeline.
5. Export annotations in any supported format.

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

- **Dashboard:** the Octate Next.js workspace for home, projects, tasks, jobs, and sign-in.
- **Annotation workflow:** served on the same origin. Octate opens
  `/tasks/<id>/jobs/<job>`. Shapes, tracks, masks, and the timeline stay there.
- **Processing backend:** the API and processing pipeline, pinned
  to upstream `v2.80.0` and routed under `/api` on the same origin.
- **Persistence:** PostgreSQL for records, named volumes for media, and
  Redis/Kvrocks for queues and cache.
- **Background processing:** one consolidated worker processes video
  chunks, annotation jobs, imports, exports, and cleanup tasks. Dedicated
  enterprise-scale workers are intentionally omitted.
- **Model gateway:** a separate Octate service runs three local models and
  publishes them to the workspace: an instrument detector, a click segmenter, and a
  rectangle tracker. They appear in the annotation workspace under AI tools.
- **Routing:** Traefik serves the Octate dashboard for `/`, `/projects`, `/tasks`,
  and `/jobs`. A job URL stays on the annotation workspace. The API stays under `/api`.
  All of this is on port 8080.

See [architecture](docs/architecture.md), [setup](docs/setup.md), and [limitations](docs/limitations.md).

## Local models

The model gateway runs on this machine and does not call an external API.
Open a job in the annotation workspace and choose a model under AI tools:

- **Octate instrument detector** supplies the task labels and draws the
  rectangles. The names come from the model, not from a preset list. Labels
  are estimated from the tool's shape.
- **Octate tissue segmenter** is the magic wand. Left-click a region to keep
  and right-click a region to exclude.
- **Octate instrument tracker** carries a rectangle forward onto later frames.

Set `OCTATE_MODEL_MODE=demo` to return fixed shapes instead of reading the frame.
Every model result needs human review.

## Attribution

CVAT is Copyright (C) CVAT.ai Corporation and contributors, licensed under MIT.
The deployment uses official, unmodified CVAT images. See
[`vendor/cvat/ATTRIBUTION.md`](vendor/cvat/ATTRIBUTION.md) and [`LICENSE`](LICENSE).

## Legacy prototype

The former SQLite `app-server/` remains only for migration reference and is not
part of the default runtime. The active Next.js frontend talks directly to
the annotation API. New backend work should target that API and the
separate model gateway.
