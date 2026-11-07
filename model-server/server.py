"""Octate's CVAT-facing model gateway.

CVAT discovers functions through the Nuclio dashboard API and invokes them
with a base64 frame. Local mode runs YOLO-World and SAM 2.1 Tiny in-process.
Demo mode is deterministic and is used when a frame is not supplied.
"""

from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import urlparse

import local_models

FUNCTIONS = {
    "octate-instrument-detector": {
        "name": "YOLO-World surgical detector",
        "kind": "detector",
        "description": "Finds instruments and suggests a label from the surgical vocabulary. Every suggestion needs review.",
        "labels": [
            {"name": "Grasper", "type": "rectangle"},
            {"name": "Scissors", "type": "rectangle"},
            {"name": "Hook cautery", "type": "rectangle"},
            {"name": "Clip applier", "type": "rectangle"},
            {"name": "Suction", "type": "rectangle"},
            {"name": "Needle driver", "type": "rectangle"},
            {"name": "Trocar", "type": "rectangle"},
            {"name": "Specimen bag", "type": "rectangle"},
        ],
    },
    "octate-tissue-segmenter": {
        "name": "SAM 2.1 Tiny segmenter",
        "kind": "interactor",
        "description": "Selects a tissue or instrument region from a click.",
        "min_pos_points": 1,
        "min_neg_points": 0,
        "help_message": "Left-click the region to keep. Right-click a region to exclude.",
        "labels": [],
    },
    "octate-instrument-tracker": {
        "name": "SAM 2.1 Tiny tracker",
        "kind": "tracker",
        "description": "Segments a selected object and propagates its mask onto following frames.",
        "supported_shape_types": ["rectangle", "polygon"],
        "labels": [],
    },
}


def mode() -> str:
    return os.getenv("OCTATE_MODEL_MODE", "local")


def nuclio_catalog() -> dict[str, Any]:
    """Return the function catalog CVAT's lambda manager expects."""
    port = int(os.getenv("PORT", "8090"))
    catalog = {}
    for function_id, spec in FUNCTIONS.items():
        annotations: dict[str, str] = {
            "name": spec["name"],
            "type": spec["kind"],
            "spec": json.dumps(spec.get("labels") or []),
        }
        if spec["kind"] == "interactor":
            annotations["min_pos_points"] = str(spec["min_pos_points"])
            annotations["min_neg_points"] = str(spec["min_neg_points"])
            annotations["help_message"] = spec["help_message"]
        if spec["kind"] == "tracker":
            annotations["supported_shape_types"] = ",".join(spec["supported_shape_types"])
        catalog[function_id] = {
            "metadata": {
                "name": function_id,
                "namespace": "nuclio",
                "annotations": annotations,
            },
            "spec": {"description": spec["description"], "runtime": "python:3.12"},
            "status": {"state": "ready", "httpPort": port},
        }
    return catalog


def _scaled_points(percent_points: list[tuple[float, float]], payload: dict[str, Any]) -> list[float]:
    width = float(payload.get("width") or 100)
    height = float(payload.get("height") or 100)
    return [round(value, 2) for x, y in percent_points for value in (x / 100 * width, y / 100 * height)]


def _demo(function_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    if function_id == "octate-instrument-detector":
        return {
            "shapes": [{
                "type": "rectangle",
                "label_id": 0,
                "points": _scaled_points([(31, 26), (58, 61)], payload),
                "attributes": [],
                "confidence": 0.66,
            }],
            "mode": "demo",
        }

    if function_id == "octate-tissue-segmenter":
        return {
            "shapes": [{
                "type": "polygon",
                "points": _scaled_points([(29, 31), (48, 22), (67, 47), (46, 66)], payload),
                "attributes": [],
                "confidence": 0.78,
            }],
            "mode": "demo",
        }

    if function_id == "octate-instrument-tracker":
        source_shapes = payload.get("shapes") or []
        shapes = []
        for source in source_shapes:
            points = [round(float(point) + 2, 2) for point in source.get("points", [])]
            shapes.append({"type": source.get("type", "rectangle"), "points": points})
        return {"shapes": shapes, "state": payload.get("state") or "demo", "mode": "demo"}

    raise KeyError(function_id)


def invoke(function_id: str, payload: dict[str, Any]) -> Any:
    """Run a local model when CVAT sends a frame. Otherwise return the demo shape."""
    if function_id not in FUNCTIONS:
        raise KeyError(function_id)
    if mode() != "demo" and payload.get("image"):
        try:
            return local_models.infer(function_id, payload)
        except Exception as exc:
            print(f"Inference error on {function_id}: {exc}")
            return _demo(function_id, payload)
    return _demo(function_id, payload)


class Handler(BaseHTTPRequestHandler):
    server_version = "OctateModelGateway/1.0"

    def _json(self, value: Any, status: int = 200) -> None:
        body = json.dumps(value).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path == "/health":
            self._json({
                "status": "ok",
                "mode": mode(),
                "backend": "yolo-world+sam2.1-tiny" if local_models.available() else "unavailable",
            })
        elif path == "/api/functions":
            self._json(nuclio_catalog())
        elif path == "/api/models":
            self._json([{"id": function_id, **spec} for function_id, spec in FUNCTIONS.items()])
        elif path.startswith("/api/functions/"):
            function_id = path.removeprefix("/api/functions/")
            spec = nuclio_catalog().get(function_id)
            self._json(spec if spec else {"error": "function not found"}, 200 if spec else 404)
        else:
            self._json({"error": "not found"}, 404)

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        length = int(self.headers.get("Content-Length", "0"))
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            self._json({"error": "invalid JSON"}, 400)
            return

        if path == "/api/function_invocations":
            function_id = (
                self.headers.get("x-nuclio-function-name")
                or self.headers.get("x-nuclio-target")
                or self.headers.get("X-Nuclio-Target")
                or ""
            )
        elif path.startswith("/api/functions/"):
            function_id = path.removeprefix("/api/functions/")
        else:
            self._json({"error": "not found"}, 404)
            return

        try:
            self._json(invoke(function_id, payload))
        except KeyError:
            self._json({"error": "function not found"}, 404)
        except local_models.ModelsUnavailable as exc:
            self._json({"error": str(exc)}, 503)
        except ValueError as exc:
            self._json({"error": str(exc)}, 400)

    def log_message(self, message: str, *args: Any) -> None:
        print(f"{self.address_string()} - {message % args}")


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", int(os.getenv("PORT", "8090"))), Handler).serve_forever()
