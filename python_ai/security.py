"""Encryption of face embeddings at rest (Fernet / AES-128-CBC + HMAC)."""
import json
import os
import numpy as np
from cryptography.fernet import Fernet, InvalidToken


def _fernet():
    key = os.getenv("FACE_ENCRYPTION_KEY")
    if not key:
        raise RuntimeError(
            "FACE_ENCRYPTION_KEY is not set. Generate one with: "
            "python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
    return Fernet(key.encode())


def check_config():
    """Fail fast at startup if the key is missing/invalid."""
    _fernet()


def encrypt_embedding(embedding) -> str:
    payload = json.dumps([float(x) for x in embedding]).encode()
    return _fernet().encrypt(payload).decode()


def decrypt_embedding(token: str):
    """Returns a numpy vector, or None if the value is legacy/corrupt."""
    try:
        return np.array(json.loads(_fernet().decrypt(token.encode())), dtype=np.float32)
    except (InvalidToken, ValueError, AttributeError):
        return None
