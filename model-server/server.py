"""Octate's CVAT-facing model gateway.

The gateway is independent of CVAT persistence. It publishes detector,
interactor, and tracker capabilities and returns CVAT shape records. Demo mode
is deterministic and needs no model weights.
"""

from __future__ import annotations

import json
import os
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import urlparse


FUNCTIONS = {
    "octate-instrument-detector": {
        "name": "Octate surgical instrument detector",
        "kind": "detector",
        "labels": [{"id": 0, "name": "Surgical instrument", "type": "rectangle"}],
    },
    "octate-tissue-segmenter": {
        "name": "Octate tissue segmenter",
        "kind": "interactor",
        "min_pos_points": 1,
        "min_neg_points": 0,
    },
    "octate-instrument-tracker": {
        "name": "Octate surgical instrument tracker",
        "kind": "tracker",
        "supported_shape_types": ["rectangle", "polygon", "mask"],
    },
}


def _scaled_points(percent_points: list[tuple[float, float]], payload: dict[str, Any]) -> list[float]:
    width = float(payload.get("width") or 100)
    height = float(payload.get("height") or 100)
    return [round(value, 2) for x, y in percent_points for value in (x / 100 * width, y / 100 * height)]


def invoke(function_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Return CVAT-shaped demo output for a registered function."""
    if function_id == "octate-instrument-detector":
        return {
            "shapes": [{
                "type": "rectangle",
                "label_id": 0,
                "points": _scaled_points([(31, 26), (58, 61)], payload),
                "attributes": [],
                "confidence": 0.66,
            }],
            "mode": os.getenv("OCTATE_MODEL_MODE", "demo"),
        }

    if function_id == "octate-tissue-segmenter":
        points = _scaled_points([(29, 31), (48, 22), (67, 47), (46, 66)], payload)
        return {
            "shapes": [{"type": "polygon", "points": points, "attributes": [], "confidence": 0.78}],
            "mode": os.getenv("OCTATE_MODEL_MODE", "demo"),
        }

    if function_id == "octate-instrument-tracker":
        source_shapes = payload.get("shapes") or []
        shapes = []
        for source in source_shapes:
            points = [round(float(point) + 2, 2) for point in source.get("points", [])]
            shapes.append({"type": source.get("type", "rectangle"), "points": points})
        return {
            "shapes": shapes,
            "state": payload.get("state") or str(uuid.uuid4()),
            "mode": os.getenv("OCTATE_MODEL_MODE", "demo"),
        }

    raise KeyError(function_id)


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
            self._json({"status": "ok", "mode": os.getenv("OCTATE_MODEL_MODE", "demo")})
        elif path in {"/api/models", "/api/functions"}:
            self._json([{"id": function_id, **spec} for function_id, spec in FUNCTIONS.items()])
        elif path.startswith("/api/functions/"):
            function_id = path.removeprefix("/api/functions/")
            spec = FUNCTIONS.get(function_id)
            self._json({"id": function_id, **spec} if spec else {"error": "function not found"}, 200 if spec else 404)
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

        if not path.startswith("/api/functions/"):
            self._json({"error": "not found"}, 404)
            return

        function_id = path.removeprefix("/api/functions/")
        try:
            self._json(invoke(function_id, payload))
        except KeyError:
            self._json({"error": "function not found"}, 404)

    def log_message(self, message: str, *args: Any) -> None:
        print(f"{self.address_string()} - {message % args}")


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", int(os.getenv("PORT", "8090"))), Handler).serve_forever()
