import unittest
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import liveness


def observations(blink=True, frame_count=liveness.FRAME_COUNT):
    rows = [
        {
            "live_score": 0.92,
            "eye_ratio": 0.25,
            "head_turn": 0.0,
            "embedding": np.array([1.0, 0.0], dtype=np.float32),
        }
        for _ in range(frame_count)
    ]
    if blink:
        for offset, ratio in enumerate((0.24, 0.13, 0.12, 0.15, 0.20, 0.24, 0.25, 0.25)):
            rows[offset + 2]["eye_ratio"] = ratio
    return rows


class LivenessSequenceTests(unittest.TestCase):
    def test_face_landmarks_are_accepted_without_optional_pose_output(self):
        landmarks = np.ones((68, 3), dtype=np.float32)
        face = SimpleNamespace(det_score=0.9, get=lambda _name: landmarks)
        self.assertIs(liveness._validate_face_observation(face), landmarks)

    def test_face_quality_failures_are_reported_separately(self):
        landmarks = np.ones((68, 3), dtype=np.float32)
        with self.assertRaisesRegex(liveness.LivenessError, "Move closer"):
            liveness._validate_face_observation(
                SimpleNamespace(det_score=0.5, get=lambda _name: landmarks)
            )
        with self.assertRaisesRegex(liveness.LivenessError, "landmarks could not be read"):
            liveness._validate_face_observation(
                SimpleNamespace(det_score=0.9, get=lambda _name: None)
            )

    def test_single_blink_challenge_passes_with_open_closed_open_frames(self):
        liveness.validate_observations(observations(), ["blink"])

    def test_legacy_24_frame_challenge_remains_supported(self):
        liveness.validate_observations(
            observations(frame_count=24),
            ["blink"],
        )

    def test_blink_on_first_prompt_frame_is_detected(self):
        rows = observations(blink=False)
        rows[2]["eye_ratio"] = 0.12
        rows[3]["eye_ratio"] = 0.25
        liveness.validate_observations(rows, ["blink"])

    def test_blink_threshold_scales_with_open_eye_baseline(self):
        rows = observations(blink=False)
        for item in rows:
            item["eye_ratio"] = 0.18
        rows[7]["eye_ratio"] = 0.12
        liveness.validate_observations(rows, ["blink"])

    def test_static_open_eyes_do_not_satisfy_blink(self):
        with self.assertRaisesRegex(liveness.LivenessError, "Blink"):
            liveness.validate_observations(observations(blink=False), ["blink"])

    def test_closed_eyes_without_reopening_do_not_satisfy_blink(self):
        rows = observations(blink=False)
        for index in range(2, liveness.FRAME_COUNT - 2):
            rows[index]["eye_ratio"] = 0.12
        with self.assertRaisesRegex(liveness.LivenessError, "Blink"):
            liveness.validate_observations(rows, ["blink"])

    def test_low_pad_score_and_incomplete_sequence_are_rejected(self):
        rows = observations()
        rows[7]["live_score"] = 0.2
        with self.assertRaises(liveness.LivenessError):
            liveness.validate_observations(rows, ["blink"])
        with self.assertRaisesRegex(liveness.LivenessError, "complete camera challenge"):
            liveness.validate_observations(rows[:-1], ["blink"])

    def test_left_turn_challenge_passes_with_directional_landmark_movement(self):
        rows = observations(blink=False)
        for index in range(5, 10):
            rows[index]["head_turn"] = 0.12
        liveness.validate_observations(rows, ["turn_left"])

    def test_right_turn_challenge_passes_with_directional_landmark_movement(self):
        rows = observations(blink=False)
        for index in range(5, 10):
            rows[index]["head_turn"] = -0.12
        liveness.validate_observations(rows, ["turn_right"])

    def test_turn_in_wrong_direction_does_not_pass(self):
        rows = observations(blink=False)
        for index in range(5, 10):
            rows[index]["head_turn"] = -0.12
        with self.assertRaisesRegex(liveness.LivenessError, "Head turn not detected"):
            liveness.validate_observations(rows, ["turn_left"])

    def test_head_turn_is_not_accepted_as_a_multi_action_challenge(self):
        with self.assertRaisesRegex(liveness.LivenessError, "challenge is invalid"):
            liveness.validate_observations(observations(), ["blink", "turn_left"])

    def test_head_turn_measure_is_normalized_to_eye_width(self):
        points = np.zeros((68, 3), dtype=np.float32)
        points[36, :2] = [10, 10]
        points[45, :2] = [30, 10]
        points[30, :2] = [22, 20]
        self.assertAlmostEqual(liveness._head_turn_measure(points), 0.1)

    def test_no_face_and_multiple_faces_fail_closed(self):
        fake_frames = ["A" * 100] * liveness.FRAME_COUNT
        image = np.zeros((8, 8, 3), dtype=np.uint8)
        no_face_boxes = np.empty((0, 5), dtype=np.float32)
        multi_face_boxes = np.zeros((2, 5), dtype=np.float32)
        multi_face_points = np.zeros((2, 5, 2), dtype=np.float32)
        with patch.object(liveness, "_get_model", return_value=object()), \
             patch.object(liveness, "decode_image", return_value=image), \
             patch.object(liveness, "get_engine") as engine_factory:
            engine_factory.return_value.det_model.detect.return_value = (no_face_boxes, None)
            with self.assertRaisesRegex(liveness.LivenessError, "No face"):
                liveness.verify_liveness(fake_frames, ["blink"])

            engine_factory.return_value.det_model.detect.return_value = (
                multi_face_boxes,
                multi_face_points,
            )
            with self.assertRaisesRegex(liveness.LivenessError, "Only one person"):
                liveness.verify_liveness(fake_frames, ["blink"])

    def test_invalid_and_oversized_frame_sets_are_rejected(self):
        with self.assertRaisesRegex(liveness.LivenessError, "complete camera challenge"):
            liveness.verify_liveness(["A" * 100], ["blink"])
        oversized = ["A" * (liveness.MAX_FRAME_CHARS + 1)] * liveness.FRAME_COUNT
        with self.assertRaisesRegex(liveness.LivenessError, "invalid or too large"):
            liveness.verify_liveness(oversized, ["blink"])


if __name__ == "__main__":
    unittest.main()
