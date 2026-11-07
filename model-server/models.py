"""Local backends registered with CVAT.

Detection, click segmentation, and tracking run inside this service with
OpenCV. They stay on the machine and do not download weights.
"""

BACKENDS = {
    "detect": "OpenCV instrument detector",
    "segment": "OpenCV magic wand",
    "track": "OpenCV template tracker",
}
