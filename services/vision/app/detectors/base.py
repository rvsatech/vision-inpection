"""Interface comum dos detectores (Strategy): heurístico OpenCV ou YOLO."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

import numpy as np


@dataclass
class Det:
    label: str
    confidence: float
    # caixa em pixels (x, y, w, h) na imagem processada
    box: tuple[int, int, int, int]
    severity: str = "info"


@dataclass
class Output:
    verdict: str
    headline: str
    metrics: dict[str, float]
    detections: list[Det] = field(default_factory=list)


class Detector(Protocol):
    mode: str
    model_version: str

    def run(self, image: np.ndarray, confidence_threshold: float) -> Output: ...


def clamp01(v: float) -> float:
    return float(max(0.0, min(1.0, v)))


def plural(n: int, singular: str, plural_form: str) -> str:
    return f"{n} {singular if n == 1 else plural_form}"
