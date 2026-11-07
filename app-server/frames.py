"""Frame extraction for a video task.

cvat-core `FrameData` reads one image per frame index. Octate produces those
images with FFmpeg and serves `frame-000000.jpg` onward.
"""
from __future__ import annotations

import subprocess
from pathlib import Path

VIDEO_SUFFIXES = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"}


def parse_fps(value: str) -> float:
    try:
        numerator, denominator = value.split("/")
        denominator_value = float(denominator)
        return round(float(numerator) / denominator_value, 3) if denominator_value else 0
    except (AttributeError, ValueError, ZeroDivisionError):
        return 0


def jpeg_quality(image_quality: int) -> int:
    """Map a 1–100 quality slider to FFmpeg's 2–31 JPEG scale (lower is better)."""
    quality = min(100, max(1, int(image_quality)))
    return max(2, min(31, int(round((100 - quality) / 100 * 29 + 2))))


def extract_video(video: Path, frames_dir: Path, image_quality: int = 70) -> tuple[int, float]:
    frames_dir.mkdir(parents=True, exist_ok=True)
    try:
        probe = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=avg_frame_rate",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(video),
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=30,
        )
        fps = parse_fps(probe.stdout.strip())
        subprocess.run(
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                str(video),
                "-q:v",
                str(jpeg_quality(image_quality)),
                "-start_number",
                "0",
                str(frames_dir / "frame-%06d.jpg"),
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=600,
        )
    except (FileNotFoundError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        raise RuntimeError("FFmpeg could not process the uploaded video") from exc
    count = len(list(frames_dir.glob("frame-*.jpg")))
    if not count:
        raise RuntimeError("FFmpeg extracted no video frames")
    return count, fps or 24


def frame_path(frame_dir: str | None, frame: int) -> Path | None:
    if not frame_dir:
        return None
    path = Path(frame_dir) / f"frame-{frame:06d}.jpg"
    return path if path.is_file() else None
