"""Model requests for one frame of a task.

The model server is used when it is running. Otherwise the same request
returns a deterministic shape scaled to the frame size and `mode` is
`deterministic-demo`, which means no weights were loaded.
"""
from __future__ import annotations

import json
import os
import urllib.request
import uuid
from datetime import datetime, timezone

MODEL = os.getenv("MODEL_SERVER_URL", "http://localhost:8090")


def deterministic(kind: str, frame: int, width: int = 0, height: int = 0) -> dict:
    ident = str(uuid.uuid4())
    polygon = kind == "segment"
    scale_x = width or 100
    scale_y = height or 100

    def point(x: float, y: float) -> dict:
        return {"x": round(x / 100 * scale_x, 2), "y": round(y / 100 * scale_y, 2)}

    annotation = {
        "id": ident,
        "frame": frame,
        "label": "Tissue boundary" if polygon else "Surgical instrument",
        "type": "polygon" if polygon else "rectangle",
        "points": [point(32, 32), point(52, 25), point(64, 52), point(41, 65)]
        if polygon
        else [point(35, 24), point(59, 57)],
        "confidence": 0.68,
        "approved": False,
        "keyframe": True,
    }
    review = {
        "id": str(uuid.uuid4()),
        "frame": frame,
        "score": 0.64,
        "reasons": [
            "Low detection confidence (68%)",
            "Temporal position changed from previous frame",
        ],
        "status": "pending",
        "annotationId": ident,
    }
    return {"annotations": [annotation], "review_items": [review], "mode": "deterministic-demo"}


def run(db, kind: str, data: dict) -> dict:
    run_id = str(uuid.uuid4())
    task_id = data["project_id"]
    db.execute(
        "INSERT INTO model_runs VALUES (?,?,?,?,?)",
        (run_id, task_id, kind, "running", datetime.now(timezone.utc).isoformat()),
    )
    db.commit()
    try:
        request = urllib.request.Request(
            f"{MODEL}/api/inference/{kind}",
            json.dumps(data).encode(),
            {"Content-Type": "application/json"},
        )
        result = json.loads(urllib.request.urlopen(request, timeout=8).read())
    except Exception:
        result = deterministic(
            kind,
            int(data.get("frame", 0)),
            int(data.get("width") or 0),
            int(data.get("height") or 0),
        )
    for annotation in result["annotations"]:
        db.execute(
            "INSERT OR REPLACE INTO annotations VALUES (?,?,?)",
            (annotation["id"], task_id, json.dumps(annotation)),
        )
    for item in result["review_items"]:
        db.execute(
            "INSERT OR REPLACE INTO review_items VALUES (?,?,?,?,?,?,?)",
            (
                item["id"],
                task_id,
                item["frame"],
                item["score"],
                json.dumps(item["reasons"]),
                item["status"],
                item["annotationId"],
            ),
        )
    db.execute("UPDATE model_runs SET status='complete' WHERE id=?", (run_id,))
    db.commit()
    result["job_id"] = run_id
    return result
