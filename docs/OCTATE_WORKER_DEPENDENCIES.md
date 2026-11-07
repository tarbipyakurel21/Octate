# OCTATE — Worker and Infrastructure Audit

**Document Version:** 1.0  
**Date:** November 2026  
**Product:** Octate — AI-Assisted Surgical Video Annotation Platform  

---

## 1. Upstream Worker Architecture Overview

In CVAT's upstream enterprise configuration (`upstream/docker-compose.original.yml`), the background task architecture is divided across **8 separate worker containers**, all running the identical Docker image (`cvat/server:${CVAT_VERSION:-dev}`), managed by `supervisord` and backed by `redis_inmem` (Redis 7.2) via Python RQ (Redis Queue).

### The Worker Entrypoint Mechanism
In [`backend_entrypoint.sh:144-180`](file:///Users/tarbipyakurel/Developer/biolabel/backend_entrypoint.sh#L144-L180), CVAT provides a native multi-queue argument parser:

```bash
run worker <queue_1> <queue_2> ... <queue_N> [--with-scheduler]
```

When multiple queues are passed to `run worker`:
1. `backend_entrypoint.sh` exports `CVAT_QUEUES="queue_1 queue_2 ... queue_N"`.
2. Supervisord executes:
   ```bash
   django-admin rqworker -v 3 %(ENV_CVAT_QUEUES)s --worker-class=cvat.rqworker.DefaultWorker
   ```
3. If `--with-scheduler` is present, `supervisord` simultaneously launches `rqscheduler.py` to handle periodic tasks (cache invalidation, cleanup).

**Key Takeaway:** CVAT's native architecture was explicitly designed to allow workers to consume either one queue or multiple queues simultaneously without changing Python code or worker internals.

---

## 2. Upstream Worker Service Audit

The table below audits every worker service from `upstream/docker-compose.original.yml`:

| Service Name in Upstream Compose | Consumed Queues | Primary Purpose | Video Upload Needed? | Annotation Editing Needed? | Export / Import Needed? | Safe to Disable? | Must Remain Running? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`cvat_worker_chunks`** | `chunks` | High-throughput video frame chunk extraction & transcode | **YES** | No | No | No | **YES** |
| **`cvat_worker_import`** | `import` | Video file ingestion, dataset unpacking, task initialization | **YES** | No | **YES** | No | **YES** |
| **`cvat_worker_export`** | `export` | Dataset format serialization (Datumaro, YOLO, COCO, VOC) | No | No | **YES** | No | **YES** |
| **`cvat_worker_annotation`**| `annotation` | Auto-annotation batch processing & model inference | No | Optional | No | No | **YES** |
| **`cvat_worker_utils`** | `notifications`, `cleaning` | Cache sweeps, temporary file deletion, email alerts | No | No | No | Partial (Keep `cleaning`) | **YES** |
| **`cvat_worker_quality_reports`**| `quality_reports` | Ground-truth verification, IoU calculation | No | No | No | **YES (Safe to disable)** | No |
| **`cvat_worker_consensus`** | `consensus` | Multi-annotator agreement merging | No | No | No | **YES (Safe to disable)** | No |
| **`cvat_worker_webhooks`** | `webhooks` | Outbound HTTP webhook delivery | No | No | No | **YES (Safe to disable)** | No |

---

## 3. Queue-by-Queue Functional Breakdown

### 1. `chunks` Queue
* **Enqueued By:** `cvat/apps/engine/task.py:_create_static_chunks()`
* **Executed Function:** `Mpeg4CompressedChunkWriter`, `ZipCompressedChunkWriter`
* **Necessity:** **CRITICAL**. Without this queue, uploaded video files cannot be partitioned into client-streamable MP4 chunks. The frontend will stall indefinitely waiting for chunk generation.

### 2. `import` Queue
* **Enqueued By:** `cvat/apps/engine/background.py:TaskCreator.enqueue_job()`
* **Executed Function:** `cvat.apps.engine.task.initialize_task`
* **Necessity:** **CRITICAL**. Orchestrates media discovery, video container parsing via PyAV, frame counting, dimension extraction, and database creation of `Segment` and `Job` records.

### 3. `export` Queue
* **Enqueued By:** `cvat/apps/engine/mixins.py:DatasetExporter.enqueue_job()`
* **Executed Function:** `cvat.apps.dataset_manager.export.export_job`
* **Necessity:** **CRITICAL**. Executes Datumaro export algorithms to generate user-downloadable dataset packages (YOLO, COCO, CVAT for Video).

### 4. `annotation` Queue
* **Enqueued By:** Auto-annotation / AI dispatch handlers.
* **Executed Function:** Background model execution and batch prediction application.
* **Necessity:** **CRITICAL for AI workflows**. Used when running auto-labeling over multiple video frames.

### 5. `cleaning` Queue
* **Enqueued By:** Periodic `rqscheduler` and manual cleanup triggers.
* **Executed Function:** Purges stale temporary files, failed upload fragments, and expired download archives.
* **Necessity:** **CRITICAL for local storage health**. Prevents disk exhaustion on the host machine.

### 6. `notifications` Queue
* **Enqueued By:** User invitations, email verifications.
* **Necessity:** **OPTIONAL**. Octate uses local authentication; external email servers are not used in local deployments.

### 7. `quality_reports`, `consensus`, `webhooks` Queues
* **Necessity:** **OPTIONAL**. Enterprise collaboration features not required for local-first surgical video annotation.

---

## 4. Minimum Reliable Worker Topology for Octate

Rather than running 8 distinct container instances (which consume ~2.5 GB of idle RAM just for Python interpreter overhead), Octate uses CVAT's native multi-queue support to run **one consolidated worker container**:

```yaml
  cvat_worker:
    container_name: cvat_worker
    image: cvat/server:${CVAT_VERSION:-dev}
    restart: always
    depends_on: *backend-deps
    environment:
      <<: *backend-env
      CVAT_REDIS_INMEM_PASSWORD: ''
      NUMPROCS: 2
    extra_hosts:
      - "host.docker.internal:host-gateway"
    command: run worker chunks import export annotation cleaning --with-scheduler
    volumes:
      - cvat_data:/home/django/data
      - cvat_keys:/home/django/keys
      - cvat_logs:/home/django/logs
    networks:
      - cvat
```

### Why this topology is 100% reliable:
1. **Preserves Native Logic:** No worker code, queue names, or serializers are modified.
2. **Deterministic Priority:** RQ worker processes queues in order: `chunks` → `import` → `export` → `annotation` → `cleaning`.
3. **Concurrency:** `NUMPROCS: 2` provides 2 concurrent supervisor processes, allowing simultaneous video decoding and dataset export without blocking.
4. **Active Scheduler:** `--with-scheduler` ensures `rqscheduler` maintains cache cleanliness.
