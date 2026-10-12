"""
Roda o pipeline real sobre samples/ e grava samples/results.json no formato do
contrato vision.infer.response.v1. O seed da API usa esse arquivo para popular o
dashboard com análises de demonstração coerentes com as imagens.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import cv2

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.detectors import HEURISTICS  # noqa: E402


def main() -> None:
    samples = ROOT / "samples"
    manifest = json.loads((samples / "manifest.json").read_text(encoding="utf-8"))
    results = {}
    for m in manifest:
        det = HEURISTICS[m["service"]]()
        img = cv2.imread(str(samples / m["file"]))
        h, w = img.shape[:2]
        out = det.run(img, 0.35)
        results[m["file"]] = {
            "service": m["service"],
            "mode": det.mode,
            "modelVersion": det.model_version,
            "latencyMs": 40.0,
            "image": {"width": w, "height": h},
            "summary": {
                "verdict": out.verdict,
                "headline": out.headline,
                "metrics": {k: float(v) for k, v in out.metrics.items()},
            },
            "detections": [
                {
                    "label": d.label,
                    "confidence": d.confidence,
                    "severity": d.severity,
                    "bbox": {
                        "x": round(d.box[0] / w, 4),
                        "y": round(d.box[1] / h, 4),
                        "w": round(d.box[2] / w, 4),
                        "h": round(d.box[3] / h, 4),
                    },
                }
                for d in out.detections
            ],
        }
    (samples / "results.json").write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"{len(results)} resultados gravados em samples/results.json")


if __name__ == "__main__":
    main()
