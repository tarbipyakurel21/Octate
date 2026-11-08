# Implementation progress

## 2026-11-07 — Video upload pipeline

- Root cause: the frontend sent a raw multipart `POST /api/tasks/{id}/data`, but the active Docker Compose deployment routes `/api` to `cvat_server`, whose upload endpoint requires the existing CVAT upload-session protocol.
- Restored the upload lifecycle in `frontend/src/lib/api.ts`: upload start, multipart transfer with `Upload-Multiple`, upload finish, and request polling.
- Kept the existing progress reporting and improved network-error messages without changing the upload UI.
- Verification: `npm run typecheck` passed; `git diff --check` passed. Docker runtime verification was unavailable because this environment could not access the Docker daemon or bind a local test port.

## 2026-11-08 — Runtime verification

- Confirmed runtime routing: `frontend` rewrites `/api` to `cvat_server`; `app-server` is not part of the active Compose stack.
- Confirmed failure: task creation returned `201`, then the stale frontend sent one raw `POST /api/tasks/4/data`; CVAT logged `400` with an empty response. No `Upload-Start` or `Upload-Finish` requests were received.
- Confirmed stale deployment: the running frontend bundle contained the old multipart-only implementation and no CVAT upload headers.
- Rebuilt and recreated only the existing `frontend` service. The new bundle contains `Upload-Start`, `Upload-Multiple`, and `Upload-Finish`.
- Added an HTTP-status fallback so an empty upload error reports `Upload request failed (HTTP <status>)` instead of generic `Upload failed`.
- A real authenticated MP4 upload could not be completed from this session: direct runtime requests received `401 Authentication credentials were not provided`, and browser access was unavailable. No end-to-end upload/playback success is claimed.

## 2026-11-08 — Authenticated upload verified

- Using the local `tarbi` account, an authenticated synthetic MP4 completed successfully through the live stack.
- Results: task creation `201`; upload start `202`; multipart transfer `200`; upload finish `202`; request status reached `finished`.
- The task persisted after a fresh API read with status `annotation` and `size: 5` frames. Job `1` reported frames `0–4`.
- Frame `0` retrieval returned `200` and a valid `160x90` PNG image.
- Browser editor interaction could not be directly observed because browser access was unavailable in this session; API frame retrieval verifies the backend media path, not the rendered UI.

## 2026-11-07 — Task deletion

- Added a confirmation-only delete action to every Tasks-page card, including tasks still extracting, with task name and ID, permanent-deletion warning, loading state, duplicate-request protection, inline API errors, and immediate list removal after success.
- Reused the existing authenticated/CSRF-aware API wrapper for `DELETE /api/tasks/{id}`; failed deletions keep the task visible.
- Focused tests cover successful DELETE requests, cancellation, and API error propagation.
- Verification: frontend typecheck and `git diff --check` passed. The focused Vitest file could not start because the checked-in local `node_modules` has an incompatible Vitest/Vite dependency state. Live CVAT deletion plus refresh persistence could not be verified in this session because the authenticated runtime/browser was unavailable; no end-to-end deletion success is claimed.

## 2026-11-07 — Frontend Projects removal

- Removed Projects from the frontend navigation and client-side routing; Tasks is now the primary workspace entry point.
- Removed the frontend Projects pages/routes and unused project-only API functions, normalization, and type definitions.
- Left CVAT project backend models, database tables, and API endpoints unchanged.
- Updated dashboard copy to describe tasks and jobs without changing upload, deletion, annotation, or SAM2 behavior.
- Verification: frontend `npm run typecheck` passed and source navigation checks found no `/projects` references. `npm run build` could not start compilation because the checked-in local `node_modules` has an incompatible Next/Commander dependency state (`Class extends value undefined`). Backend project code was not modified.
