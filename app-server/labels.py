"""Label names stored on a task.

cvat-core `Label` objects are `{name, attributes}` records. This module keeps
the name list the create-task form sends and returns the serialized shape
`Task.labels` exposes.
"""
from __future__ import annotations

import json


def parse_labels(value) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        raw = value
    else:
        text = str(value).strip()
        if not text:
            return []
        if text.startswith("["):
            raw = json.loads(text)
        else:
            raw = [part.strip() for part in text.split(",")]
    names: list[str] = []
    for item in raw:
        name = item.get("name") if isinstance(item, dict) else item
        name = str(name or "").strip()
        if name and name not in names:
            names.append(name)
    return names


def serialize(names: list[str]) -> list[dict]:
    return [{"id": index, "name": name, "attributes": []} for index, name in enumerate(names)]
