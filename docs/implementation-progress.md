# Implementation progress

## 2026-11-08 — Upload diagnosis instrumentation

- Rebuilt and force-recreated only the existing `frontend` Docker service. The production build completed successfully, and the running container now contains the diagnostic bundle strings (`[Octate upload]` and the stable-file message).
- Added temporary, bounded diagnostics at the frontend upload boundary in `frontend/src/lib/api.ts`. Each upload logs sanitized file name, size, last-modified timestamp, phase, and elapsed milliseconds. Start/finish fetches and the multipart XHR distinguish an HTTP response from a client-side rejection; file contents, cookies, and response bodies are not logged.
- Added actionable stale-file handling: an unreadable `File` or multipart XHR rejection now says to reselect a stable local copy. Failed tasks still use the existing best-effort DELETE cleanup.
- Focused verification passed: `npm run typecheck` and `git diff --check`.
- Runtime diagnosis is not complete: the current session cannot access the Docker socket (`operation not permitted`), the browser access host is unavailable, and no local Nginx logs are present in the repository. Therefore exact failed-request timestamps, Content-Length/multipart boundary/request-body comparison, proxy forwarding, and repeated real-browser MP4 uploads remain unverified. No upload fix is claimed.
- After approved Docker-log access, the exact task 47–49 failures were correlated at `2026-11-08 06:07:36.996Z`, `06:07:38.342Z`, and `06:07:39.705Z` in the CVAT container access log. Each had `POST /api/tasks/{id}/data` → `400 0` from the container’s Nginx; there was no corresponding Uvicorn application request line, while task creation and Upload-Start did reach Uvicorn. This localizes those failures to the Nginx/proxy request-body boundary, not CVAT task processing. The running Nginx config reports `client_max_body_size 1G`; Content-Length, boundary bytes, and the Next.js forwarding behavior still require a browser Network capture or an equivalent reproducible request.
- Nginx’s error stream at the same timestamps contained no `invalid request body`, `prematurely closed`, `malformed boundary`, upstream, or other explanatory error—only the access-log `400 0` entries. Thus the exact Nginx rejection reason is not established.

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

## 2026-11-07 — Production frontend rebuild

- Removed the four unreachable frontend Projects route/component files left behind after Projects was removed; this fixes the production build error from the deleted `Project` type without touching CVAT project APIs.
- Rebuilt and force-recreated the existing `frontend` Docker service successfully.
- `npm run typecheck` passed; `git diff --check` passed.
- The checked-in Vitest installation still cannot start because its Vite dependency files are incompatible (`does not provide an export named 'a'`).
- Host-level verification of `http://localhost:8080/tasks`, deletion persistence, and a real MP4 upload was blocked by this session's Docker socket/localhost sandbox permissions. No additional end-to-end runtime success is claimed here.
