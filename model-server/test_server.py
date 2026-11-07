import unittest

from server import FUNCTIONS, invoke


class GatewayTests(unittest.TestCase):
    def test_all_three_cvat_function_kinds_are_published(self):
        self.assertEqual({spec["kind"] for spec in FUNCTIONS.values()}, {"detector", "interactor", "tracker"})

    def test_detector_scales_points_to_frame_size(self):
        output = invoke("octate-instrument-detector", {"width": 200, "height": 100})
        self.assertEqual(output["shapes"][0]["points"], [62.0, 26.0, 116.0, 61.0])

    def test_tracker_moves_each_coordinate(self):
        output = invoke("octate-instrument-tracker", {"shapes": [{"type": "rectangle", "points": [1, 2, 3, 4]}]})
        self.assertEqual(output["shapes"][0]["points"], [3.0, 4.0, 5.0, 6.0])


if __name__ == "__main__":
    unittest.main()
