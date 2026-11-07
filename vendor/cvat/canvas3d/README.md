# CVAT Canvas3D

Unmodified TypeScript from [cvat-ai/cvat](https://github.com/cvat-ai/cvat) `cvat-canvas3d/src/typescript` at commit `1a69829b80f7bb0438352ee4a66c84d93a1dd36b`.

Copyright remains in each file. The MIT license is `../LICENSE`. `index.ts` still imports `ObjectState` from `cvat-core`; cvat-core is not part of this copy. `package.json` and `tsconfig.json` are the upstream package files.

Canvas3D is not loaded by the 2D workspace. A cuboid it can draw is nine numbers: position, rotation, then positive scale. The app server stores that state at `/api/canvas/3d/<project>/frames/<frame>`, and accepts a PCD point cloud at `.../cloud`.
