"""
Face detection, quality checks and recognition (InsightFace / ArcFace embeddings).

Nothing here writes images to disk: frames are decoded in memory, turned into a
512-d embedding, and discarded.
"""
import base64
import os
import threading

import cv2
import numpy as np

from security import decrypt_embedding

MODEL_NAME = os.getenv("FACE_MODEL", "buffalo_l")
MATCH_THRESHOLD = float(os.getenv("FACE_MATCH_THRESHOLD", "0.45"))   # cosine similarity
CONSISTENCY_THRESHOLD = float(os.getenv("FACE_CONSISTENCY_THRESHOLD", "0.50"))

MIN_IMAGES = 3
MAX_IMAGES = 5
MAX_IMAGE_BYTES = 4 * 1024 * 1024
MIN_DET_SCORE = 0.60
MIN_FACE_WIDTH_RATIO = 0.15      # face box width / image width
MIN_BLUR_SCORE = float(os.getenv("FACE_MIN_BLUR", "15"))   # variance of Laplacian on 160px face crop (real faces ~30-80, blurred ~3)
BRIGHTNESS_RANGE = (50, 210)     # mean gray level of face crop
MAX_YAW_RATIO = 0.40             # |nose offset| / eye distance (0 = frontal)
OTHER_FACE_MIN_RATIO = 0.05      # smaller faces are ignored as background noise


class FaceError(Exception):
    """A user-correctable problem with an image. `code` is machine-readable."""
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code
        self.message = message


_app = None
_lock = threading.Lock()


def get_engine():
    global _app
    if _app is None:
        with _lock:
            if _app is None:
                from insightface.app import FaceAnalysis
                engine = FaceAnalysis(name=MODEL_NAME, providers=["CPUExecutionProvider"])
                engine.prepare(ctx_id=-1, det_size=(640, 640))
                _app = engine
    return _app


def decode_image(b64_string):
    if not isinstance(b64_string, str) or not b64_string:
        raise FaceError("INVALID_IMAGE", "No image data received")
    if b64_string.startswith("data:"):
        b64_string = b64_string.split(",", 1)[-1]
    try:
        raw = base64.b64decode(b64_string, validate=True)
    except Exception:
        raise FaceError("INVALID_IMAGE", "Image data is not valid base64")
    if len(raw) > MAX_IMAGE_BYTES:
        raise FaceError("INVALID_IMAGE", "Image is too large")
    img = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise FaceError("INVALID_IMAGE", "Could not read the image")
    return img


def analyze_image(b64_string):
    """
    Detect exactly one usable face and return its normalised 512-d embedding.
    Raises FaceError with a specific code for every rejection reason.
    """
    img = decode_image(b64_string)
    h, w = img.shape[:2]
    faces = get_engine().get(img)

    faces = [f for f in faces
             if f.det_score >= 0.5 and (f.bbox[2] - f.bbox[0]) >= OTHER_FACE_MIN_RATIO * w]
    if not faces:
        raise FaceError("NO_FACE", "No face detected. Face the camera in good lighting.")
    if len(faces) > 1:
        raise FaceError("MULTIPLE_FACES", "More than one face detected. Only the voter should be in frame.")

    f = faces[0]
    x1, y1, x2, y2 = [int(v) for v in f.bbox]
    x1, y1, x2, y2 = max(x1, 0), max(y1, 0), min(x2, w), min(y2, h)

    if f.det_score < MIN_DET_SCORE:
        raise FaceError("LOW_CONFIDENCE", "Face is not clear enough. Improve lighting and look at the camera.")
    if (x2 - x1) < MIN_FACE_WIDTH_RATIO * w:
        raise FaceError("FACE_TOO_SMALL", "Face is too far from the camera. Move closer.")

    crop = cv2.cvtColor(img[y1:y2, x1:x2], cv2.COLOR_BGR2GRAY)
    if crop.size == 0:
        raise FaceError("NO_FACE", "No face detected.")
    crop = cv2.resize(crop, (160, 160))
    brightness = float(crop.mean())          # checked first: a dark frame also has no contrast
    if brightness < BRIGHTNESS_RANGE[0]:
        raise FaceError("TOO_DARK", "Too dark. Move to a brighter place.")
    if brightness > BRIGHTNESS_RANGE[1]:
        raise FaceError("TOO_BRIGHT", "Too bright / overexposed. Avoid direct light behind or on the face.")
    if cv2.Laplacian(crop, cv2.CV_64F).var() < MIN_BLUR_SCORE:
        raise FaceError("TOO_BLURRY", "Image is blurry. Hold still and try again.")

    kps = f.kps  # left eye, right eye, nose, left mouth, right mouth
    eye_dist = float(np.linalg.norm(kps[1] - kps[0])) or 1.0
    yaw = abs(float(kps[2][0] - (kps[0][0] + kps[1][0]) / 2)) / eye_dist
    if yaw > MAX_YAW_RATIO:
        raise FaceError("NOT_FRONTAL", "Please look towards the camera.")

    emb = np.asarray(f.normed_embedding, dtype=np.float32)
    return emb / (np.linalg.norm(emb) or 1.0)


def _thumb(b64_string):
    img = decode_image(b64_string)
    return cv2.resize(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), (32, 32)).astype(np.float32)


def build_template(b64_images):
    """
    Turn several captures into ONE stored template (mean embedding).
    Returns (template_list, None) or raises FaceError.
    """
    if not isinstance(b64_images, list) or len(b64_images) < MIN_IMAGES:
        raise FaceError("NOT_ENOUGH_IMAGES", f"Capture at least {MIN_IMAGES} images.")
    if len(b64_images) > MAX_IMAGES:
        raise FaceError("TOO_MANY_IMAGES", f"At most {MAX_IMAGES} images are accepted.")

    embeddings, thumbs = [], []
    for i, b64 in enumerate(b64_images, start=1):
        try:
            embeddings.append(analyze_image(b64))
            thumbs.append(_thumb(b64))
        except FaceError as e:
            raise FaceError(e.code, f"Image {i}: {e.message}")

    # Basic replay sanity: the same frame submitted several times is rejected.
    for i in range(len(thumbs)):
        for j in range(i + 1, len(thumbs)):
            if float(np.mean(np.abs(thumbs[i] - thumbs[j]))) < 1.0:
                raise FaceError("DUPLICATE_FRAMES", "Captures are identical. Capture separate, live images.")

    # All captures must be the same person. Compare every PAIR: comparing against the
    # mean lets a single odd-one-out slip through (it scores ~0.5 vs the mean of the others).
    for i in range(len(embeddings)):
        for j in range(i + 1, len(embeddings)):
            if float(np.dot(embeddings[i], embeddings[j])) < CONSISTENCY_THRESHOLD:
                raise FaceError("INCONSISTENT_FACES",
                                f"Images {i + 1} and {j + 1} do not appear to be the same person. Only one person may register.")
    mean = np.mean(embeddings, axis=0)
    mean /= (np.linalg.norm(mean) or 1.0)
    return mean.tolist()


def _best_match(embedding, registered_rows, exclude_voter_id=None):
    """rows: (voter_id, name, encrypted_embedding, ...). Returns (voter_id, name, similarity)."""
    best = (None, None, -1.0)
    for row in registered_rows:
        voter_id, name, enc = row[0], row[1], row[2]
        if not enc or voter_id == exclude_voter_id:
            continue
        stored = decrypt_embedding(enc)
        if stored is None or stored.shape != embedding.shape:
            continue  # legacy / unreadable template
        sim = float(np.dot(stored / (np.linalg.norm(stored) or 1.0), embedding))
        if sim > best[2]:
            best = (voter_id, name, sim)
    return best


def find_duplicate(template, registered_rows, exclude_voter_id):
    """Voter ID of an already-registered person with the same face, else None."""
    voter_id, _, sim = _best_match(np.asarray(template, dtype=np.float32), registered_rows, exclude_voter_id)
    return voter_id if voter_id and sim >= MATCH_THRESHOLD else None


def authenticate_face(b64_image, registered_voters):
    """Returns (voter_id, name, message). Raises FaceError for bad images."""
    live = analyze_image(b64_image)
    voter_id, name, sim = _best_match(live, registered_voters)
    if voter_id and sim >= MATCH_THRESHOLD:
        return voter_id, name, "Face verified"
    return None, None, "Face not recognized"
