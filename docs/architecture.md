# Architecture

The browser loads the Next.js frontend. Traefik serves it on port 8080 for every path except `/api` (the CVAT server) and `/model-api` (the model gateway). In local development, Next.js rewrites `/api` to `API_SERVER_URL`.

The CVAT server is the engine. It stores tasks, jobs, labels, and annotations in PostgreSQL, decodes uploaded video into frames, runs exports, and registers the model gateway's functions as lambdas. It runs from the official `cvat/server` image. CVAT's own UI, `cvat-ui`, and `cvat-core` are not used.

The job editor (`frontend/src/screens/AnnotatePage.tsx`) is a Next.js page at `/tasks/<id>/jobs/<job>`. It mounts CVAT's 2D canvas, which is vendored unmodified under `vendor/cvat/canvas` and imported as `cvat-canvas-editor`. The canvas only renders: `setup(frameData, objectStates)` draws a frame, and drawing, editing, selection, and grouping come back as DOM events.

`frontend/src/lib/canvas/jobAnnotations.ts` replaces the part of `cvat-core` the editor needs. It loads `/api/jobs/<job>/annotations/`, gives each shape and track a client id, builds canvas object states for one frame (interpolating tracks between keyframes), applies edits immutably so undo and redo are a history of snapshots, and writes the whole job back with `PUT`. Skeletons, tags, and intervals are kept and saved unchanged, but not rendered.

Frames come from `/api/jobs/<job>/data?type=frame&quality=compressed&number=<frame>`, using task frame numbers. The editor caches recent frames and prefetches the next one.
