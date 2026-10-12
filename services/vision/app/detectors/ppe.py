"""
Conformidade de EPI (capacete e colete) — pipeline clássico de fallback:

1. localiza cabeças por cor de pele em YCrCb (faixa ampla, testada com tons de
   pele claros a muito escuros) + filtro de forma (blobs ~circulares);
2. capacete: procura cor de capacete (alta saturação ou branco) na faixa logo
   acima/sobre a cabeça;
3. colete: procura cores de alta visibilidade (amarelo-limão/laranja) no tronco.

⚠ Limitação conhecida: depende de rostos/cabeças visíveis e é sensível a fundos
com tons de pele. É um fallback para desenvolvimento e demonstração; em produção
use o backend YOLO treinado com um dataset de EPI (training/README.md).
"""

from __future__ import annotations

import cv2
import numpy as np

from .base import Det, Output, clamp01, plural


class PpeHeuristic:
    mode = "heuristic"
    model_version = "ppe-opencv-1.1"

    def run(self, image: np.ndarray, confidence_threshold: float) -> Output:
        h, w = image.shape[:2]
        ycrcb = cv2.cvtColor(image, cv2.COLOR_BGR2YCrCb)
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        skin_raw = cv2.inRange(ycrcb, (20, 135, 80), (255, 180, 125))
        skin = cv2.morphologyEx(skin_raw, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        skin = cv2.morphologyEx(skin, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))

        # pele saturada (tons médios/escuros) não pode contar como capacete
        helmet_mask = cv2.bitwise_and(
            self._helmet_mask(hsv), cv2.bitwise_not(cv2.dilate(skin_raw, np.ones((3, 3), np.uint8)))
        )
        vest_mask = self._vest_mask(hsv)

        contours, _ = cv2.findContours(skin, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        heads = []
        for c in contours:
            area = cv2.contourArea(c)
            x, y, bw, bh = cv2.boundingRect(c)
            if area < 0.0004 * h * w or area > 0.05 * h * w:
                continue
            aspect = bw / max(1, bh)
            circularity = 4 * np.pi * area / max(1.0, cv2.arcLength(c, True) ** 2)
            if 0.5 < aspect < 2.2 and circularity > 0.45:
                heads.append((x, y, bw, bh, circularity))

        dets: list[Det] = []
        persons = no_helmet = no_vest = 0
        for x, y, bw, bh, circ in heads:
            r = max(bw, bh) / 2
            cx = x + bw / 2
            # faixa do capacete: de ~1 raio acima do topo até o meio da cabeça
            hx1, hx2 = int(cx - 1.4 * r), int(cx + 1.4 * r)
            hy1, hy2 = int(y - 1.1 * r), int(y + 0.5 * bh)
            helmet_ratio = _ratio(helmet_mask, hx1, hy1, hx2, hy2)
            # tronco: de ~0.5 cabeça abaixo do queixo até ~5 raios
            tx1, tx2 = int(cx - 1.8 * r), int(cx + 1.8 * r)
            ty1, ty2 = int(y + bh + 0.3 * r), int(y + bh + 5.5 * r)
            vest_ratio = _ratio(vest_mask, tx1, ty1, tx2, ty2)

            has_helmet = helmet_ratio > 0.12
            has_vest = vest_ratio > 0.15
            persons += 1
            if not has_helmet:
                no_helmet += 1
            elif not has_vest:
                no_vest += 1

            label = (
                "person:compliant"
                if has_helmet and has_vest
                else ("person:no_helmet" if not has_helmet else "person:no_vest")
            )
            severity = "info" if label == "person:compliant" else ("critical" if not has_helmet else "warning")
            evidence = helmet_ratio if not has_helmet else min(helmet_ratio, vest_ratio if not has_vest else 1)
            conf = clamp01(
                0.5
                + 0.3 * min(circ, 1)
                + 0.2 * (1 - min(evidence * 2, 1) if label != "person:compliant" else min(helmet_ratio * 2, 1))
            )
            if conf < confidence_threshold:
                continue
            px1, py1 = max(0, int(cx - 2 * r)), max(0, int(y - 1.2 * r))
            px2, py2 = min(w, int(cx + 2 * r)), min(h, int(y + bh + 12 * r))
            dets.append(
                Det(label=label, confidence=round(conf, 3), box=(px1, py1, px2 - px1, py2 - py1), severity=severity)
            )

        violations = no_helmet + no_vest
        if persons == 0:
            return Output(
                "INFO",
                "Nenhum colaborador identificado na imagem",
                {"persons": 0, "violations": 0, "complianceRate": 1.0},
                [],
            )
        compliance = round((persons - violations) / persons, 3)
        if violations:
            parts = []
            if no_helmet:
                parts.append(f"{no_helmet} sem capacete")
            if no_vest:
                parts.append(f"{no_vest} sem colete")
            headline = f"{' e '.join(parts)} — {plural(persons, 'colaborador', 'colaboradores')} na cena"
        else:
            headline = f"{plural(persons, 'colaborador', 'colaboradores')} com EPI completo"
        return Output(
            verdict="FAIL" if violations else "PASS",
            headline=headline,
            metrics={
                "persons": persons,
                "violations": violations,
                "noHelmet": no_helmet,
                "noVest": no_vest,
                "complianceRate": compliance,
            },
            detections=dets,
        )

    @staticmethod
    def _helmet_mask(hsv: np.ndarray) -> np.ndarray:
        saturated = cv2.inRange(hsv, (0, 150, 150), (180, 255, 255))  # amarelo, laranja, azul, vermelho vivos
        white = cv2.inRange(hsv, (0, 0, 215), (180, 40, 255))
        return cv2.bitwise_or(saturated, white)

    @staticmethod
    def _vest_mask(hsv: np.ndarray) -> np.ndarray:
        lime = cv2.inRange(hsv, (25, 150, 150), (45, 255, 255))  # amarelo-limão fluorescente
        orange = cv2.inRange(hsv, (5, 170, 170), (20, 255, 255))  # laranja de alta visibilidade
        return cv2.bitwise_or(lime, orange)


def _ratio(mask: np.ndarray, x1: int, y1: int, x2: int, y2: int) -> float:
    h, w = mask.shape
    x1, y1, x2, y2 = max(0, x1), max(0, y1), min(w, x2), min(h, y2)
    if x2 <= x1 or y2 <= y1:
        return 0.0
    return float(np.count_nonzero(mask[y1:y2, x1:x2])) / ((x2 - x1) * (y2 - y1))
