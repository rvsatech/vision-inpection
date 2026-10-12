"""Registro de detectores por serviço: YOLO quando houver pesos, senão OpenCV."""

from __future__ import annotations

import logging
import os
from pathlib import Path

from .base import Detector
from .counting import ObjectCountHeuristic
from .defects import QualityDefectHeuristic
from .ppe import PpeHeuristic

log = logging.getLogger("vision")

WEIGHTS = {"PPE_COMPLIANCE": "ppe.pt", "QUALITY_DEFECT": "defects.pt", "OBJECT_COUNT": "count.pt"}
HEURISTICS = {
    "PPE_COMPLIANCE": PpeHeuristic,
    "QUALITY_DEFECT": QualityDefectHeuristic,
    "OBJECT_COUNT": ObjectCountHeuristic,
}


def build_detectors(backend: str, models_dir: Path) -> dict[str, Detector]:
    detectors: dict[str, Detector] = {}
    for service, filename in WEIGHTS.items():
        weights = models_dir / os.getenv(f"VISION_WEIGHTS_{service}", filename)
        use_yolo = backend == "yolo" or (backend == "auto" and weights.exists())
        if use_yolo:
            if not weights.exists():
                raise RuntimeError(f"VISION_BACKEND=yolo, mas os pesos não existem: {weights}")
            try:
                from .yolo import YoloDetector

                classes = os.getenv("VISION_COUNT_CLASSES")
                detectors[service] = YoloDetector(
                    service, weights, count_classes=set(classes.split(",")) if classes else None
                )
                log.info("serviço %s → YOLO (%s)", service, weights.name)
                continue
            except ImportError:
                if backend == "yolo":
                    raise
                log.warning("ultralytics não instalado; %s usará OpenCV", service)
        detectors[service] = HEURISTICS[service]()
        log.info("serviço %s → heurístico OpenCV", service)
    return detectors
