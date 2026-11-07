# OCTATE — CVAT Architecture Audit & Component Classification

**Document Version:** 1.0  
**Date:** November 2026  
**Product:** Octate — AI-Assisted Surgical Video Annotation Platform  
**Repository Working Copy:** `/Users/tarbipyakurel/Developer/biolabel`  
**Base Commit / Branch:** `develop` (CVAT v2.82.1 upstream base)

---

## 1. Executive Summary & Objective

Octate is an AI-assisted, local-first surgical video annotation platform. Our core objective is to **extract, streamline, and preserve the mature video annotation engine of CVAT** (Computer Vision Annotation Tool) while systematically eliminating unnecessary enterprise layers, multi-tenancy overhead, complex cloud integrations, and heavy telemetry pipelines.

### Guiding Engineering Philosophy
> **Preserve the annotation engine. Simplify everything around it. Build Octate on a proven foundation.**

We are **NOT** rewriting CVAT from scratch. Re-implementing frame decoding, SVG/Canvas rendering, keyframe interpolation, Run-Length Encoding (RLE) masks, undo/redo stacks, and dataset serialization would introduce immense instability and take months of stabilization. Instead, we perform a surgically targeted simplification:
1. **Retain** the battle-tested frontend annotation canvas, frame decoders, and backend persistence layer.
2. **Automate & Hide** internal hierarchical abstractions (Projects, Tasks, Jobs, Segments, Requests) behind an intuitive 3-section interface: **Videos**, **Annotate**, and **Export**.
3. **Decommission** unneeded enterprise services (ClickHouse, Grafana, Vector, Kvrocks, Cloud Storages, Multi-tenancy/Orgs, Webhooks) while preserving essential background workers (`chunks`, `import`, `export`, `annotation`).

---

## 2. Component Classification

Every module, directory, and subsystem in the repository has been audited against actual source code and classified into four strict categories:

```
┌────────────────────────────────────────────────────────────────────────┐
│                          OCTATE ARCHITECTURE                           │
├────────────────────────────────────────────────────────────────────────┤
│ [A] CORE (Preserve Intact)                                             │
│   ├── cvat-canvas/ (Canvas & SVG annotation layer)                     │
│   ├── cvat-data/ (Wasm video/frame decoders)                          │
│   ├── cvat-core/ (Client-side object state, tracks, history, saver)    │
│   ├── cvat-ui/src/components/annotation-page/ (Annotation workspace)   │
│   └── cvat/apps/engine/ & dataset_manager/ (Persistence, decoders)     │
├────────────────────────────────────────────────────────────────────────┤
│ [B] SUPPORTING (Retain & Automate Behind the Scenes)                   │
│   ├── Django 4.2 + PostgreSQL 15 (Metadata & relational store)         │
│   ├── Redis 7.2 + RQ (Asynchronous processing broker)                  │
│   ├── Task, Segment, Job, Data, Video database models                  │
│   └── Traefik 3.6 (Reverse proxy & routing)                            │
├────────────────────────────────────────────────────────────────────────┤
│ [C] OPTIONAL (Decommission / Disable)                                  │
│   ├── ClickHouse + Grafana + Vector (Analytics pipeline: ~1.5 GB RAM)  │
│   ├── Cloud Storages (S3, Azure Blob, GCS connectors)                  │
│   ├── Multi-tenant Organizations & Invitations                         │
│   ├── Webhooks & Webhook Workers                                       │
│   └── Apache Kvrocks (On-disk Redis duplicate)                         │
├────────────────────────────────────────────────────────────────────────┤
│ [D] SPECIAL HANDLING (Keep Internally, Hide from UI)                   │
│   ├── Projects & Jobs navigation (Auto-created per uploaded video)     │
│   └── Requests API (Used internally for tracking async export/import)  │
└────────────────────────────────────────────────────────────────────────┘
```

### A. CORE — MUST PRESERVE
These components provide the primary value proposition of the annotation engine. They must not be modified or replaced unless an extraordinary technical constraint arises:

1. **`cvat-canvas/` (Canvas & SVG Rendering Layer):**
   - [`src/typescript/canvasView.ts`](file:///Users/tarbipyakurel/Developer/biolabel/cvat-canvas/src/typescript/canvasView.ts): Renders decoded video frames onto an HTML5 background `<canvas>` and manages an interactive SVG overlay (`<svg id="cvat_canvas_content">`) for annotations.
   - [`src/typescript/drawHandler.ts`](file:///Users/tarbipyakurel/Developer/biolabel/cvat-canvas/src/typescript/drawHandler.ts) & [`editHandler.ts`](file:///Users/tarbipyakurel/Developer/biolabel/cvat-canvas/src/typescript/editHandler.ts): Real-time drawing, reshaping, vertex editing, and transformation of bounding boxes, polygons, polylines, points, ellipses, and skeletons.
   - [`src/typescript/masksHandler.ts`](file:///Users/tarbipyakurel/Developer/biolabel/cvat-canvas/src/typescript/masksHandler.ts): Bitmask and brush/eraser canvas editing, polygon-to-mask rasterization, and RLE compression.
   - [`src/typescript/interactionHandler.ts`](file:///Users/tarbipyakurel/Developer/biolabel/cvat-canvas/src/typescript/interactionHandler.ts): Point-based and bounding-box interactive prompting for AI segmenters (e.g. SAM 2).

2. **`cvat-data/` (Browser-Side Video & Frame Decoders):**
   - [`src/ts/cvat-data.ts`](file:///Users/tarbipyakurel/Developer/biolabel/cvat-data/src/ts/cvat-data.ts): WebWorker orchestration for non-blocking client-side decoding.
   - [`src/ts/3rdparty/Decoder.worker.js`](file:///Users/tarbipyakurel/Developer/biolabel/cvat-data/src/ts/3rdparty/Decoder.worker.js) & [`avc.wasm`](file:///Users/tarbipyakurel/Developer/biolabel/cvat-data/src/ts/3rdparty/avc.wasm): WebAssembly-based H.264/AVC video chunk decoder (Broadway engine) that decompresses video chunks directly in the browser without server frame-extraction roundtrips.
   - [`src/ts/unzip_imgs.worker.ts`](file:///Users/tarbipyakurel/Developer/biolabel/cvat-data/src/ts/unzip_imgs.worker.ts): ZIP chunk unpacker for extracted frame archives.

3. **`cvat-core/` (Annotation State, Tracks, History & Serialization):**
   - [`src/annotations-objects/track.ts`](file:///Users/tarbipyakurel/Developer/biolabel/cvat-core/src/annotations-objects/track.ts): Manages continuous object tracks spanning multiple frames, keyframe dictionaries, and outside flags.
   - [`src/annotations-objects/rectangle-track.ts`](file:///Users/tarbipyakurel/Developer/biolabel/cvat-core/src/annotations-objects/rectangle-track.ts) & [`poly-track.ts`](file:///Users/tarbipyakurel/Developer/biolabel/cvat-core/src/annotations-objects/poly-track.ts): Pure mathematical linear interpolation between keyframes.
   - [`src/annotations-history.ts`](file:///Users/tarbipyakurel/Developer/biolabel/cvat-core/src/annotations-history.ts): Command-pattern undo/redo transaction stack (`MAX_HISTORY_LENGTH = 32`).
   - [`src/annotations-saver.ts`](file:///Users/tarbipyakurel/Developer/biolabel/cvat-core/src/annotations-saver.ts): Client-side change tracking, diff calculation, and atomic persistence to the backend via `PUT` / `PATCH`.
   - [`src/frames.ts`](file:///Users/tarbipyakurel/Developer/biolabel/cvat-core/src/frames.ts): Decoded frame caching (up to 2 GB client RAM) and speculative prefetch analyzer.

4. **`cvat-ui/src/components/annotation-page/` (Annotation Workspace):**
   - Full suite of workspace controls: [`top-bar/player-navigation.tsx`](file:///Users/tarbipyakurel/Developer/biolabel/cvat-ui/src/components/annotation-page/top-bar/player-navigation.tsx) (scrubber, step forward/backward, playback speed), [`standard-workspace/objects-side-bar/`](file:///Users/tarbipyakurel/Developer/biolabel/cvat-ui/src/components/annotation-page/standard-workspace/objects-side-bar/) (object cards, label tags, lock/hide visibility, color pickers, layer stacking).

5. **`cvat/apps/engine/` & `cvat/apps/dataset_manager/` (Backend Ingestion & Persistence):**
   - [`cvat/apps/engine/task.py`](file:///Users/tarbipyakurel/Developer/biolabel/cvat/apps/engine/task.py): Video ingestion pipeline using PyAV / FFmpeg to analyze container metadata, create frame manifests (`manifest.jsonl`), and assemble compressed video chunks (`Mpeg4CompressedChunkWriter`).
   - [`cvat/apps/dataset_manager/task.py`](file:///Users/tarbipyakurel/Developer/biolabel/cvat/apps/dataset_manager/task.py): Low-level DB accessors (`get_job_data`, `put_job_data`, `patch_job_data`) converting between in-memory AnnotationIR and PostgreSQL rows.
   - [`cvat/apps/dataset_manager/export.py`](file:///Users/tarbipyakurel/Developer/biolabel/cvat/apps/dataset_manager/export.py): Datumaro-based dataset serialization (CVAT for Video, YOLO, COCO, VOC, Segmentation Masks).

---

### B. SUPPORTING — RETAIN & AUTOMATE BEHIND THE SCENES
These components are critical plumbing. Users should rarely or never interact with them directly, but the application cannot function without them:

1. **Django 4.2 Application Framework (`cvat/`):**
   - Provides REST API routing, authentication, request lifecycle, serializers, and ORM abstractions.
2. **PostgreSQL 15 (`cvat_db`):**
   - Relational persistence for all metadata, labels, tasks, jobs, segments, shapes, tracks, and users.
3. **Redis 7.2 (`cvat_redis_inmem`):**
   - High-throughput broker for RQ (Redis Queue) background jobs, job scheduling, and in-memory cache.
4. **Relational Models (`cvat/apps/engine/models.py`):**
   - `Task`, `Segment`, `Job`, `Data`, `Video`, `Label`, `AttributeSpec`, `LabeledTrack`, `TrackedShape`, `LabeledShape`, `Request`.
   - **Strategy:** When an Octate user uploads a surgical video, Octate automatically creates 1 `Task`, 1 `Data`, 1 `Segment`, and 1 `Job` transparently. The user operates directly on the video.
5. **Local Media Filesystem (`/home/django/data`):**
   - Dedicated Docker volume storing raw MP4 uploads, compressed chunks, frame manifests, and export artifacts.
6. **Local Token & Session Authentication (`cvat/apps/iam/`):**
   - Preserves authenticated API security boundaries without enterprise SSO overhead.
7. **Traefik 3.6 Reverse Proxy:**
   - Single port (`8080`) ingress routing `/api/` and `/static/` to Django WSGI and root `/` to Nginx React UI.

---

### C. OPTIONAL — CANDIDATES FOR REMOVAL / DECOMMISSIONING
These subsystems add significant RAM, CPU, container sprawl, and maintenance friction while contributing zero functionality to video annotation:

| Subsystem | Upstream Purpose | Why It Can Be Removed | Resource Savings |
| :--- | :--- | :--- | :--- |
| **ClickHouse** | Columnar DB storing event logs | Only needed for enterprise analytics dashboards | ~600 MB RAM |
| **Vector** | Agent log pipeline to ClickHouse | Only feeds ClickHouse telemetry | ~150 MB RAM |
| **Grafana** | Visualization dashboard for telemetry | Administrative monitoring not needed in local app | ~250 MB RAM |
| **Apache Kvrocks** | On-disk Redis clone for caching | Standard Redis handles local workload efficiently | ~200 MB RAM |
| **Cloud Storages** | S3 / Azure / GCS cloud mounting | Octate is strictly local-first and privacy-conscious | Eliminates 4 Python modules + UI pages |
| **Organizations** | Multi-tenant user grouping & invitations | Octate is designed for single-operator / local teams | Eliminates complex tenancy middleware |
| **Webhooks** | HTTP event triggers on task actions | Unnecessary overhead for local annotation | Eliminates 1 worker queue + DB tables |
| **Consensus & Quality** | Redundant ground-truth comparison | Complex QA flows unrelated to core annotation | Eliminates 2 worker queues |

---

### D. REQUESTS AND PROJECTS — SPECIAL HANDLING

#### 1. Projects
- In upstream CVAT, a `Project` is an optional grouping container above `Task`.
- In `cvat/apps/engine/models.py:954`, `Task.project` is defined with `null=True, blank=True`.
- **Verdict:** Do not delete the `Project` database model or migration chain (to avoid migration corruption). Instead, **completely remove Projects from the frontend UI**. All uploaded videos exist as standalone tasks.

#### 2. Requests
- In upstream CVAT, long-running operations (video ingestion, dataset export, backup generation) generate an asynchronous `models.Request` record tracked via `GET /api/requests/{rq_id}`.
- **Verdict:** **Preserve the `Request` backend model and API route**, but **remove the user-facing `/requests` management page** from navigation. The frontend will poll request status internally using progress spinners.

---

## 3. Comprehensive Component Audit Table

| Component / Subsystem | Current Purpose in CVAT | Core Dependency | Recommendation | Risk Level | Required Verification Test |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`cvat-canvas`** | HTML5 Canvas + SVG shape drawing & editing | None (Standalone package) | **KEEP INTACT** | High | Draw boxes, edit polygon vertices, paint masks with brush/eraser. |
| **`cvat-data`** | Wasm H.264 video decoding in WebWorkers | `avc.wasm`, WebWorkers | **KEEP INTACT** | High | Scrub through 4K/1080p MP4 video; verify zero dropped frames. |
| **`cvat-core`** | Object state, tracks, history, serialization | REST API | **KEEP INTACT** | High | Add keyframes, verify interpolation, trigger undo/redo, save to server. |
| **`annotation-page`** | Main annotation UI (toolbars, layers, timeline) | `cvat-core`, `cvat-canvas` | **KEEP INTACT** | High | Load job, toggle layers, lock objects, change labels, commit annotations. |
| **`cvat/apps/engine`** | Task/Job/Data models & ingestion pipeline | Django ORM, PyAV, FFmpeg | **KEEP INTACT** | High | Upload MP4 video; verify chunks created in `/home/django/data/data/`. |
| **`dataset_manager`** | Annotation IR, DB accessors, Datumaro export | Datumaro, Django ORM | **KEEP INTACT** | High | Export task annotations as "CVAT for video 1.1" and "YOLO 1.1". |
| **`cvat_db` (Postgres)** | Primary relational metadata storage | PostgreSQL 15 | **KEEP INTACT** | Critical | Verify all DB migrations apply; verify data persists across restarts. |
| **`cvat_redis_inmem`** | Broker for RQ background queues | Redis 7.2 | **KEEP INTACT** | Critical | Verify video ingestion and dataset export jobs complete successfully. |
| **`cvat_worker`** | Executes RQ tasks (chunking, export, import) | Python, PyAV, Datumaro | **CONSOLIDATE** | Medium | Verify consolidated worker container processes all core queues. |
| **`cvat/apps/organizations`**| Multi-tenant organization boundaries | Django ORM, IAM | **HIDE FROM UI** | Low | Verify users can operate and authenticate without an organization context. |
| **`cvat/apps/cloud_storages`**| External S3, GCS, Azure Blob sync | Cloud SDKs | **HIDE FROM UI** | Low | Verify local file uploads operate without cloud storage provider errors. |
| **`cvat/apps/webhooks`** | Sends outgoing HTTP notifications | Webhooks worker | **DISABLE** | Low | Verify no unhandled exceptions when webhooks worker is not running. |
| **`cvat_clickhouse`** | Analytical events store | ClickHouse server | **DECOMMISSION** | Low | Verify backend starts without ClickHouse environment variables. |
| **`cvat_vector`** | Log forwarder to ClickHouse | Vector binary | **DECOMMISSION** | Low | Verify Django logs correctly to stdout/file without Vector forwarder. |
| **`cvat_grafana`** | Monitoring dashboards | Grafana 9+ | **DECOMMISSION** | Low | Verify annotation and video workflows function with Grafana disabled. |
| **`cvat_redis_ondisk`** | Kvrocks on-disk cache | Apache Kvrocks | **DECOMMISSION** | Low | Redirect `CVAT_REDIS_ONDISK_HOST` to standard Redis; verify cache ops. |
| **`projects-page`** | Project creation and listing UI | `cvat-ui` React | **REMOVE FROM UI**| Low | Verify `/projects` route is unreachable; header link is removed. |
| **`requests-page`** | Async requests status dashboard | `cvat-ui` React | **REMOVE FROM UI**| Low | Verify async task polling operates cleanly in background without UI page. |

---

## 4. License and Originality Requirements

Octate is built upon and extends CVAT (Computer Vision Annotation Tool). We adhere strictly to open-source licensing principles:

### Upstream Licenses & Copyright Notices
- **CVAT Core License:** MIT License (Copyright (c) 2018-2022 Intel Corporation, Copyright (c) 2022-2026 CVAT.ai Corporation).
- **Datumaro License:** Apache License 2.0 (Copyright (c) 2019-2024 Intel Corporation / CVAT.ai Corporation).
- **PyAV / FFmpeg:** LGPL v2.1+ / GPL v2+.

### Code Ownership Classification
1. **Inherited CVAT Components (Unmodified or Minimally Adjusted):**
   - Canvas rendering (`cvat-canvas/`)
   - WebWorker frame decoders (`cvat-data/`)
   - Core object state & history (`cvat-core/`)
   - Annotation editor workspace (`cvat-ui/src/components/annotation-page/`)
   - Relational database schema & migrations (`cvat/apps/engine/`)
2. **Modified Components:**
   - App shell & navigation (`cvat-ui/src/components/header/`, `cvat-app.tsx`): Rebranded and simplified to 3 primary views (Videos, Annotate, Export).
   - Backend metadata views (`cvat/apps/engine/views.py`): Rebranded `about` endpoint returning `Octate`.
   - Docker Compose infrastructure (`docker-compose.yml`): Minimized from 18 to 6 containers.
3. **Original Octate Code:**
   - Lightweight zero-dependency CPU Model Server (`octate_model_server.py`).
   - One-click launcher scripts (`run_octate.sh`).
   - Visual branding, mascots, and logos (`octate_branding/`).
   - Future surgical AI inference and uncertainty-aware review interfaces.

All original Intel and CVAT.ai copyright headers in inherited source files **MUST BE PRESERVED WITHOUT MODIFICATION**.
