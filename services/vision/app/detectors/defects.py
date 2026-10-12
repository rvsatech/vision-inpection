"""
Inspeção de defeitos de superfície — pipeline clássico (sem treino):

1. tons de cinza + CLAHE (equaliza iluminação local);
2. estima o "fundo" com um blur grande (textura escovada some, defeitos não);
3. resíduo = |imagem − fundo| → normalizado por desvio robusto (MAD);
4. limiar em z-score + morfologia → componentes conectados;
5. classifica pela forma: alongado/fino = risco; compacto = mancha/pite.

Funciona bem em superfícies homogêneas (chapas, peças usinadas). Para produção,
treine um YOLO com NEU-DET/Severstal (ver training/README.md).
"""

from __future__ import annotations

import cv2
import numpy as np

from .base import Det, Output, clamp01, plural

LABELS_PT = {"scratch": "risco", "spot": "mancha"}


class QualityDefectHeuristic:
    mode = "heuristic"
    model_version = "defect-opencv-1.2"

    def __init__(self, z_threshold: float = 6.0, min_area_ratio: float = 0.00012):
        self.z = z_threshold
        self.min_area_ratio = min_area_ratio

    def run(self, image: np.ndarray, confidence_threshold: float) -> Output:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        gray = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)
        h, w = gray.shape
        k = max(31, (min(h, w) // 12) | 1)
        background = cv2.medianBlur(gray, min(k, 255) if k % 2 else k + 1)
        residual = cv2.absdiff(gray, background).astype(np.float32)
        residual = cv2.GaussianBlur(residual, (3, 3), 0)

        med = float(np.median(residual))
        mad = float(np.median(np.abs(residual - med))) * 1.4826 + 1e-6
        z = (residual - med) / mad
        mask = (z > self.z).astype(np.uint8) * 255
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))

        n, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
        min_area = self.min_area_ratio * h * w
        dets: list[Det] = []
        for i in range(1, n):
            x, y, bw, bh, area = (int(v) for v in stats[i])
            if area < min_area:
                continue
            comp = labels[y : y + bh, x : x + bw] == i
            strength = float(np.percentile(z[y : y + bh, x : x + bw][comp], 90))
            fill = area / max(1, bw * bh)
            elongation = max(bw, bh) / max(1, min(bw, bh))
            label = "scratch" if (fill < 0.35 or elongation > 4) else "spot"
            conf = clamp01(0.45 + (strength - self.z) / (3 * self.z))
            if conf < confidence_threshold:
                continue
            dets.append(
                Det(
                    label=label,
                    confidence=round(conf, 3),
                    box=(x, y, bw, bh),
                    severity="critical" if label == "scratch" else "warning",
                )
            )

        dets = _merge_overlapping(dets)
        counts = {k: sum(1 for d in dets if d.label == k) for k in LABELS_PT}
        if dets:
            parts = [plural(c, LABELS_PT[k], LABELS_PT[k] + "s") for k, c in counts.items() if c]
            headline = f"{plural(len(dets), 'defeito encontrado', 'defeitos encontrados')} ({', '.join(parts)})"
            verdict = "FAIL"
        else:
            headline, verdict = "Superfície sem defeitos detectados", "PASS"
        affected = sum(d.box[2] * d.box[3] for d in dets) / (h * w)
        return Output(
            verdict=verdict,
            headline=headline,
            metrics={
                "defects": len(dets),
                "scratches": counts["scratch"],
                "spots": counts["spot"],
                "affectedAreaPct": round(affected * 100, 2),
            },
            detections=dets,
        )


def _merge_overlapping(dets: list[Det]) -> list[Det]:
    """Une caixas sobrepostas (um risco quebrado em pedaços vira um só)."""
    merged: list[Det] = []
    for d in sorted(dets, key=lambda d: -d.box[2] * d.box[3]):
        for m in merged:
            if _overlap(m.box, d.box, pad=6):
                x1, y1 = min(m.box[0], d.box[0]), min(m.box[1], d.box[1])
                x2 = max(m.box[0] + m.box[2], d.box[0] + d.box[2])
                y2 = max(m.box[1] + m.box[3], d.box[1] + d.box[3])
                m.box = (x1, y1, x2 - x1, y2 - y1)
                m.confidence = max(m.confidence, d.confidence)
                break
        else:
            merged.append(d)
    return merged


def _overlap(a, b, pad=0) -> bool:
    return not (
        a[0] + a[2] + pad < b[0] or b[0] + b[2] + pad < a[0] or a[1] + a[3] + pad < b[1] or b[1] + b[3] + pad < a[1]
    )
