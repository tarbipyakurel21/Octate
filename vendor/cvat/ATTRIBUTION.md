# CVAT attribution

The canvas, canvas3d, and cvat-core sources under this directory are copied from https://github.com/cvat-ai/cvat at commit `1a69829b80f7bb0438352ee4a66c84d93a1dd36b`.

CVAT is Copyright (C) CVAT.ai Corporation and contributors and is licensed under the MIT License. Copyright and SPDX headers in the copied files are unchanged. See `LICENSE`.

`cvat-core/` is the upstream client module (tasks, jobs, labels, frames, object state). `cvat-ui/src/components/annotation-page/` is the upstream annotation editor, including `canvas/views/canvas2d/canvas-wrapper.tsx`, which mounts `cvat-canvas`. Both are copied unmodified. Octate's open-task page instantiates that same `Canvas` class and loads frames and object states through `/api/canvas/2d/<task>/frames/<frame>`.

`CvatCanvasAdapter` in the Octate frontend is an original isolation layer. CVAT object-state concepts stay on `/api/canvas/2d/<project>/frames/<frame>` and `/api/canvas/3d/<project>/frames/<frame>`. Canvas3D is not loaded by the primary 2D workflow. `canvas3d/src/typescript/index.ts` still imports `cvat-core`.
