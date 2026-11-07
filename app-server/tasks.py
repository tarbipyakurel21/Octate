"""Video tasks.

A task is the record cvat-core `Task` constructs from `GET /api/tasks`:
name, labels, size, status, owner, and one or more jobs. The bytes behind
`size` are the frames in `frames.py`.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

import jobs as jobs_module
import labels as labels_module
from frames import extract_video

VIDEO_READY = "ready"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _meta(db, project_id: str):
    return db.execute("SELECT * FROM task_meta WHERE project_id=?", (project_id,)).fetchone()


def serialize(db, row) -> dict:
    meta = _meta(db, row["id"])
    names = labels_module.parse_labels(meta["labels"]) if meta else []
    pending = db.execute(
        "SELECT count(*) FROM review_items WHERE project_id=? AND status='pending'",
        (row["id"],),
    ).fetchone()[0]
    status = "annotation" if row["status"] == VIDEO_READY else "processing"
    segment_size = int(meta["segment_size"]) if meta and meta["segment_size"] else 0
    task = {
        "id": row["id"],
        "name": row["name"],
        "project_id": None,
        "status": status,
        "size": row["frames"],
        "mode": (meta["mode"] if meta else None) or "interpolation",
        "dimension": "2d",
        "media_type": "video",
        "labels": labels_module.serialize(names),
        "owner": {"username": (meta["owner"] if meta else None) or "annotator"},
        "assignee": None,
        "created_date": row["updated_at"],
        "updated_date": row["updated_at"],
        "image_quality": int(meta["image_quality"]) if meta and meta["image_quality"] else 70,
        "segment_size": segment_size,
        "overlap": 0,
        "video_name": row["video_name"],
        "fps": row["fps"],
        "uncertain": pending,
        "frames": row["frames"],
        "videoName": row["video_name"],
        "updatedAt": row["updated_at"],
    }
    task_jobs = jobs_module.for_task(task)
    task["jobs"] = task_jobs
    task["progress"] = {
        "completed_jobs": 0,
        "total_jobs": len(task_jobs),
        "validation_jobs": 0,
        "annotation_jobs": len(task_jobs),
    }
    return task


def list_tasks(db) -> list[dict]:
    rows = db.execute("SELECT * FROM projects ORDER BY updated_at DESC").fetchall()
    return [serialize(db, row) for row in rows]


def get_task(db, task_id: str) -> dict | None:
    row = db.execute("SELECT * FROM projects WHERE id=?", (task_id,)).fetchone()
    return serialize(db, row) if row else None


def list_jobs(db) -> list[dict]:
    found = []
    for task in list_tasks(db):
        found.extend(task["jobs"])
    return found


def _insert(db, task_id: str, name: str, video_name: str, status: str, frames: int, fps: float, frame_dir: str | None, label_names: list[str], owner: str, image_quality: int, segment_size: int) -> None:
    now = _now()
    db.execute(
        "INSERT INTO projects VALUES (?,?,?,?,?,?,?,?)",
        (task_id, name, video_name, status, frames, fps, now, frame_dir),
    )
    db.execute(
        "INSERT OR REPLACE INTO task_meta VALUES (?,?,?,?,?,?)",
        (task_id, json.dumps(label_names), owner or "annotator", image_quality, segment_size, "interpolation"),
    )


def create_empty(db, data: dict) -> dict:
    task_id = str(uuid.uuid4())
    name = str(data.get("name") or "Untitled task").strip() or "Untitled task"
    _insert(
        db,
        task_id,
        name,
        "",
        "processing",
        0,
        0,
        None,
        labels_module.parse_labels(data.get("labels")),
        str(data.get("owner") or "annotator"),
        int(data.get("image_quality") or 70),
        int(data.get("segment_size") or 0),
    )
    db.commit()
    return get_task(db, task_id)


def create_from_upload(db, data_root: Path, fields: dict[str, str], files: list[tuple[str, bytes]]) -> dict:
    from uploads import video_file

    video_name, payload = video_file(files)
    task_id = str(uuid.uuid4())
    folder = data_root / "projects" / task_id
    folder.mkdir(parents=True, exist_ok=True)
    video_path = folder / video_name
    video_path.write_bytes(payload)
    image_quality = int(fields.get("image_quality") or 70)
    count, fps = extract_video(video_path, folder / "frames", image_quality)
    name = (fields.get("name") or Path(video_name).stem).strip() or Path(video_name).stem
    _insert(
        db,
        task_id,
        name,
        video_name,
        VIDEO_READY,
        count,
        fps,
        str(folder / "frames"),
        labels_module.parse_labels(fields.get("labels")),
        fields.get("owner") or "annotator",
        image_quality,
        int(fields.get("segment_size") or 0),
    )
    db.commit()
    return get_task(db, task_id)


def attach_data(db, data_root: Path, task_id: str, fields: dict[str, str], files: list[tuple[str, bytes]]) -> dict:
    from uploads import video_file

    row = db.execute("SELECT * FROM projects WHERE id=?", (task_id,)).fetchone()
    if row is None:
        raise ValueError("Task not found")
    video_name, payload = video_file(files)
    folder = data_root / "projects" / task_id
    folder.mkdir(parents=True, exist_ok=True)
    video_path = folder / video_name
    video_path.write_bytes(payload)
    meta = _meta(db, task_id)
    image_quality = int(fields.get("image_quality") or (meta["image_quality"] if meta else 70))
    count, fps = extract_video(video_path, folder / "frames", image_quality)
    db.execute(
        "UPDATE projects SET video_name=?, status=?, frames=?, fps=?, updated_at=?, frame_dir=? WHERE id=?",
        (video_name, VIDEO_READY, count, fps, _now(), str(folder / "frames"), task_id),
    )
    db.commit()
    return get_task(db, task_id)
