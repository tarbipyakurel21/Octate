# CVAT attribution

`canvas/` is copied from https://github.com/cvat-ai/cvat at commit `1a69829b80f7bb0438352ee4a66c84d93a1dd36b`. It is the only CVAT source in this repository.

CVAT is Copyright (C) CVAT.ai Corporation and contributors and is licensed under the MIT License. Copyright and SPDX headers in the copied files are unchanged. See `LICENSE`.

The Octate Next.js frontend imports `canvas/src/typescript/canvas.ts` as `cvat-canvas-editor` and mounts it in `frontend/src/components/CvatEditor.tsx`. The canvas is a browser renderer: it receives a frame and object states through `setup()` and reports drawing and editing through DOM events. It does not depend on `cvat-core` or `cvat-ui`.

`frontend/src/lib/canvas/jobAnnotations.ts` is original Octate code. It converts the CVAT server's `/api/jobs/<id>/annotations/` payload into canvas object states, interpolates tracks, and writes edits back. The CVAT server itself runs from the official, unmodified `cvat/server` image.
