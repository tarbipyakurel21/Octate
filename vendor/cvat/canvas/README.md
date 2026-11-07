# CVAT Canvas

Unmodified TypeScript from [cvat-ai/cvat](https://github.com/cvat-ai/cvat) `cvat-canvas/src/typescript` at commit `1a69829b80f7bb0438352ee4a66c84d93a1dd36b`.

Copyright remains in each file. The MIT license is `../LICENSE`. `canvas.ts` imports `../scss/canvas.scss`, so that stylesheet is included. `package.json` and `tsconfig.json` are the upstream package files.

These modules are not compiled into the Octate frontend. They depend on `svg.js` and its plugins. The app server stores the object state `Canvas.setup(frameData, objectStates)` expects at `/api/canvas/2d/<project>/frames/<frame>`.
