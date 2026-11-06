"""Video challenge verification using the existing face engine and a PAD model."""
import hashlib
import logging
import os
import threading
from pathlib import Path

import cv2
import numpy as np
import onnxruntime

from face_module import FaceError, decode_image, get_engine

log = logging.getLogger("blockbiovote-ai.liveness")

FRAME_COUNT = 16  # Full registration challenge.
FAST_AUTH_FRAME_COUNT = 12  # Shorter prototype login challenge.
SUPPORTED_FRAME_COUNTS = {FAST_AUTH_FRAME_COUNT, FRAME_COUNT, 24}
MAX_FRAME_CHARS = 512 * 1024
MAX_TOTAL_FRAME_CHARS = 8 * 1024 * 1024
MIN_LIVE_SCORE = 0.60
TARGET_LIVE_SCORE = 0.80
MIN_TARGET_SCORE_RATIO = 0.70
MIN_FACE_SIMILARITY = 0.50
MIN_HEAD_TURN_DELTA = 0.08
MAX_STRAIGHT_HEAD_OFFSET = 0.12
MODEL_SHA256 = "87a9ac1dbb16a61eec212957e5095e62a8769c1e188af9b0198f253302c4afdb"
DESTINATION_LANDMARKS = np.array(
    [[32.03, 38.06], [47.89, 37.98], [40.01, 47.08],
     [33.50, 56.36], [46.63, 56.29]],
    dtype=np.float32,
)

_session = None
_session_lock = threading.Lock()


class LivenessError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code
        self.message = message


def _model_path():
    configured = os.getenv("LIVENESS_MODEL_PATH")
    if configured:
        return Path(configured).expanduser()
    return Path.home() / ".insightface" / "addons" / "liveness.onnx"


def _get_model():
    global _session
    if _session is None:
        with _session_lock:
            if _session is None:
                path = _model_path()
                if not path.is_file():
                    raise RuntimeError(
                        "The liveness model is not installed. Run "
                        "`python python_ai/download_liveness_model.py`."
                    )
                digest = hashlib.sha256(path.read_bytes()).hexdigest()
                if digest != MODEL_SHA256:
                    raise RuntimeError("The installed liveness model failed its integrity check")
                session = onnxruntime.InferenceSession(
                    str(path), providers=["CPUExecutionProvider"]
                )
                inputs, outputs = session.get_inputs(), session.get_outputs()
                if (
                    len(inputs) != 1
                    or len(outputs) != 1
                    or inputs[0].type != "tensor(float)"
                    or list(inputs[0].shape)[1:] != [3, 80, 80]
                    or outputs[0].type != "tensor(float)"
                ):
                    raise RuntimeError("The installed liveness model has an unsupported format")
                _session = session
    return _session


def _score_live(session, image, landmarks):
    source = np.asarray(landmarks, dtype=np.float32)
    if source.shape != (5, 2) or not np.isfinite(source).all():
        raise RuntimeError("The face detector returned invalid alignment landmarks")

    source_center = source.mean(axis=0)
    target_center = DESTINATION_LANDMARKS.mean(axis=0)
    source_zero = source - source_center
    target_zero = DESTINATION_LANDMARKS - target_center
    covariance = source_zero.T @ target_zero
    left, singular_values, right = np.linalg.svd(covariance)
    correction = np.eye(2, dtype=np.float32)
    correction[1, 1] = np.linalg.det(left @ right)
    rotation = left @ correction @ right
    denominator = float(np.sum(source_zero * source_zero))
    if denominator <= 0:
        raise RuntimeError("Face alignment failed")
    scale = float(np.sum(singular_values * np.diag(correction)) / denominator)
    matrix = scale * rotation.T
    offset = target_center - matrix @ source_center
    transform = np.column_stack((matrix, offset)).astype(np.float32)
    if not np.isfinite(transform).all() or np.linalg.det(matrix) <= 0:
        raise RuntimeError("Face alignment failed")

    valid = cv2.warpAffine(
        np.ones(image.shape[:2], dtype=np.float32), transform, (80, 80),
        flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0,
    )
    if float(np.mean(valid)) < 0.70:
        raise LivenessError(
            "FACE_POSITION",
            "Move your face toward the center of the camera and try again.",
        )
    crop = cv2.warpAffine(
        image, transform, (80, 80),
        flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE,
    )
    tensor = np.ascontiguousarray(
        crop[:, :, ::-1].transpose(2, 0, 1)[None], dtype=np.float32
    ) / 255.0
    input_meta = session.get_inputs()[0]
    output = np.asarray(
        session.run([session.get_outputs()[0].name], {input_meta.name: tensor})[0]
    )
    if output.shape != (1,) or not np.isfinite(output).all():
        raise RuntimeError("The liveness model returned an invalid score")
    score = float(output[0])
    if not 0.0 <= score <= 1.0:
        raise RuntimeError("The liveness model returned an invalid probability")
    return score


def _eye_ratio(points, start):
    eye = np.asarray(points[start:start + 6, :2], dtype=np.float64)
    horizontal = np.linalg.norm(eye[0] - eye[3])
    if horizontal < 1:
        raise LivenessError(
            "LANDMARKS_UNAVAILABLE",
            "Eye landmarks could not be read. Improve the lighting and face the camera.",
        )
    return float(
        (np.linalg.norm(eye[1] - eye[5]) + np.linalg.norm(eye[2] - eye[4]))
        / (2 * horizontal)
    )


def _eye_aspect_ratio(points):
    return (_eye_ratio(points, 36) + _eye_ratio(points, 42)) / 2


def _head_turn_measure(points):
    landmarks = np.asarray(points, dtype=np.float64)
    eye_midpoint = (landmarks[36, :2] + landmarks[45, :2]) / 2
    eye_width = float(np.linalg.norm(landmarks[36, :2] - landmarks[45, :2]))
    if eye_width < 1:
        raise LivenessError(
            "LANDMARKS_UNAVAILABLE",
            "Face landmarks could not be read. Face the camera and try again.",
        )
    return float((landmarks[30, 0] - eye_midpoint[0]) / eye_width)


def _cosine(left, right):
    left = np.asarray(left, dtype=np.float32)
    right = np.asarray(right, dtype=np.float32)
    denom = float(np.linalg.norm(left) * np.linalg.norm(right))
    return float(np.dot(left, right) / denom) if denom else -1.0


def _validate_face_observation(face):
    landmarks = face.get("landmark_3d_68")
    if face.det_score < 0.60:
        raise LivenessError(
            "LOW_CONFIDENCE",
            "Your face was not clear enough. Move closer and improve the lighting.",
        )
    if (
        not isinstance(landmarks, np.ndarray)
        or landmarks.ndim != 2
        or landmarks.shape[0] < 68
        or landmarks.shape[1] < 2
        or not np.isfinite(landmarks[:, :2]).all()
    ):
        raise LivenessError(
            "LANDMARKS_UNAVAILABLE",
            "Your face landmarks could not be read. Face the camera and try again.",
        )
    return landmarks


def _validate_actions(actions):
    if (
        not isinstance(actions, list)
        or len(actions) != 1
        or actions[0] not in ("turn_left", "look_straight")
    ):
        raise LivenessError("INVALID_CHALLENGE", "The liveness challenge is invalid.")


def validate_observations(observations, actions):
    """Validate one randomized facial action, face consistency and PAD scores."""
    _validate_actions(actions)
    if len(observations) not in SUPPORTED_FRAME_COUNTS:
        raise LivenessError("INVALID_FRAMES", "Capture the complete camera challenge.")

    for item in observations:
        embedding = item["embedding"]
        if (
            not np.isfinite(
                [item["live_score"], item["eye_ratio"], item["head_turn"]]
            ).all()
            or not 0 <= item["live_score"] <= 1
            or item["eye_ratio"] < 0
            or (embedding is not None and not np.isfinite(embedding).all())
        ):
            raise LivenessError("INVALID_FRAMES", "The camera measurements are invalid.")

    scores = [item["live_score"] for item in observations]
    min_score = float(min(scores))
    mean_score = float(np.mean(scores))
    target_ratio = sum(score >= TARGET_LIVE_SCORE for score in scores) / len(scores)
    if (
        min_score < MIN_LIVE_SCORE
        or mean_score < TARGET_LIVE_SCORE
        or target_ratio < MIN_TARGET_SCORE_RATIO
    ):
        log.warning(
            "PAD threshold check failed: min=%.3f mean=%.3f target_ratio=%.3f",
            min_score, mean_score, target_ratio,
        )
        raise LivenessError(
            "PAD_SCORE_FAILED",
            (
                "The presentation-attack model did not reach its confidence thresholds "
                f"(minimum {min_score:.2f}, average {mean_score:.2f}, "
                f"frames at target {target_ratio:.0%}). Keep only one face centered "
                "in the camera, face forward and use even lighting, then retry."
            ),
        )

    embeddings = [item["embedding"] for item in observations if item["embedding"] is not None]
    reference = observations[0]["embedding"]
    if reference is None or not embeddings:
        raise LivenessError(
            "INCONSISTENT_FACE",
            "Keep the same face in view throughout the challenge.",
        )
    if any(
        _cosine(embedding, reference) < MIN_FACE_SIMILARITY
        for embedding in embeddings
    ):
        raise LivenessError(
            "INCONSISTENT_FACE",
            "Keep the same face in view throughout the challenge.",
        )

    prompted_frames = observations[2:-2]
    if actions[0] == "look_straight":
        straight_frames = [
            item for item in prompted_frames
            if abs(item["head_turn"]) <= MAX_STRAIGHT_HEAD_OFFSET
        ]
        required = int(np.ceil(len(prompted_frames) * MIN_TARGET_SCORE_RATIO))
        if len(straight_frames) < required:
            raise LivenessError(
                "LOOK_STRAIGHT_NOT_DETECTED",
                "Face the camera directly and keep your head centered until verification finishes.",
            )
        return

    baseline_turn = float(np.median([item["head_turn"] for item in observations[:2]]))
    turned_frames = [
        item["head_turn"] - baseline_turn
        for item in prompted_frames
        if item["head_turn"] - baseline_turn >= MIN_HEAD_TURN_DELTA
    ]
    if len(turned_frames) < 2:
        raise LivenessError(
            "TURN_LEFT_NOT_DETECTED",
            "Turn your head slightly to your left and hold it briefly.",
        )


def verify_liveness(frames, actions):
    _validate_actions(actions)
    if not isinstance(frames, list) or len(frames) not in SUPPORTED_FRAME_COUNTS:
        raise LivenessError("INVALID_FRAMES", "Capture the complete camera challenge.")
    if any(
        not isinstance(frame, str)
        or len(frame) < 100
        or len(frame) > MAX_FRAME_CHARS
        for frame in frames
    ) or sum(len(frame) for frame in frames) > MAX_TOTAL_FRAME_CHARS:
        raise LivenessError("INVALID_FRAMES", "The camera frames are invalid or too large.")

    engine = get_engine()
    anti_spoof = _get_model()
    from insightface.app.common import Face

    observations = []
    frame_count = len(frames)
    embedding_indices = {
        0,
        frame_count // 4,
        frame_count // 2,
        (frame_count * 3) // 4,
        frame_count - 1,
    }
    for index, encoded in enumerate(frames):
        try:
            image = decode_image(encoded)
        except FaceError as error:
            raise LivenessError(error.code, error.message) from error
        bboxes, keypoints = engine.det_model.detect(image, max_num=0)
        if len(bboxes) == 0:
            raise LivenessError("NO_FACE", "No face was detected. Face the camera and try again.")
        if len(bboxes) > 1:
            raise LivenessError(
                "MULTIPLE_FACES",
                "Only one person should be visible during the camera challenge.",
            )
        if keypoints is None:
            raise LivenessError(
                "LOW_CONFIDENCE",
                "Your face landmarks could not be read. Please try again.",
            )
        face = Face(
            bbox=bboxes[0, :4],
            kps=keypoints[0],
            det_score=bboxes[0, 4],
        )
        engine.models["landmark_3d_68"].get(image, face)
        landmarks = _validate_face_observation(face)
        score = _score_live(anti_spoof, image, face.kps)
        embedding = None
        if index in embedding_indices:
            engine.models["recognition"].get(image, face)
            embedding = face.normed_embedding
        observations.append({
            "live_score": score,
            "eye_ratio": _eye_aspect_ratio(landmarks),
            "head_turn": _head_turn_measure(landmarks),
            "embedding": embedding,
        })

    try:
        validate_observations(observations, actions)
    except LivenessError:
        raise
    except Exception as error:
        log.exception("Liveness sequence validation failed")
        raise RuntimeError("Liveness sequence validation failed") from error

    return {"success": True, "identity_frame_index": 0}
