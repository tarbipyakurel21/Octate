"""Jobs derived from a task.

cvat-core `Job` is a frame range inside a task. `segment_size` splits the
extracted frames the same way CVAT's segment size does. An empty or omitted
segment size is one job covering the whole video.
"""
from __future__ import annotations


def for_task(task: dict) -> list[dict]:
    size = int(task.get("size") or task.get("frames") or 0)
    segment = int(task.get("segment_size") or 0)
    if size <= 0:
        return []
    if segment <= 0:
        segment = size
    jobs = []
    start = 0
    index = 0
    while start < size:
        stop = min(size, start + segment) - 1
        jobs.append(
            {
                "id": f"{task['id']}:{index}",
                "task_id": task["id"],
                "status": task["status"],
                "start_frame": start,
                "stop_frame": stop,
                "type": "annotation",
            }
        )
        start = stop + 1
        index += 1
    return jobs
