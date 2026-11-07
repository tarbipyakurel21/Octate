# Limitations

- Hatchathon proof of concept; not clinical or production software.
- Use synthetic or properly de-identified media only.
- Local prototype authorization is simplified to the current annotator persona.
- Demo inference is deterministic unless real model hooks are installed.
- Model output can be wrong and always requires human review.
- Octate JSON is the reliable export format; COCO and YOLO are intentionally deferred.
- Folder upload and FFmpeg frame extraction are implemented. The interactive editor is still the original SVG surface. The CVAT canvas and canvas3d TypeScript is vendored unmodified and is not bundled: canvas depends on svg.js, and canvas3d depends on three.js plus cvat-core, which is not included. `/api/canvas/2d/<project>/frames/<frame>` and `/api/canvas/3d/<project>/frames/<frame>` store the frame and object state those packages render.
