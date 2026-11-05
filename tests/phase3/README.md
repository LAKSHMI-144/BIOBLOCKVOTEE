Registration API test (needs MySQL + Python AI + Node all running, and an EMPTY voters table):

    cd tests/phase3
    python make_test_images.py          # builds imgs.json from InsightFace's bundled sample photo
    python test_registration_api.py     # checks registration and legacy-login rejection

WARNING: run against a scratch database only. imgs.json is generated, not committed.

The login regression checks now verify that a legacy single still image cannot obtain a voter
session. `test_election_flow.py` stops after this check because its photo fixtures cannot satisfy
the randomized liveness challenge; complete voter login and the downstream voting flow manually through the
browser with a webcam.
