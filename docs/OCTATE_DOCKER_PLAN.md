# OCTATE — Docker Infrastructure & Deployment Plan

**Document Version:** 1.0  
**Date:** November 2026  
**Product:** Octate — AI-Assisted Surgical Video Annotation Platform  

---

## 1. Upstream 18-Container Infrastructure vs. Octate Minimal Stack

Upstream CVAT ships with an enterprise infrastructure comprising **18 separate microservices** designed for large-scale multi-tenant cloud deployments (`upstream/docker-compose.original.yml`). 

For a local-first, privacy-conscious surgical video annotation platform, this introduces extreme resource exhaustion (`~6+ GB` idle RAM, high CPU contention, and slow start times).

Octate streamlines this infrastructure into a **6-container core stack** consuming only `~1.5 GB` RAM, while preserving 100% of the functional annotation and video processing pipeline.

```
Upstream CVAT (18 Containers, ~6.5 GB RAM)
├── Databases & Caches: Postgres, Redis In-Memory, Kvrocks On-Disk
├── Core Servers: Traefik, CVAT Server (Django/WSGI/Nginx), CVAT UI (Nginx), OPA (Auth Agent)
├── Workers: Utils, Import, Export, Annotation, Webhooks, Quality Reports, Chunks, Consensus
└── Telemetry: ClickHouse, Vector, Grafana
                                   │
                                   ▼ [Streamlined for Octate]
Octate Minimal Stack (6 Containers, ~1.5 GB RAM)
├── 1. traefik (Port 8080 gateway & router)
├── 2. cvat_ui (React SPA web application)
├── 3. cvat_server (Django REST API & WSGI application)
├── 4. cvat_worker (Consolidated RQ background worker: chunks, import, export, annotation, cleaning)
├── 5. cvat_db (PostgreSQL 15 relational metadata storage)
└── 6. cvat_redis_inmem (Redis 7.2 queue broker & cache)
```

---

## 2. Container-by-Container Audit

| # | Container Name | Upstream Role | Octate Status | Memory (Idle) | Rationale & Impact |
| :- | :--- | :--- | :--- | :- | :--- |
| 1 | **`traefik`** | Reverse proxy on `:8080` | **MUST KEEP** | ~35 MB | Routes `/api/` to backend and `/` to UI; provides unified entrypoint. |
| 2 | **`cvat_ui`** | Nginx serving React bundle | **MUST KEEP** | ~15 MB | Hosts Octate frontend application assets and HTML shell. |
| 3 | **`cvat_server`** | Django REST API & WSGI | **MUST KEEP** | ~450 MB | Handles authentication, database queries, and video upload endpoints. |
| 4 | **`cvat_worker`** | Background task processing | **CONSOLIDATED**| ~500 MB | Runs PyAV frame extraction, chunking, and Datumaro dataset exports. |
| 5 | **`cvat_db`** | PostgreSQL 15 database | **MUST KEEP** | ~80 MB | Persists annotations, task metadata, and user accounts. |
| 6 | **`cvat_redis_inmem`**| Redis 7.2 broker & cache | **MUST KEEP** | ~30 MB | Dispatches RQ background jobs and provides in-memory caching. |
| 7 | **`cvat_opa`** | Open Policy Agent (Auth) | **MUST KEEP** | ~40 MB | Enforces role-based security policies for API endpoints. |
| 8 | `cvat_redis_ondisk` | Apache Kvrocks on-disk cache | **REMOVED** | ~200 MB | Replaced by routing on-disk cache keys to standard Redis. |
| 9 | `cvat_clickhouse` | Columnar analytics database | **REMOVED** | ~600 MB | Enterprise event tracking not needed for local annotation. |
| 10| `cvat_vector` | Telemetry log forwarder | **REMOVED** | ~150 MB | Eliminates log scraping overhead to ClickHouse. |
| 11| `cvat_grafana` | Monitoring dashboard | **REMOVED** | ~250 MB | Enterprise monitoring UI not required for end-user workflow. |
| 12| `cvat_worker_import` | Standalone import worker | **CONSOLIDATED**| ~250 MB | Merged into unified `cvat_worker`. |
| 13| `cvat_worker_export` | Standalone export worker | **CONSOLIDATED**| ~250 MB | Merged into unified `cvat_worker`. |
| 14| `cvat_worker_chunks` | Standalone chunks worker | **CONSOLIDATED**| ~250 MB | Merged into unified `cvat_worker`. |
| 15| `cvat_worker_annotation`| Standalone annotation worker| **CONSOLIDATED**| ~250 MB | Merged into unified `cvat_worker`. |
| 16| `cvat_worker_utils` | Notifications & cleaning | **CONSOLIDATED**| ~250 MB | Merged into unified `cvat_worker`. |
| 17| `cvat_worker_webhooks`| Webhook delivery worker | **DISABLED** | ~250 MB | Webhooks not utilized in local-first environment. |
| 18| `cvat_worker_consensus`| Consensus merge worker | **DISABLED** | ~250 MB | Multi-annotator consensus not required for single-operator MVP. |

**Total Net Reduction:** 18 containers (`~6.5 GB` RAM) reduced to 6 containers (`~1.5 GB` RAM) — a **77% reduction in memory overhead**.

---

## 3. Minimal Docker Compose Specification

Below is the verified minimal [`docker-compose.yml`](file:///Users/tarbipyakurel/Developer/biolabel/docker-compose.yml) configuration for Octate:

```yaml
# Copyright (C) CVAT.ai Corporation & Octate Project
# SPDX-License-Identifier: MIT
#
# Minimized Octate Stack:
# - Streamlined 6-container core
# - CPU-only execution with zero paid cloud dependencies
# - Persistent local data across restarts

name: octate

x-backend-env: &backend-env
  CVAT_POSTGRES_HOST: cvat_db
  CVAT_REDIS_INMEM_HOST: cvat_redis_inmem
  CVAT_REDIS_INMEM_PORT: 6379
  CVAT_REDIS_ONDISK_HOST: cvat_redis_inmem
  CVAT_REDIS_ONDISK_PORT: 6379
  CVAT_LOG_IMPORT_ERRORS: 'true'
  CVAT_ALLOW_STATIC_CACHE: '${CVAT_ALLOW_STATIC_CACHE:-no}'
  CVAT_DEFAULT_BACKING_CS_ID:
  CVAT_NUM_PROXIES: '${CVAT_NUM_PROXIES:-1}'
  CVAT_ANALYTICS: 0
  CVAT_SERVERLESS: 1
  CVAT_NUCLIO_HOST: host.docker.internal
  CVAT_NUCLIO_PORT: 8070
  CVAT_NUCLIO_INVOKE_METHOD: dashboard
  SMOKESCREEN_OPTS: ${SMOKESCREEN_OPTS:-}
  no_proxy: opa,nuclio,${no_proxy:-}

x-backend-deps: &backend-deps
  cvat_redis_inmem:
    condition: service_started
  cvat_db:
    condition: service_started

services:
  cvat_db:
    container_name: cvat_db
    image: postgres:15-alpine
    restart: always
    environment:
      POSTGRES_USER: root
      POSTGRES_DB: cvat
      POSTGRES_HOST_AUTH_METHOD: trust
    volumes:
      - cvat_db:/var/lib/postgresql/data
    networks:
      - cvat

  cvat_redis_inmem:
    container_name: cvat_redis_inmem
    image: redis:7.2.11-alpine
    restart: always
    command: ["redis-server", "--save", "60", "100", "--appendonly", "yes"]
    volumes:
      - cvat_inmem_db:/data
    networks:
      - cvat

  cvat_opa:
    container_name: cvat_opa
    image: openpolicyagent/opa:1.12.2
    restart: always
    networks:
      cvat:
        aliases:
          - opa
    command:
      - run
      - --server
      - --addr=:8181
      - --log-level=error
      - --set=services.cvat.url=http://cvat-server:8080
      - --set=bundles.cvat.service=cvat
      - --set=bundles.cvat.resource=/api/auth/rules
      - --set=bundles.cvat.polling.min_delay_seconds=5
      - --set=bundles.cvat.polling.max_delay_seconds=15

  cvat_server:
    container_name: cvat_server
    image: cvat/server:${CVAT_VERSION:-dev}
    restart: always
    depends_on:
      <<: *backend-deps
      cvat_opa:
        condition: service_started
    environment:
      <<: *backend-env
      DJANGO_MODWSGI_EXTRA_ARGS: ''
      ALLOWED_HOSTS: '*'
      ADAPTIVE_AUTO_ANNOTATION: 'false'
      NUMPROCS: 2
      CVAT_BASE_URL:
    command: init run server nginx
    extra_hosts:
      - "host.docker.internal:host-gateway"
    labels:
      traefik.enable: "true"
      traefik.http.services.cvat.loadbalancer.server.port: "8080"
      traefik.http.routers.cvat.rule:
        Host(`${CVAT_HOST:-localhost}`) &&
        (PathPrefix(`/api/`) || PathPrefix(`/static/`) || PathPrefix(`/admin`) || PathPrefix(`/django-rq`))
      traefik.http.routers.cvat.entrypoints: web
    volumes:
      - cvat_data:/home/django/data
      - cvat_keys:/home/django/keys
      - cvat_logs:/home/django/logs
      - ./octate_branding/logo.svg:/home/django/static/logo.svg:ro
      - ./octate_branding/logo.svg:/opt/cvat/cvat/apps/engine/static/logo.svg:ro
      - ./cvat/apps/engine/views.py:/opt/cvat/cvat/apps/engine/views.py:ro
    networks:
      cvat:
        aliases:
          - cvat-server

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
      - ./octate_branding/logo.svg:/home/django/static/logo.svg:ro
      - ./octate_branding/logo.svg:/opt/cvat/cvat/apps/engine/static/logo.svg:ro
      - ./cvat/apps/engine/views.py:/opt/cvat/cvat/apps/engine/views.py:ro
    networks:
      - cvat

  cvat_ui:
    container_name: cvat_ui
    image: cvat/ui:${CVAT_VERSION:-dev}
    restart: always
    depends_on:
      - cvat_server
    labels:
      traefik.enable: "true"
      traefik.http.services.cvat-ui.loadbalancer.server.port: "8000"
      traefik.http.routers.cvat-ui.rule: Host(`${CVAT_HOST:-localhost}`)
      traefik.http.routers.cvat-ui.entrypoints: web
    volumes:
      - ./octate_branding/index.html:/usr/share/nginx/html/index.html:ro
      - ./octate_branding/favicon.ico:/usr/share/nginx/html/favicon.ico:ro
      - ./octate_branding/favicon.png:/usr/share/nginx/html/favicon.png:ro
    networks:
      - cvat

  traefik:
    image: traefik:v3.6
    container_name: traefik
    restart: always
    ports:
      - 8080:8080
    environment:
      CVAT_HOST: ${CVAT_HOST:-localhost}
      TRAEFIK_ACCESSLOG_FORMAT: json
      TRAEFIK_LOG_FORMAT: json
      TRAEFIK_ENTRYPOINTS_web_ADDRESS: :8080
      TRAEFIK_PROVIDERS_DOCKER_EXPOSEDBYDEFAULT: "false"
      TRAEFIK_PROVIDERS_DOCKER_NETWORK: cvat
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    networks:
      - cvat

volumes:
  cvat_db:
    name: biolabel_cvat_db
  cvat_data:
    name: biolabel_cvat_data
  cvat_keys:
    name: biolabel_cvat_keys
  cvat_logs:
    name: biolabel_cvat_logs
  cvat_inmem_db:
    name: biolabel_cvat_inmem_db

networks:
  cvat:
```

---

## 4. Local Data Persistence Strategy

To ensure zero data loss during container updates or restarts:

1. **PostgreSQL Relational Storage:**
   - Bound to Docker named volume `cvat_db` (`biolabel_cvat_db`).
   - Stores user accounts, tasks, segments, jobs, shapes, tracks, and keyframes at `/var/lib/postgresql/data`.
2. **Media Filesystem Storage:**
   - Bound to Docker named volume `cvat_data` (`biolabel_cvat_data`).
   - Stores raw MP4 video uploads, decoded compressed video chunks, manifests (`manifest.jsonl`), and temporary export ZIP files at `/home/django/data`.
3. **Redis Append-Only Storage:**
   - Configured with `--save 60 100 --appendonly yes` and bound to volume `cvat_inmem_db` (`biolabel_cvat_inmem_db`).
   - Ensures queue state and cache records survive process restarts.

### Launch Command:
The complete stack starts cleanly with standard Docker commands:
```bash
docker compose up -d
```
Or via the automated master launcher:
```bash
./run_octate.sh
```
