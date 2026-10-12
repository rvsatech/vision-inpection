"""
Contagem de objetos (caixas, peças, paletes) vistos de cima — pipeline clássico:

1. segmenta objetos x fundo: distância de cor (Lab) até a cor dominante do fundo;
2. Otsu + morfologia;
3. componentes conectados com filtro de área relativo à mediana;
4. blobs muito maiores que a mediana (objetos encostados) contam como k objetos.

Para cenas reais variadas use YOLO (COCO ou modelo treinado) — ver training/README.md.
"""

from __future__ import annotations

import cv2
import numpy as np

from .base import Det, Output, clamp01, plural


class ObjectCountHeuristic:
    mode = "heuristic"
    model_version = "count-opencv-1.1"

    def run(self, image: np.ndarray, confidence_threshold: float) -> Output:
        h, w = image.shape[:2]
        lab = cv2.cvtColor(cv2.GaussianBlur(image, (5, 5), 0), cv2.COLOR_BGR2LAB).astype(np.float32)
        # cor de fundo = mediana das bordas laterais (onde quase nunca há objeto inteiro)
        border = np.concatenate([lab[:, : w // 30].reshape(-1, 3), lab[:, -w // 30 :].reshape(-1, 3)])
        bg = np.median(border, axis=0)
        dist = np.linalg.norm(lab - bg, axis=2)
        dist = cv2.normalize(dist, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
        _, mask = cv2.threshold(dist, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8), iterations=2)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))

        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        blobs = [(cv2.boundingRect(c), cv2.contourArea(c)) for c in contours]
        blobs = [(b, a) for b, a in blobs if a > 0.0015 * h * w and b[2] < 0.9 * w and b[3] < 0.9 * h]
        if not blobs:
            return Output("INFO", "Nenhum objeto identificado", {"count": 0}, [])

        median_area = float(np.median([a for _, a in blobs]))
        dets: list[Det] = []
        total = 0
        for (x, y, bw, bh), area in blobs:
            ratio = area / median_area
            if ratio < 0.35:
                continue  # ruído / fragmento
            k = max(1, round(ratio)) if ratio > 1.6 else 1
            rect_fill = area / max(1, bw * bh)
            conf = clamp01(0.55 + 0.4 * rect_fill - 0.1 * abs(ratio - k))
            if conf < confidence_threshold:
                continue
            total += k
            label = "object" if k == 1 else f"object_group:{k}"
            dets.append(Det(label=label, confidence=round(conf, 3), box=(x, y, bw, bh), severity="info"))

        return Output(
            verdict="INFO",
            headline=f"{plural(total, 'objeto contado', 'objetos contados')}",
            metrics={"count": total, "groups": sum(1 for d in dets if d.label != "object")},
            detections=dets,
        )
