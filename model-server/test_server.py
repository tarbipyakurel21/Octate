import base64
import json
import os
import threading
import unittest
import urllib.request
from http.server import ThreadingHTTPServer

import numpy as np

from server import FUNCTIONS, Handler, invoke, nuclio_catalog


def _jpeg(image) -> str:
    import cv2

    ok, encoded = cv2.imencode(".jpg", image)
    if not ok:
        raise RuntimeError("could not encode the test image")
    return base64.b64encode(encoded.tobytes()).decode("ascii")


class GatewayTests(unittest.TestCase):
    def test_all_three_cvat_function_kinds_are_published(self):
        self.assertEqual({spec["kind"] for spec in FUNCTIONS.values()}, {"detector", "interactor", "tracker"})

    def test_detector_scales_points_to_frame_size(self):
        output = invoke("octate-instrument-detector", {"width": 200, "height": 100})
        self.assertEqual(output["shapes"][0]["points"], [62.0, 26.0, 116.0, 61.0])

    def test_tracker_moves_each_coordinate(self):
        output = invoke("octate-instrument-tracker", {"shapes": [{"type": "rectangle", "points": [1, 2, 3, 4]}]})
        self.assertEqual(output["shapes"][0]["points"], [3.0, 4.0, 5.0, 6.0])

    def test_nuclio_catalog_matches_cvat_lambda_metadata(self):
        catalog = nuclio_catalog()
        detector = catalog["octate-instrument-detector"]
        self.assertEqual(detector["metadata"]["name"], "octate-instrument-detector")
        self.assertEqual(detector["metadata"]["annotations"]["type"], "detector")
        self.assertTrue(detector["spec"]["description"])
        labels = json.loads(detector["metadata"]["annotations"]["spec"])
        self.assertIn("Grasper", {label["name"] for label in labels})
        self.assertIn("Hook cautery", {label["name"] for label in labels})
        segmenter = catalog["octate-tissue-segmenter"]["metadata"]["annotations"]
        self.assertEqual(segmenter["min_pos_points"], "1")
        self.assertEqual(segmenter["min_neg_points"], "0")
        tracker = catalog["octate-instrument-tracker"]["metadata"]["annotations"]
        self.assertEqual(tracker["supported_shape_types"], "rectangle,polygon")

    def test_demo_mode_ignores_a_frame(self):
        previous = os.environ.get("OCTATE_MODEL_MODE")
        os.environ["OCTATE_MODEL_MODE"] = "demo"
        try:
            output = invoke("octate-instrument-detector", {"image": "abc", "width": 200, "height": 100})
        finally:
            if previous is None:
                os.environ.pop("OCTATE_MODEL_MODE", None)
            else:
                os.environ["OCTATE_MODEL_MODE"] = previous
        self.assertEqual(output["mode"], "demo")
        self.assertEqual(output["shapes"][0]["points"], [62.0, 26.0, 116.0, 61.0])


class LocalModelTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            import cv2
        except ImportError:
            raise unittest.SkipTest("OpenCV is not installed")
        cls.cv2 = cv2
        previous = os.environ.get("OCTATE_MODEL_MODE")
        os.environ["OCTATE_MODEL_MODE"] = "opencv"
        cls._previous_mode = previous

    @classmethod
    def tearDownClass(cls):
        if cls._previous_mode is None:
            os.environ.pop("OCTATE_MODEL_MODE", None)
        else:
            os.environ["OCTATE_MODEL_MODE"] = cls._previous_mode

    def test_detector_finds_a_dark_instrument_on_tissue(self):
        image = np.full((200, 320, 3), (80, 80, 180), np.uint8)
        self.cv2.rectangle(image, (0, 80), (260, 108), (40, 40, 40), -1)
        found = invoke("octate-instrument-detector", {"image": _jpeg(image), "threshold": 0.5})
        self.assertGreaterEqual(len(found), 1)
        box = found[0]
        self.assertEqual(box["type"], "rectangle")
        self.assertEqual(box["label"], "Hook cautery")
        x1, y1, x2, y2 = box["points"]
        self.assertLess(x1, 30)
        self.assertGreater(x2, 200)
        self.assertLess(y1, 90)
        self.assertGreater(y2, 100)

    def test_segmenter_follows_a_click_on_a_region(self):
        image = np.zeros((160, 160, 3), np.uint8)
        self.cv2.circle(image, (80, 80), 36, (210, 180, 170), -1)
        output = invoke(
            "octate-tissue-segmenter",
            {"image": _jpeg(image), "pos_points": [[80, 80]], "neg_points": []},
        )
        points = output["shapes"][0]["points"]
        self.assertEqual(output["shapes"][0]["type"], "polygon")
        self.assertGreaterEqual(len(points), 6)
        xs = points[0::2]
        ys = points[1::2]
        self.assertLess(min(xs), 60)
        self.assertGreater(max(xs), 100)
        self.assertLess(min(ys), 60)
        self.assertGreater(max(ys), 100)

    def test_tracker_follows_a_rectangle_to_the_next_frame(self):
        first = np.zeros((120, 200, 3), np.uint8)
        self.cv2.rectangle(first, (20, 30), (70, 80), (240, 240, 240), -1)
        started = invoke(
            "octate-instrument-tracker",
            {"image": _jpeg(first), "shapes": [{"type": "rectangle", "points": [20, 30, 70, 80]}], "states": []},
        )
        second = np.zeros((120, 200, 3), np.uint8)
        self.cv2.rectangle(second, (48, 36), (98, 86), (240, 240, 240), -1)
        followed = invoke(
            "octate-instrument-tracker",
            {"image": _jpeg(second), "shapes": [None], "states": started["states"]},
        )
        self.assertGreater(followed["shapes"][0]["points"][0], 35)

    def test_cvat_invocation_endpoint_lists_and_runs_the_detector(self):
        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        port = server.server_address[1]
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/functions") as response:
                catalog = json.load(response)
            self.assertEqual(catalog["octate-instrument-detector"]["status"]["state"], "ready")
            image = np.full((200, 320, 3), (80, 80, 180), np.uint8)
            self.cv2.rectangle(image, (0, 80), (260, 108), (40, 40, 40), -1)
            body = json.dumps({"image": _jpeg(image), "threshold": 0.5}).encode()
            request = urllib.request.Request(
                f"http://127.0.0.1:{port}/api/function_invocations",
                data=body,
                headers={"Content-Type": "application/json", "x-nuclio-function-name": "octate-instrument-detector"},
            )
            with urllib.request.urlopen(request) as response:
                found = json.load(response)
            self.assertEqual(found[0]["label"], "Hook cautery")
        finally:
            server.shutdown()
            server.server_close()


class LearnedModelTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            import cv2
            import ultralytics
        except ImportError:
            raise unittest.SkipTest("Ultralytics or OpenCV is not installed")
        cls.cv2 = cv2
        previous = os.environ.get("OCTATE_MODEL_MODE")
        os.environ["OCTATE_MODEL_MODE"] = "local"
        cls._previous_mode = previous

    @classmethod
    def tearDownClass(cls):
        if cls._previous_mode is None:
            os.environ.pop("OCTATE_MODEL_MODE", None)
        else:
            os.environ["OCTATE_MODEL_MODE"] = cls._previous_mode

    def test_learned_detector_returns_valid_shapes(self):
        image = np.full((240, 320, 3), (90, 90, 190), np.uint8)
        self.cv2.rectangle(image, (30, 80), (220, 110), (30, 30, 30), -1)
        found = invoke("octate-instrument-detector", {"image": _jpeg(image), "threshold": 0.5})
        self.assertIsInstance(found, list)
        self.assertGreaterEqual(len(found), 1)
        box = found[0]
        self.assertEqual(box["type"], "rectangle")
        self.assertIn("points", box)
        self.assertEqual(len(box["points"]), 4)

    def test_learned_sam_segmenter_returns_polygon(self):
        image = np.zeros((200, 200, 3), np.uint8)
        self.cv2.circle(image, (100, 100), 40, (220, 220, 220), -1)
        output = invoke(
            "octate-tissue-segmenter",
            {"image": _jpeg(image), "pos_points": [[100, 100]], "obj_bbox": [60, 60, 140, 140]},
        )
        self.assertIn("shapes", output)
        self.assertGreaterEqual(len(output["shapes"]), 1)
        shape = output["shapes"][0]
        self.assertEqual(shape["type"], "polygon")
        self.assertGreaterEqual(len(shape["points"]), 6)


if __name__ == "__main__":
    unittest.main()
