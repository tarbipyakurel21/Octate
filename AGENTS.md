# Octate — Codex Project Instructions

## Goal
Build a lightweight surgical video annotation platform by reusing CVAT's core engineering.

Reference: https://github.com/cvat-ai/cvat

## Existing architecture
- React/TypeScript frontend in `src/`
- Python app backend in `app-server/`
- Python inference backend in `model-server/`
- Vendored CVAT code in `vendor/cvat/`
- Existing Docker Compose setup

Preserve this architecture. Do not add services or rebuild the application.

## Required functionality
1. Upload surgical videos and navigate frames.
2. Draw polygons with left-click; finish by clicking the starting vertex, double-clicking, or using Finish.
3. Right-click completed polygons to select them.
4. Edit polygon geometry.
5. Track multiple independently identified objects using SAM2.
6. Generate class-aware annotations using compatible detection models.
7. Review and correct annotations.
8. Export COCO, YOLO segmentation, and Octate native tracking data.

## Engineering rules
- Reuse existing Octate and CVAT implementations before writing replacements.
- Search CVAT with targeted `rg` commands.
- Read only relevant source ranges.
- Do not scan the entire repository unnecessarily.
- Do not invent CVAT or SAM2 APIs.
- Keep React, app-server, and model-server responsibilities separate.
- Preserve licensing and attribution.
- Implement one feature per task.
- Run focused tests.
- Avoid unrelated refactoring.
- Keep responses concise.
- Report exact files changed and test results.
- Do not claim model inference works without real inference testing.