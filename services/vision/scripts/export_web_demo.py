"""
Exporta as imagens e os resultados de demonstração usados pela landing page
(apps/web/public/demo + apps/web/src/lib/demo-results.ts). Os resultados vêm do
pipeline real — a landing mostra exatamente o que o sistema detecta.
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

import cv2

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT.parent.parent / "apps" / "web"
sys.path.insert(0, str(ROOT))

from app.detectors import HEURISTICS  # noqa: E402

DEMO = {"ppe_hero.jpg": "PPE_COMPLIANCE", "defect_00.jpg": "QUALITY_DEFECT", "count_03.jpg": "OBJECT_COUNT"}


def main() -> None:
    out: dict[str, dict] = {}
    (WEB / "public" / "demo").mkdir(parents=True, exist_ok=True)
    for file, service in DEMO.items():
        img = cv2.imread(str(ROOT / "samples" / file))
        h, w = img.shape[:2]
        o = HEURISTICS[service]().run(img, 0.35)
        out[file] = {
            "service": service,
            "headline": o.headline,
            "verdict": o.verdict,
            "metrics": {k: float(v) for k, v in o.metrics.items()},
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
                for d in o.detections
            ],
        }
        shutil.copy(ROOT / "samples" / file, WEB / "public" / "demo" / file)
    ts = (
        "import type { DetectionItem, ServiceCode, Verdict } from './types';\n\n"
        "/** Gerado por services/vision/scripts/export_web_demo.py — resultados reais do pipeline de visão. */\n"
        "export const DEMO: Record<string, { service: ServiceCode; headline: string; verdict: Verdict; metrics: Record<string, number>; detections: DetectionItem[] }> = "
        + json.dumps(out, ensure_ascii=False, indent=2)
        + ";\n"
    )
    (WEB / "src" / "lib" / "demo-results.ts").write_text(ts, encoding="utf-8")
    print("demo exportada:", ", ".join(f"{k}: {v['headline']}" for k, v in out.items()))


if __name__ == "__main__":
    main()
