"""Multipart form reader for task data uploads."""
from __future__ import annotations

from email import policy
from email.parser import BytesParser
from pathlib import Path


def parse_multipart(handler) -> tuple[dict[str, str], list[tuple[str, bytes]]]:
    content_type = handler.headers.get("Content-Type", "")
    if not content_type.startswith("multipart/form-data"):
        raise ValueError("Expected multipart form data")
    raw = handler.rfile.read(int(handler.headers.get("Content-Length", "0")))
    message = BytesParser(policy=policy.default).parsebytes(
        f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode() + raw
    )
    fields: dict[str, str] = {}
    files: list[tuple[str, bytes]] = []
    for part in message.walk():
        if part.get_content_maintype() == "multipart":
            continue
        filename = part.get_filename()
        name = part.get_param("name", header="content-disposition")
        payload = part.get_payload(decode=True) or b""
        if filename:
            files.append((Path(filename).name, payload))
        elif name:
            fields[name] = payload.decode("utf-8", "replace")
    return fields, files


def video_file(files: list[tuple[str, bytes]]) -> tuple[str, bytes]:
    for name, payload in files:
        if Path(name).suffix.lower() in {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"}:
            return name, payload
    raise ValueError("Upload an MP4, MOV, AVI, MKV, WEBM, or M4V video")
