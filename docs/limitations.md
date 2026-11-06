# Limitations

- Hatchathon proof of concept; not clinical or production software.
- Use synthetic or properly de-identified media only.
- Local prototype authorization is simplified to the current annotator persona.
- Demo inference is deterministic unless real model hooks are installed.
- Model output can be wrong and always requires human review.
- Octate JSON is the reliable export format; COCO and YOLO are intentionally deferred.
- Video decoding/upload storage and a final attributed CVAT Canvas extraction are follow-ups; the current demo uses an original synthetic surgical frame surface. The pre-refactor source remains recoverable from Git commit `441c9f9`.
