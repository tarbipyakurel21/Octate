# Limitations

- Hatchathon proof of concept; not clinical or production software.
- Use synthetic or properly de-identified media only.
- Local prototype authorization is simplified to the current annotator persona.
- Demo inference is deterministic unless real model hooks are installed.
- Model output can be wrong and always requires human review.
- Octate JSON is the reliable export format; COCO and YOLO are intentionally deferred.
- Folder upload and FFmpeg frame extraction are implemented, but the current interactive editor is still an original SVG surface. The repository currently contains a CVAT adapter boundary and attribution files, not the runnable CVAT canvas engine; integrating the actual CVAT canvas package remains a follow-up. The pre-refactor source remains recoverable from Git commit `441c9f9`.
