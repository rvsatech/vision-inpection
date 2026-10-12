"""
Backend YOLO (Ultralytics) — usado quando há pesos treinados em models/.

Arquivos esperados (configuráveis por variável de ambiente):
    models/ppe.pt      → classes de EPI (ex.: person, helmet, vest, no_helmet, no_vest, head)
    models/defects.pt  → classes de defeito (ex.: NEU-DET: crazing, inclusion, patches, pitted_surface, rolled-in_scale, scratches)
    models/count.pt    → qualquer detector; por padrão use yolo11n.pt (COCO) e filtre classes

O pós-processamento (regras de negócio) fica aqui e é testável sem PyTorch:
os testes injetam um "modelo falso" com a mesma interface do Ultralytics.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

from .base import Det, Output, clamp01, plural

PPE_VIOLATION_LABELS = {
    "no_helmet",
    "no-helmet",
    "no_hardhat",
    "no-hardhat",
    "head",
    "no_vest",
    "no-vest",
    "no-safety vest",
}


@dataclass
class RawBox:
    label: str
    confidence: float
    box: tuple[int, int, int, int]


def _predict(model: Any, image: np.ndarray, conf: float) -> list[RawBox]:
    """Adapta o resultado do Ultralytics para RawBox (x, y, w, h em pixels)."""
    results = model.predict(image, conf=max(conf, 0.05), verbose=False)
    out: list[RawBox] = []
    names = model.names
    for r in results:
        for xyxy, c, k in zip(r.boxes.xyxy.tolist(), r.boxes.conf.tolist(), r.boxes.cls.tolist(), strict=False):
            x1, y1, x2, y2 = (int(v) for v in xyxy)
            out.append(RawBox(str(names[int(k)]).lower(), float(c), (x1, y1, x2 - x1, y2 - y1)))
    return out


def _center_inside(inner: tuple[int, int, int, int], outer: tuple[int, int, int, int]) -> bool:
    cx, cy = inner[0] + inner[2] / 2, inner[1] + inner[3] / 2
    return outer[0] <= cx <= outer[0] + outer[2] and outer[1] <= cy <= outer[1] + outer[3]


class YoloDetector:
    mode = "yolo"

    def __init__(self, service: str, weights: Path, model: Any | None = None, count_classes: set[str] | None = None):
        self.service = service
        self.model_version = f"yolo:{weights.name}"
        if model is None:
            from ultralytics import YOLO  # import tardio: só exige PyTorch se houver pesos

            model = YOLO(str(weights))
        self.model = model
        self.count_classes = count_classes

    def run(self, image: np.ndarray, confidence_threshold: float) -> Output:
        boxes = _predict(self.model, image, confidence_threshold)
        boxes = [b for b in boxes if b.confidence >= confidence_threshold]
        if self.service == "PPE_COMPLIANCE":
            return self._ppe(boxes)
        if self.service == "QUALITY_DEFECT":
            return self._defects(boxes, image.shape[0] * image.shape[1])
        return self._count(boxes)

    def _ppe(self, boxes: list[RawBox]) -> Output:
        persons = [b for b in boxes if b.label == "person"]
        helmets = [b for b in boxes if b.label in {"helmet", "hardhat", "hard-hat"}]
        vests = [b for b in boxes if b.label in {"vest", "safety vest", "safety-vest"}]
        explicit = [b for b in boxes if b.label in PPE_VIOLATION_LABELS]
        dets: list[Det] = []
        no_helmet = no_vest = 0

        if persons:
            vest_tracked = bool(vests) or any("vest" in e.label for e in explicit)
            for p in persons:

                def inside(b: RawBox, p: RawBox = p) -> bool:
                    return _center_inside(b.box, p.box)

                helmet_violation = any(inside(e) and "vest" not in e.label for e in explicit)
                vest_violation = any(inside(e) and "vest" in e.label for e in explicit)
                has_helmet = any(inside(h) for h in helmets) and not helmet_violation
                has_vest = (any(inside(v) for v in vests) and not vest_violation) if vest_tracked else True
                if not has_helmet:
                    no_helmet += 1
                    dets.append(Det("person:no_helmet", p.confidence, p.box, "critical"))
                elif not has_vest:
                    no_vest += 1
                    dets.append(Det("person:no_vest", p.confidence, p.box, "warning"))
                else:
                    dets.append(Det("person:compliant", p.confidence, p.box, "info"))
            total = len(persons)
        else:
            # modelos sem classe "person": cada capacete/cabeça é um colaborador
            for h in helmets:
                dets.append(Det("person:compliant", h.confidence, h.box, "info"))
            for e in explicit:
                if "vest" in e.label:
                    no_vest += 1
                    dets.append(Det("person:no_vest", e.confidence, e.box, "warning"))
                else:
                    no_helmet += 1
                    dets.append(Det("person:no_helmet", e.confidence, e.box, "critical"))
            total = len(helmets) + no_helmet

        violations = no_helmet + no_vest
        if total == 0:
            return Output(
                "INFO",
                "Nenhum colaborador identificado na imagem",
                {"persons": 0, "violations": 0, "complianceRate": 1.0},
                dets,
            )
        headline = (
            f"{no_helmet} sem capacete, {no_vest} sem colete — {plural(total, 'colaborador', 'colaboradores')}"
            if violations
            else f"{plural(total, 'colaborador', 'colaboradores')} com EPI completo"
        )
        return Output(
            "FAIL" if violations else "PASS",
            headline,
            {
                "persons": total,
                "violations": violations,
                "noHelmet": no_helmet,
                "noVest": no_vest,
                "complianceRate": round((total - violations) / total, 3),
            },
            dets,
        )

    def _defects(self, boxes: list[RawBox], area: int) -> Output:
        dets = [Det(b.label, clamp01(b.confidence), b.box, "critical") for b in boxes]
        if not dets:
            return Output("PASS", "Superfície sem defeitos detectados", {"defects": 0, "affectedAreaPct": 0.0}, [])
        by = {}
        for d in dets:
            by[d.label] = by.get(d.label, 0) + 1
        parts = ", ".join(f"{n} {k}" for k, n in sorted(by.items(), key=lambda x: -x[1]))
        affected = sum(d.box[2] * d.box[3] for d in dets) / max(area, 1)
        return Output(
            "FAIL",
            f"{plural(len(dets), 'defeito encontrado', 'defeitos encontrados')} ({parts})",
            {"defects": len(dets), "affectedAreaPct": round(affected * 100, 2)},
            dets,
        )

    def _count(self, boxes: list[RawBox]) -> Output:
        if self.count_classes:
            boxes = [b for b in boxes if b.label in self.count_classes]
        dets = [Det(b.label, clamp01(b.confidence), b.box, "info") for b in boxes]
        by: dict[str, float] = {}
        for d in dets:
            by[f"count:{d.label}"] = by.get(f"count:{d.label}", 0) + 1
        return Output("INFO", plural(len(dets), "objeto contado", "objetos contados"), {"count": len(dets), **by}, dets)
