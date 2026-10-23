import hmac
import logging
import os
from functools import wraps

import mysql.connector
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS

load_dotenv()

from blockchain import voting_blockchain  # noqa: E402
from face_module import (FaceError, analyze_image, authenticate_face,  # noqa: E402
                         build_template, find_duplicate, get_engine)
from security import check_config, encrypt_embedding  # noqa: E402

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("blockbiovote-ai")

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 25 * 1024 * 1024
CORS(app, origins=[o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")])

INTERNAL_KEY = os.getenv("INTERNAL_API_KEY", "")

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "user": os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", ""),
    "database": os.getenv("DB_NAME", "securevoteai"),
}


def get_db():
    return mysql.connector.connect(**DB_CONFIG)


def internal_only(fn):
    """Only the Node server (which knows INTERNAL_API_KEY) may call these routes."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        supplied = request.headers.get("X-Internal-Key", "")
        if not INTERNAL_KEY or not hmac.compare_digest(supplied, INTERNAL_KEY):
            return jsonify({"success": False, "message": "Forbidden"}), 403
        return fn(*args, **kwargs)
    return wrapper


def face_error_response(e):
    return jsonify({"success": False, "code": e.code, "message": e.message}), 400


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "Python AI running", "blockchain_blocks": len(voting_blockchain.chain)})


@app.route("/check-face", methods=["POST"])
@internal_only
def check_face():
    """Validate a single webcam frame (one face, good quality). Stores nothing."""
    try:
        analyze_image((request.get_json(silent=True) or {}).get("image"))
        return jsonify({"success": True, "message": "Face looks good"})
    except FaceError as e:
        return face_error_response(e)
    except Exception:
        log.exception("check-face failed")
        return jsonify({"success": False, "message": "Face analysis failed"}), 500


@app.route("/register-face", methods=["POST"])
@internal_only
def register_face():
    data = request.get_json(silent=True) or {}
    voter_id, images = data.get("voter_id"), data.get("images")
    if not voter_id:
        return jsonify({"success": False, "message": "voter_id is required"}), 400
    db = None
    try:
        db = get_db()
        c = db.cursor()
        c.execute("SELECT face_encoding FROM voters WHERE voter_id = %s", (voter_id,))
        row = c.fetchone()
        if row is None:
            return jsonify({"success": False, "message": "Voter not found"}), 404
        if row[0]:
            return jsonify({"success": False, "message": "Face already registered for this voter"}), 409

        template = build_template(images)

        c.execute("SELECT voter_id, name, face_encoding FROM voters WHERE face_encoding IS NOT NULL")
        if find_duplicate(template, c.fetchall(), exclude_voter_id=voter_id):
            return jsonify({"success": False, "code": "DUPLICATE_FACE",
                            "message": "This face is already registered under another voter ID"}), 409

        c.execute("UPDATE voters SET face_encoding = %s, face_registered_at = NOW() "
                  "WHERE voter_id = %s AND face_encoding IS NULL",
                  (encrypt_embedding(template), voter_id))
        db.commit()
        if c.rowcount == 0:  # lost a race with a concurrent registration
            return jsonify({"success": False, "message": "Face already registered for this voter"}), 409
        return jsonify({"success": True, "message": "Face registered successfully"})
    except FaceError as e:
        return face_error_response(e)
    except Exception:
        log.exception("register-face failed")
        return jsonify({"success": False, "message": "Face registration failed"}), 500
    finally:
        if db is not None:
            db.close()


@app.route("/authenticate", methods=["POST"])
@internal_only
def authenticate():
    image = (request.get_json(silent=True) or {}).get("image")
    db = None
    try:
        db = get_db()
        c = db.cursor()
        c.execute("SELECT voter_id, name, face_encoding, has_voted FROM voters WHERE face_encoding IS NOT NULL")
        voters = c.fetchall()

        voter_id, name, msg = authenticate_face(image, voters)
        if not voter_id:
            return jsonify({"success": False, "message": msg})
        has_voted = next(bool(v[3]) for v in voters if v[0] == voter_id)
        return jsonify({"success": True, "voter_id": voter_id, "voter_name": name,
                        "has_voted": has_voted, "message": msg})
    except FaceError as e:
        return jsonify({"success": False, "code": e.code, "message": e.message})
    except Exception:
        log.exception("authenticate failed")
        return jsonify({"success": False, "message": "Authentication failed"}), 500
    finally:
        if db is not None:
            db.close()


@app.route("/add-to-blockchain", methods=["POST"])
@internal_only
def add_to_blockchain():
    try:
        data = request.get_json(silent=True) or {}
        result = voting_blockchain.add_vote(data["voter_id"], data["candidate"])
        return jsonify({"success": True, **result})
    except KeyError:
        return jsonify({"success": False, "message": "voter_id and candidate are required"}), 400
    except Exception:
        log.exception("add-to-blockchain failed")
        return jsonify({"success": False, "message": "Could not record vote"}), 500


@app.route("/blockchain-status", methods=["GET"])
@internal_only
def blockchain_status():
    return jsonify({
        "is_valid": voting_blockchain.is_valid(),
        "total_blocks": len(voting_blockchain.chain),
        "chain": voting_blockchain.get_chain_data(),
    })


if __name__ == "__main__":
    if not INTERNAL_KEY:
        raise SystemExit("INTERNAL_API_KEY is not set (see python_ai/.env.example)")
    check_config()
    log.info("Loading face models (first run downloads them, ~300 MB)...")
    get_engine()
    app.run(host="127.0.0.1", port=int(os.getenv("PORT", "5001")),
            debug=os.getenv("FLASK_DEBUG", "0") == "1")
