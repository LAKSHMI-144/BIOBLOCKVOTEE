Registration API test (needs MySQL + Python AI + Node all running, and an EMPTY voters table):

    cd tests/phase3
    python make_test_images.py          # builds imgs.json from InsightFace's bundled sample photo
    python test_registration_api.py     # expects "32/32 checks passed"

WARNING: run against a scratch database only. imgs.json is generated, not committed.
