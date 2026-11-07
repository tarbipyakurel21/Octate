"""HTTP entrypoint. Routes call the task, job, frame, annotation, and canvas modules."""
from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import annotations as annotations_module
import canvas_backend
import inference as inference_module
import review as review_module
import tasks as tasks_module
import uploads as uploads_module
from frames import frame_path
from schema import connect, locations

DATA, _ = locations()


class Handler(BaseHTTPRequestHandler):
    def body(self):
        length = int(self.headers.get("Content-Length", "0"))
        return json.loads(self.rfile.read(length) or b"{}")

    def send_json(self, data, status=200):
        raw = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(raw)

    def send_file(self, path: Path, content_type: str):
        raw = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(raw)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH")
        self.end_headers()

    def do_GET(self):
        db = connect()
        parts = self.path.split("?", 1)[0].strip("/").split("/")
        try:
            found = canvas_backend.dispatch_get(db, DATA, parts)
            if found:
                if found[0] == "file":
                    self.send_file(found[1], found[2])
                else:
                    self.send_json(found[1], found[0])
                return
            if self.path.split("?", 1)[0] == "/api/health":
                self.send_json({"status": "ok", "database": "sqlite"})
                return
            if parts == ["api", "tasks"] or parts == ["api", "projects"]:
                self.send_json(tasks_module.list_tasks(db))
                return
            if parts == ["api", "jobs"]:
                self.send_json(tasks_module.list_jobs(db))
                return
            if len(parts) == 3 and parts[:2] == ["api", "tasks"]:
                task = tasks_module.get_task(db, parts[2])
                self.send_json(task if task else {"error": "not found"}, 200 if task else 404)
                return
            if len(parts) == 4 and parts[:2] == ["api", "tasks"] and parts[3] == "preview":
                self._send_frame(db, parts[2], 0)
                return
            if len(parts) == 5 and parts[:2] == ["api", "tasks"] and parts[3] == "frames":
                self._send_frame(db, parts[2], parts[4])
                return
            if len(parts) == 5 and parts[:2] == ["api", "projects"] and parts[3] == "frames":
                self._send_frame(db, parts[2], parts[4])
                return
            if len(parts) == 4 and parts[:2] == ["api", "projects"] and parts[3] == "annotations":
                self.send_json(annotations_module.list_annotations(db, parts[2]))
                return
            if len(parts) == 4 and parts[:2] == ["api", "projects"] and parts[3] == "review":
                self.send_json(review_module.list_items(db, parts[2]))
                return
            self.send_json({"error": "not found"}, 404)
        except canvas_backend.CanvasError as exc:
            self.send_json({"error": str(exc)}, exc.status)
        finally:
            db.close()

    def _send_frame(self, db, task_id: str, frame):
        try:
            index = int(frame)
        except (TypeError, ValueError):
            self.send_json({"error": "invalid frame"}, 400)
            return
        row = db.execute("SELECT frame_dir FROM projects WHERE id=?", (task_id,)).fetchone()
        path = frame_path(row["frame_dir"] if row else None, index)
        if path is None:
            self.send_json({"error": "frame not found"}, 404)
            return
        self.send_file(path, "image/jpeg")

    def do_POST(self):
        parts = self.path.strip("/").split("/")
        db = connect()
        try:
            if self.path == "/api/tasks/upload" or self.path == "/api/projects/upload":
                fields, files = uploads_module.parse_multipart(self)
                task = tasks_module.create_from_upload(db, DATA, fields, files)
                self.send_json(task, 201)
                return
            if len(parts) == 4 and parts[:2] == ["api", "tasks"] and parts[3] == "data":
                fields, files = uploads_module.parse_multipart(self)
                task = tasks_module.attach_data(db, DATA, parts[2], fields, files)
                self.send_json(task, 201)
                return
            data = self.body()
            if self.path in ("/api/tasks", "/api/projects"):
                self.send_json(tasks_module.create_empty(db, data), 201)
                return
            if len(parts) == 3 and parts[:2] == ["api", "inference"]:
                self.send_json(inference_module.run(db, parts[2], data))
                return
            self.send_json({"error": "not found"}, 404)
        except (ValueError, RuntimeError, json.JSONDecodeError) as exc:
            self.send_json({"error": str(exc)}, 400)
        finally:
            db.close()

    def do_PUT(self):
        parts = self.path.strip("/").split("/")
        db = connect()
        try:
            if len(parts) >= 6 and parts[:2] == ["api", "canvas"] and parts[2] in ("2d", "3d") and parts[4] == "frames":
                if parts[-1] == "cloud":
                    result = canvas_backend.put_cloud(
                        db,
                        DATA,
                        parts,
                        self.rfile.read(int(self.headers.get("Content-Length", "0"))),
                    )
                else:
                    result = canvas_backend.put_scene(db, DATA, parts, self.body())
                if result is None:
                    self.send_json({"error": "not found"}, 404)
                else:
                    self.send_json(result[1], result[0])
                return
            data = self.body()
            if len(parts) == 4 and parts[:2] == ["api", "projects"] and parts[3] == "annotations":
                saved = annotations_module.save_annotations(db, parts[2], data)
                self.send_json({"saved": saved})
                return
            self.send_json({"error": "not found"}, 404)
        except canvas_backend.CanvasError as exc:
            self.send_json({"error": str(exc)}, exc.status)
        except json.JSONDecodeError:
            self.send_json({"error": "invalid JSON"}, 400)
        finally:
            db.close()

    def do_PATCH(self):
        parts = self.path.strip("/").split("/")
        db = connect()
        try:
            if len(parts) == 3 and parts[:2] == ["api", "review"]:
                item = review_module.set_status(db, parts[2], self.body().get("status"))
                self.send_json(item if item else {"error": "not found"}, 200 if item else 404)
                return
            self.send_json({"error": "not found"}, 404)
        finally:
            db.close()


if __name__ == "__main__":
    import os

    ThreadingHTTPServer(("0.0.0.0", int(os.getenv("PORT", "8080"))), Handler).serve_forever()
