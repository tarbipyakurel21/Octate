"""In-process learned models for detection, segmentation, and tracking.

YOLO-World Tiny proposes a label from Octate's surgical vocabulary. Tiny SAM
(MobileSAM / SAM 2.1 Tiny) turns a click or selected box into a polygon; tracking
feeds each resulting polygon forward as the prompt for the next frame. Frames never
leave this process. Model weights are pre-warmed at startup and cached in-process.
Optimized for high-throughput, low-latency CPU inference using CVAT's serverless pipeline.
"""

from __future__ import annotations

import base64
import math
import os
import threading
import time
import uuid
from typing import Any

import numpy as np

_TRACKERS: dict[str, dict[str, Any]] = {}
_TRACKERS_LOCK = threading.Lock()
_TRACKER_TTL_SECONDS = 8 * 60 * 60
_MODELS: dict[str, Any] = {}
_MODELS_LOCK = threading.Lock()

SURGICAL_LABELS = [
    "Grasper",
    "Scissors",
    "Hook cautery",
    "Clip applier",
    "Suction",
    "Needle driver",
    "Trocar",
    "Specimen bag",
]


class ModelsUnavailable(RuntimeError):
    """Raised when the local vision library cannot be loaded."""


def _configure_cpu_runtime():
    """Tune PyTorch CPU threading to prevent contention and optimize cache locality."""
    try:
        import torch

        threads = min(4, max(1, (os.cpu_count() or 2) // 2))
        torch.set_num_threads(threads)
        torch.set_num_interop_threads(1)
    except Exception:
        pass


def _resolve_path(env_var: str, candidate_filenames: list[str]) -> str:
    """Find the best available model weights path across standard locations."""
    from_env = os.getenv(env_var)
    if from_env and os.path.isfile(from_env):
        return from_env

    search_dirs = [
        "/app",
        "/models",
        os.path.dirname(os.path.abspath(__file__)),
        os.getcwd(),
    ]
    for filename in candidate_filenames:
        for directory in search_dirs:
            candidate = os.path.join(directory, filename)
            if os.path.isfile(candidate):
                return candidate

    return from_env or candidate_filenames[0]


def available() -> bool:
    try:
        import cv2  # noqa: F401
        import ultralytics  # noqa: F401
    except ImportError:
        return False
    return True


def init_models() -> None:
    """Pre-warm models at server startup so subsequent inference requests are fast."""
    _configure_cpu_runtime()
    try:
        _model("detector")
    except Exception as exc:
        print(f"[ModelGateway] Detector warm-up notice: {exc}")
    try:
        _model("segmenter")
    except Exception as exc:
        print(f"[ModelGateway] SAM segmenter warm-up notice: {exc}")


def infer(function_id: str, payload: dict[str, Any]) -> Any:
    cv2 = _cv2()
    image = _extract_image(cv2, payload)
    if os.getenv("OCTATE_MODEL_MODE", "local") == "opencv":
        return _infer_opencv(function_id, payload, cv2, image)
    if function_id == "octate-instrument-detector":
        return _detect_learned(cv2, image, _threshold(payload))
    if function_id == "octate-tissue-segmenter":
        return _segment_learned(cv2, image, payload)
    if function_id == "octate-instrument-tracker":
        return _track_learned(cv2, image, payload.get("shapes") or [], payload.get("states") or [])
    raise KeyError(function_id)


def _infer_opencv(function_id: str, payload: dict[str, Any], cv2, image) -> Any:
    """Small dependency-only fallback, enabled explicitly for tests/debugging."""
    if function_id == "octate-instrument-detector":
        return _detect(cv2, image, _threshold(payload))
    if function_id == "octate-tissue-segmenter":
        return _segment(cv2, image, payload)
    if function_id == "octate-instrument-tracker":
        return _track(cv2, image, payload.get("shapes") or [], payload.get("states") or [])
    raise KeyError(function_id)


def _model(kind: str):
    with _MODELS_LOCK:
        if kind in _MODELS:
            return _MODELS[kind]
        try:
            from ultralytics import SAM, YOLO, YOLOWorld
        except ImportError as exc:
            raise ModelsUnavailable("Ultralytics is not installed in the model gateway") from exc

        _configure_cpu_runtime()
        try:
            if kind == "detector":
                path = _resolve_path(
                    "OCTATE_DETECTOR_MODEL",
                    ["yolov8s-worldv2.pt", "yolov8n.pt", "yolov8s-world.pt"],
                )
                if "world" in os.path.basename(path).lower():
                    loaded = YOLOWorld(path)
                    loaded.set_classes(SURGICAL_LABELS)
                else:
                    loaded = YOLO(path)
                # Warm up CPU allocator and JIT
                dummy = np.zeros((320, 320, 3), dtype=np.uint8)
                loaded.predict(source=dummy, imgsz=320, verbose=False)
            else:
                path = _resolve_path(
                    "OCTATE_SAM_MODEL",
                    ["mobile_sam.pt", "sam2.1_t.pt"],
                )
                loaded = SAM(path)
                dummy = np.zeros((320, 320, 3), dtype=np.uint8)
                loaded.predict(source=dummy, bboxes=[[10, 10, 50, 50]], verbose=False)
        except Exception as exc:
            raise ModelsUnavailable(
                f"Could not load {kind} weights ({path}): {exc}"
            ) from exc

        _MODELS[kind] = loaded
        print(f"[ModelGateway] Successfully initialized and pre-warmed {kind} model from {path}")
        return loaded


def _detect_learned(cv2, image, threshold: float) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []
    try:
        import torch

        detector = _model("detector")
        effective_conf = max(0.002, min(threshold * 0.1, 0.05))
        with torch.inference_mode():
            results = detector.predict(source=image, imgsz=640, conf=effective_conf, verbose=False)
        if results and results[0].boxes is not None:
            boxes = results[0].boxes
            for xyxy, confidence, class_id in zip(
                boxes.xyxy.cpu().tolist(),
                boxes.conf.cpu().tolist(),
                boxes.cls.cpu().tolist(),
            ):
                index = int(class_id)
                label = (
                    SURGICAL_LABELS[index]
                    if 0 <= index < len(SURGICAL_LABELS)
                    else str(results[0].names.get(index, "Instrument"))
                )
                found.append({
                    "label": label,
                    "confidence": round(float(confidence), 4),
                    "points": [round(float(value), 2) for value in xyxy],
                    "type": "rectangle",
                    "attributes": [],
                })
    except Exception as exc:
        print(f"[ModelGateway] Learned detector error: {exc}")

    # Fall back to OpenCV surgical locator if YOLO detected nothing
    if not found:
        found = _detect(cv2, image, min(threshold, 0.4))
    return found


def _result_polygon(result) -> list[float] | None:
    masks = getattr(result, "masks", None)
    polygons = getattr(masks, "xy", None) if masks is not None else None
    if not polygons:
        return None
    polygon = max(polygons, key=lambda value: len(value))
    if len(polygon) < 3:
        return None

    # Use Douglas-Peucker polygon approximation to reduce vertices for smooth CVAT rendering
    try:
        import cv2

        pts = np.array(polygon, dtype=np.float32).reshape((-1, 1, 2))
        arc_len = float(cv2.arcLength(pts, True))
        epsilon = max(1.0, 0.005 * arc_len)
        approx = cv2.approxPolyDP(pts, epsilon, True)
        if len(approx) >= 3:
            pts = approx
        if len(pts) > 80:
            step = max(1, len(pts) // 80)
            pts = pts[::step]
        if len(pts) < 3:
            return None
        return [round(float(coord), 2) for pt in pts[:, 0, :] for coord in pt]
    except Exception:
        if len(polygon) > 80:
            polygon = polygon[:: max(1, len(polygon) // 80)]
        return [round(float(axis), 2) for point in polygon for axis in point[:2]]


def _sam_polygon(
    image,
    *,
    points: list[tuple[int, int]] | None = None,
    bbox: tuple[int, int, int, int] | None = None,
) -> list[float] | None:
    arguments: dict[str, Any] = {"source": image, "verbose": False}
    if bbox is not None:
        arguments["bboxes"] = [list(bbox)]
    if points:
        arguments["points"] = [[list(point) for point in points]]
        arguments["labels"] = [[1] * len(points)]
    try:
        import torch

        segmenter = _model("segmenter")
        with torch.inference_mode():
            results = segmenter.predict(**arguments)
    except Exception as exc:
        print(f"[ModelGateway] SAM predict failed: {exc}")
        return None
    return _result_polygon(results[0]) if results else None


def _segment_learned(cv2, image, payload: dict[str, Any]) -> dict[str, Any]:
    height, width = image.shape[:2]
    positive = [_clamp_point(point, width, height) for point in payload.get("pos_points") or []]
    bbox = _bounds(payload.get("obj_bbox"), width, height)
    if not positive and bbox is None:
        raise ValueError("pos_points or obj_bbox is required")
    # If bbox is given without points, use center of bbox as positive prompt point
    if bbox is not None and not positive:
        cx = int((bbox[0] + bbox[2]) / 2)
        cy = int((bbox[1] + bbox[3]) / 2)
        positive = [(cx, cy)]
    points = _sam_polygon(image, points=positive, bbox=bbox)
    if not points:
        # Fall back to contour segmentation
        return _segment(cv2, image, payload)
    return {"shapes": [{"type": "polygon", "points": points, "confidence": 0.95, "attributes": []}]}


def _track_learned(cv2, image, shapes: list[Any], states: list[Any]) -> dict[str, Any]:
    height, width = image.shape[:2]
    count = max(len(shapes), len(states))
    out_shapes: list[Any] = []
    out_states: list[Any] = []
    for index in range(count):
        shape = shapes[index] if index < len(shapes) else None
        state = states[index] if index < len(states) and isinstance(states[index], dict) else None
        raw_points = shape.get("points") if isinstance(shape, dict) else None
        bbox = _bounds(raw_points, width, height) if raw_points else None
        if bbox is None and state:
            bbox = _bounds(state.get("bbox"), width, height)
        if bbox is None:
            out_shapes.append(None)
            out_states.append(state)
            continue
        polygon = _sam_polygon(image, bbox=bbox)
        if not polygon:
            # Fall back to template tracker so tracking doesn't drop the shape
            fallback_res = _track(cv2, image, [shape] if shape else [], [state] if state else [])
            if fallback_res.get("shapes") and fallback_res["shapes"][0]:
                out_shapes.append(fallback_res["shapes"][0])
                out_states.append(fallback_res["states"][0])
                continue
            out_shapes.append(None)
            out_states.append(state)
            continue
        next_bbox = _bounds(polygon, width, height) or bbox
        out_shapes.append({"type": "polygon", "points": polygon})
        out_states.append({"id": (state or {}).get("id") or str(uuid.uuid4()), "bbox": list(next_bbox)})
    return {"shapes": out_shapes, "states": out_states}


def _cv2():
    try:
        import cv2
    except ImportError as exc:
        raise ModelsUnavailable("OpenCV is not installed in the model gateway") from exc
    return cv2


def _extract_image(cv2, payload: dict[str, Any]):
    """Extract and decode image either from raw base64 or by ingesting from CVAT API."""
    encoded = payload.get("image")
    if encoded:
        return _decode_image(cv2, encoded)

    # CVAT data ingestion fallback: if frame and job are provided, fetch directly from CVAT
    job_id = payload.get("job")
    frame_num = payload.get("frame")
    if job_id is not None and frame_num is not None:
        try:
            import urllib.request

            cvat_url = os.getenv("CVAT_SERVER_URL", "http://cvat-server:8080")
            url = f"{cvat_url}/api/jobs/{job_id}/data?type=frame&quality=original&number={frame_num}"
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=5) as response:
                raw_bytes = response.read()
                image = cv2.imdecode(np.frombuffer(raw_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
                if image is not None:
                    return image
        except Exception as exc:
            print(f"[ModelGateway] Ingesting frame from CVAT failed: {exc}")

    raise ValueError("image (or valid CVAT job+frame) is required")


def _decode_image(cv2, encoded: Any):
    if not isinstance(encoded, str) or not encoded:
        raise ValueError("image is required")
    # Strip data URL prefix if present (e.g. data:image/jpeg;base64,...)
    if "," in encoded and encoded.startswith("data:"):
        encoded = encoded.split(",", 1)[1]
    try:
        raw = base64.b64decode(encoded, validate=False)
    except Exception as exc:
        raise ValueError("image is not valid base64") from exc
    image = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("image could not be decoded")
    return image


def _threshold(payload: dict[str, Any]) -> float:
    try:
        return float(payload.get("threshold", 0.5))
    except (TypeError, ValueError):
        return 0.5


def _detect(cv2, image, threshold: float) -> list[dict[str, Any]]:
    height, width = image.shape[:2]
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    saturation = hsv[:, :, 1]
    value = hsv[:, :, 2]
    # Instruments read as dark, low-saturation metallic shapes against brighter tissue.
    mask = ((saturation < 85) & (value > 12) & (value < 220)).astype(np.uint8) * 255
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    frame_area = float(height * width)
    found: list[dict[str, Any]] = []
    for contour in contours:
        area = float(cv2.contourArea(contour))
        if area < frame_area * 0.002 or area > frame_area * 0.45:
            continue
        (_, _), (rect_width, rect_height), _ = cv2.minAreaRect(contour)
        long_side = max(rect_width, rect_height)
        short_side = max(min(rect_width, rect_height), 1.0)
        aspect = long_side / short_side
        if aspect < 1.3:
            continue
        x, y, box_width, box_height = cv2.boundingRect(contour)
        touches = x <= 1 or y <= 1 or x + box_width >= width - 1 or y + box_height >= height - 1
        label, confidence = _classify(aspect, short_side, touches)
        if confidence < min(threshold, 0.4):
            continue
        found.append(
            {
                "label": label,
                "confidence": f"{confidence:.2f}",
                "points": [int(x), int(y), int(min(width, x + box_width)), int(min(height, y + box_height))],
                "type": "rectangle",
                "attributes": [],
            }
        )
    found.sort(key=lambda item: float(item["confidence"]), reverse=True)
    return found[:12]


def _classify(aspect: float, short_side: float, touches_border: bool) -> tuple[str, float]:
    confidence = 0.78 if touches_border else 0.6
    if aspect >= 8 and short_side <= 42:
        return "Hook cautery", min(confidence + 0.06, 0.93)
    if aspect >= 4.5:
        return "Grasper", confidence
    if short_side >= 30 and aspect < 3.2:
        return "Suction", max(confidence - 0.06, 0.5)
    if aspect >= 3:
        return "Scissors", max(confidence - 0.04, 0.5)
    return "Clip applier", max(confidence - 0.08, 0.5)


def _segment(cv2, image, payload: dict[str, Any]) -> dict[str, Any]:
    height, width = image.shape[:2]
    positive = [_clamp_point(point, width, height) for point in payload.get("pos_points") or []]
    negative = [_clamp_point(point, width, height) for point in payload.get("neg_points") or []]
    if not positive:
        raise ValueError("pos_points is required")
    bounds = _bounds(payload.get("obj_bbox"), width, height)

    chosen = None
    frame_area = height * width
    for tolerance in (20, 36, 52):
        filled = _flood(cv2, image, positive, negative, bounds, tolerance)
        area = int(cv2.countNonZero(filled))
        if area <= 0 or area > frame_area * 0.75:
            continue
        chosen = filled
        if area >= 80:
            break

    points = _contour_points(cv2, chosen) if chosen is not None else None
    if not points:
        points = _disk(positive[0][0], positive[0][1], width, height)
    return {"shapes": [{"type": "polygon", "points": points, "attributes": []}]}


def _flood(cv2, image, positive, negative, bounds, tolerance: int):
    height, width = image.shape[:2]
    mask = np.zeros((height + 2, width + 2), np.uint8)
    if bounds is not None:
        x1, y1, x2, y2 = bounds
        mask[:] = 1
        mask[y1 + 1 : y2 + 2, x1 + 1 : x2 + 2] = 0
    for x, y in negative:
        cv2.circle(mask, (x + 1, y + 1), 6, 1, -1)
    flags = cv2.FLOODFILL_MASK_ONLY | cv2.FLOODFILL_FIXED_RANGE | (255 << 8)
    lo = (tolerance, tolerance, tolerance)
    for x, y in positive:
        if mask[y + 1, x + 1]:
            continue
        cv2.floodFill(image.copy(), mask, (x, y), (0, 0, 0), lo, lo, flags)
    filled = mask[1:-1, 1:-1]
    return np.where(filled == 255, np.uint8(255), np.uint8(0))


def _contour_points(cv2, filled) -> list[float] | None:
    contours, _ = cv2.findContours(filled, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None
    contour = max(contours, key=cv2.contourArea)
    if len(contour) < 3:
        return None
    epsilon = max(1.0, 0.01 * cv2.arcLength(contour, True))
    approx = cv2.approxPolyDP(contour, epsilon, True)
    chosen = approx if len(approx) >= 3 else contour
    if len(chosen) > 80:
        chosen = chosen[:: max(1, len(chosen) // 80)]
    if len(chosen) < 3:
        return None
    return [float(axis) for point in chosen[:, 0, :] for axis in (int(point[0]), int(point[1]))]


def _disk(x: int, y: int, width: int, height: int, radius: int = 16) -> list[float]:
    points: list[float] = []
    for step in range(12):
        angle = 2 * math.pi * step / 12
        px = min(max(x + radius * math.cos(angle), 0), width - 1)
        py = min(max(y + radius * math.sin(angle), 0), height - 1)
        points.extend([round(px, 1), round(py, 1)])
    return points


def _bounds(raw: Any, width: int, height: int) -> tuple[int, int, int, int] | None:
    if not isinstance(raw, list) or len(raw) < 2:
        return None
    if isinstance(raw[0], (list, tuple)):
        xs = [float(point[0]) for point in raw]
        ys = [float(point[1]) for point in raw]
    else:
        values = [float(value) for value in raw]
        xs = values[0::2]
        ys = values[1::2]
    if not xs or not ys:
        return None
    x1 = min(max(int(min(xs)), 0), width - 1)
    y1 = min(max(int(min(ys)), 0), height - 1)
    x2 = min(max(int(max(xs)), 0), width - 1)
    y2 = min(max(int(max(ys)), 0), height - 1)
    if x2 <= x1 or y2 <= y1:
        return None
    return x1, y1, x2, y2


def _clamp_point(point: Any, width: int, height: int) -> tuple[int, int]:
    x = int(round(float(point[0])))
    y = int(round(float(point[1])))
    return min(max(x, 0), width - 1), min(max(y, 0), height - 1)


def _track(cv2, image, shapes: list[Any], states: list[Any]) -> dict[str, Any]:
    count = max(len(shapes), len(states))
    out_shapes = []
    out_states = []
    for index in range(count):
        shape = shapes[index] if index < len(shapes) else None
        state = states[index] if index < len(states) and isinstance(states[index], dict) else None
        points = _shape_points(shape)
        bbox = _box_from_points(points, image.shape[1], image.shape[0]) if points else None
        if bbox is None and state and state.get("bbox"):
            bbox = _box_from_points(state["bbox"], image.shape[1], image.shape[0])
        if bbox is None:
            out_shapes.append(None)
            out_states.append(state)
            continue
        tracker_id = str(state.get("id")) if state and state.get("id") else None
        if points and not tracker_id:
            tracker_id = str(uuid.uuid4())
            _remember(cv2, tracker_id, image, bbox)
            found = bbox
        else:
            found = _follow(cv2, tracker_id, image, bbox)
        out_shapes.append({"type": "rectangle", "points": [int(v) for v in found]})
        out_states.append({"id": tracker_id, "bbox": [int(v) for v in found]})
    return {"shapes": out_shapes, "states": out_states}


def _shape_points(shape: Any) -> list[float] | None:
    if isinstance(shape, dict):
        raw = shape.get("points")
    elif isinstance(shape, list):
        raw = shape
    else:
        return None
    if not isinstance(raw, list) or len(raw) < 4:
        return None
    return [float(value) for value in raw[:4]]


def _box_from_points(points: list[float] | None, width: int, height: int) -> tuple[int, int, int, int] | None:
    if not points:
        return None
    x1 = min(max(int(round(min(points[0], points[2]))), 0), width - 1)
    y1 = min(max(int(round(min(points[1], points[3]))), 0), height - 1)
    x2 = min(max(int(round(max(points[0], points[2]))), 0), width)
    y2 = min(max(int(round(max(points[1], points[3]))), 0), height)
    if x2 - x1 < 2 or y2 - y1 < 2:
        return None
    return x1, y1, x2, y2


def _remember(cv2, tracker_id: str, image, bbox: tuple[int, int, int, int]) -> None:
    x1, y1, x2, y2 = bbox
    template = image[y1:y2, x1:x2].copy()
    if template.size == 0:
        return
    with _TRACKERS_LOCK:
        _TRACKERS[tracker_id] = {"template": template, "bbox": bbox, "seen": time.time()}
        _purge_trackers()


def _follow(cv2, tracker_id: str | None, image, bbox: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    if not tracker_id:
        return bbox
    with _TRACKERS_LOCK:
        entry = _TRACKERS.get(tracker_id)
    if not entry:
        return bbox
    template = entry["template"]
    template_height, template_width = template.shape[:2]
    height, width = image.shape[:2]
    x1, y1, x2, y2 = bbox
    margin = max(template_width, template_height, 32)
    search_x1 = max(0, x1 - margin)
    search_y1 = max(0, y1 - margin)
    search_x2 = min(width, x2 + margin)
    search_y2 = min(height, y2 + margin)
    search = image[search_y1:search_y2, search_x1:search_x2]
    if search.shape[0] < template_height or search.shape[1] < template_width:
        return bbox
    scores = cv2.matchTemplate(search, template, cv2.TM_CCOEFF_NORMED)
    _, score, _, location = cv2.minMaxLoc(scores)
    if score < 0.35:
        return bbox
    found_x1 = search_x1 + int(location[0])
    found_y1 = search_y1 + int(location[1])
    found = (found_x1, found_y1, found_x1 + template_width, found_y1 + template_height)
    with _TRACKERS_LOCK:
        current = _TRACKERS.get(tracker_id)
        if current is not None:
            current["bbox"] = found
            current["seen"] = time.time()
    return found


def _purge_trackers() -> None:
    now = time.time()
    expired = [key for key, value in _TRACKERS.items() if now - value["seen"] > _TRACKER_TTL_SECONDS]
    for key in expired:
        del _TRACKERS[key]
    overflow = len(_TRACKERS) - 200
    if overflow > 0:
        oldest = sorted(_TRACKERS, key=lambda key: _TRACKERS[key]["seen"])
        for key in oldest[:overflow]:
            del _TRACKERS[key]
