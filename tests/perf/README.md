Run the real local load fixture against the isolated Docker demo:

```bash
QA_BASE_URL=http://127.0.0.1:4170 \
PERF_SOURCE_COMMIT=<running-application-source-SHA> \
PERF_ARTIFACT=/tmp/copilot-room-load.json \
node tests/perf/local-room.mjs
```

Use Node22. The target must be loopback and permit explicit local mock authentication. The probe creates five synthetic students and one session, admits all five, connects six independent Socket.IO clients, warms five rounds, then samples30 rounds by default (`PERF_ROUNDS=30..200`). Each round sends six projected room-state reads concurrently and one teacher board-note mutation. All five student sockets and the teacher must receive the matching board revision; missing receipts fail the probe.

The JSON records210 API samples,150 student receipts and30 teacher receipts for the default run. p95 uses nearest rank and is measured from the client before the request to receipt of the corresponding event, including HTTP, transaction and outbox delay. Exit status is nonzero on incomplete samples, HTTP/socket errors or p95 thresholds (API500ms, student event1500ms). The synthetic session is ended on completion; existing data/volumes are never reset.

This is a baseline for a small board session on local Docker. It excludes uploads, AI/media providers, WAN/device rendering, large datasets and full-release performance acceptance. It does not run automatically in the unit suite. Logs and artifacts contain no access/invite tokens.
