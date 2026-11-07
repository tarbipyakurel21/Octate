"""SQLite connection for the task store.

The tables follow the records cvat-core sends to `/api/tasks`, `/api/jobs`,
and `/api/labels`: one video task, its labels, and the frames FFmpeg extracted.
`projects` stays the storage row so existing frame and canvas routes keep the
same id as the task.
"""
from __future__ import annotations

import os
import sqlite3
from pathlib import Path

import canvas_backend

ROOT = Path(__file__).resolve().parents[1]


def locations() -> tuple[Path, Path]:
    data = Path(os.getenv("OCTATE_DATA", ROOT / "data" / "runtime"))
    database = Path(os.getenv("OCTATE_DB", data / "octate.db"))
    data.mkdir(parents=True, exist_ok=True)
    return data, database


def connect() -> sqlite3.Connection:
    _, database = locations()
    db = sqlite3.connect(database)
    db.row_factory = sqlite3.Row
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS projects(
            id TEXT PRIMARY KEY,
            name TEXT,
            video_name TEXT,
            status TEXT,
            frames INTEGER,
            fps REAL,
            updated_at TEXT,
            frame_dir TEXT
        );
        CREATE TABLE IF NOT EXISTS task_meta(
            project_id TEXT PRIMARY KEY,
            labels TEXT,
            owner TEXT,
            image_quality INTEGER,
            segment_size INTEGER,
            mode TEXT
        );
        CREATE TABLE IF NOT EXISTS annotations(
            id TEXT PRIMARY KEY,
            project_id TEXT,
            payload TEXT
        );
        CREATE TABLE IF NOT EXISTS review_items(
            id TEXT PRIMARY KEY,
            project_id TEXT,
            frame INTEGER,
            score REAL,
            reasons TEXT,
            status TEXT,
            annotation_id TEXT
        );
        CREATE TABLE IF NOT EXISTS model_runs(
            id TEXT PRIMARY KEY,
            project_id TEXT,
            kind TEXT,
            status TEXT,
            created_at TEXT
        );
        """
    )
    try:
        db.execute("ALTER TABLE projects ADD COLUMN frame_dir TEXT")
    except sqlite3.OperationalError:
        pass
    canvas_backend.ensure(db)
    return db
