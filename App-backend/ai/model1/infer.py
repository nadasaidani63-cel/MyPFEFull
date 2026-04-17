from __future__ import annotations

import json
import sys

from model_core import LABEL_MAP, load_model_bundle, predict_batch, predict_one


def main() -> int:
    raw = sys.stdin.read().strip()
    payload = json.loads(raw) if raw else {}
    bundle = load_model_bundle(prefer_runtime=True)

    if payload.get("mode") == "health":
        output = {
            "success": True,
            "model": {
                "source": bundle["source"],
                "version": bundle["version"],
                "classes": list(LABEL_MAP.values()),
                "n_features": int(getattr(bundle["model"], "n_features_in_", 0) or 0),
            },
        }
        sys.stdout.write(json.dumps(output))
        return 0

    if payload.get("readings") is not None:
        results = predict_batch(bundle, list(payload.get("readings") or []))
        output = {
            "success": True,
            "model": {
                "source": bundle["source"],
                "version": bundle["version"],
            },
            "results": results,
        }
        sys.stdout.write(json.dumps(output))
        return 0

    result = predict_one(bundle, payload)
    sys.stdout.write(json.dumps({"success": True, "result": result}))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        sys.stderr.write(str(exc))
        raise

