"""Review items attached to annotations on a task."""
from __future__ import annotations

import json


def list_items(db, task_id: str) -> list[dict]:
    rows = db.execute(
        "SELECT * FROM review_items WHERE project_id=? ORDER BY score DESC",
        (task_id,),
    ).fetchall()
    return [
        {
            "id": row["id"],
            "frame": row["frame"],
            "score": row["score"],
            "reasons": json.loads(row["reasons"]),
            "status": row["status"],
            "annotationId": row["annotation_id"],
        }
        for row in rows
    ]


def set_status(db, item_id: str, status: str) -> dict | None:
    db.execute("UPDATE review_items SET status=? WHERE id=?", (status, item_id))
    db.commit()
    row = db.execute("SELECT * FROM review_items WHERE id=?", (item_id,)).fetchone()
    if row is None:
        return None
    return {
        "id": row["id"],
        "frame": row["frame"],
        "score": row["score"],
        "reasons": json.loads(row["reasons"]),
        "status": row["status"],
        "annotationId": row["annotation_id"],
    }
