"""Annotation records for a task.

Shapes are stored as Octate objects and mirrored into the cvat-canvas
object-state rows by `canvas_backend.mirror_annotations`.
"""
from __future__ import annotations

import json

import canvas_backend


def list_annotations(db, task_id: str) -> list:
    return [json.loads(row[0]) for row in db.execute("SELECT payload FROM annotations WHERE project_id=?", (task_id,))]


def save_annotations(db, task_id: str, items: list) -> int:
    db.execute("DELETE FROM annotations WHERE project_id=?", (task_id,))
    db.executemany(
        "INSERT INTO annotations VALUES (?,?,?)",
        [(item["id"], task_id, json.dumps(item)) for item in items],
    )
    canvas_backend.mirror_annotations(db, task_id, items)
    db.commit()
    return len(items)
