"""Task, label, and job records. No video and no FFmpeg."""
import json
import sqlite3
import tempfile
from pathlib import Path

import jobs
import labels
import tasks


def test_labels_and_jobs():
    assert labels.parse_labels("Raw, Constructor") == ["Raw", "Constructor"]
    assert labels.parse_labels([{"name": "Raw"}, "Constructor"]) == ["Raw", "Constructor"]
    task = {"id": "t1", "status": "annotation", "size": 10, "segment_size": 4}
    ranges = [(job["start_frame"], job["stop_frame"]) for job in jobs.for_task(task)]
    assert ranges == [(0, 3), (4, 7), (8, 9)]


def test_task_row_round_trip():
    with tempfile.TemporaryDirectory() as tmp:
        database = Path(tmp) / "octate.db"
        db = sqlite3.connect(database)
        db.row_factory = sqlite3.Row
        db.executescript(
            """
            CREATE TABLE projects(
                id TEXT PRIMARY KEY, name TEXT, video_name TEXT, status TEXT,
                frames INTEGER, fps REAL, updated_at TEXT, frame_dir TEXT
            );
            CREATE TABLE task_meta(
                project_id TEXT PRIMARY KEY, labels TEXT, owner TEXT,
                image_quality INTEGER, segment_size INTEGER, mode TEXT
            );
            CREATE TABLE review_items(
                id TEXT PRIMARY KEY, project_id TEXT, frame INTEGER, score REAL,
                reasons TEXT, status TEXT, annotation_id TEXT
            );
            """
        )
        tasks._insert(db, "task-1", "dz", "clip.mov", "ready", 12, 24, None, ["Raw"], "annotator", 70, 0)
        db.commit()
        task = tasks.get_task(db, "task-1")
        assert task["name"] == "dz"
        assert task["status"] == "annotation"
        assert task["size"] == 12
        assert task["labels"][0]["name"] == "Raw"
        assert task["jobs"][0]["stop_frame"] == 11
        assert json.loads(db.execute("SELECT labels FROM task_meta").fetchone()[0]) == ["Raw"]
        db.close()


if __name__ == "__main__":
    test_labels_and_jobs()
    test_task_row_round_trip()
    print("task modules ok")
