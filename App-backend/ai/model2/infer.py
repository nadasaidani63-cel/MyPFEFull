from __future__ import annotations

import json
import sys

from model_core import health_payload, load_bundle, predict_batch, predict_one


def main() -> None:
    payload = json.loads(sys.stdin.read() or "{}")
    bundle = load_bundle()

    if payload.get("mode") == "health":
        print(json.dumps({"model": health_payload(bundle)}))
        return

    readings = payload.get("readings")
    if isinstance(readings, list):
        print(json.dumps({"model": health_payload(bundle), "results": predict_batch(bundle, readings)}))
        return

    print(json.dumps({"model": health_payload(bundle), "result": predict_one(bundle, payload)}))


if __name__ == "__main__":
    main()
