"""Regras de negócio do backend YOLO, testadas com um modelo falso (sem PyTorch)."""

from pathlib import Path
from types import SimpleNamespace

import numpy as np

from app.detectors.yolo import YoloDetector


class FakeTensor(list):
    def tolist(self):
        return list(self)


class FakeModel:
    def __init__(self, names, boxes):
        self.names = dict(enumerate(names))
        self._boxes = boxes  # (label_idx, conf, (x1, y1, x2, y2))

    def predict(self, image, conf, verbose):
        xyxy = FakeTensor([list(b[2]) for b in self._boxes])
        confs = FakeTensor([b[1] for b in self._boxes])
        cls = FakeTensor([b[0] for b in self._boxes])
        return [SimpleNamespace(boxes=SimpleNamespace(xyxy=xyxy, conf=confs, cls=cls))]


IMG = np.zeros((480, 640, 3), np.uint8)


def detector(service, names, boxes, **kw):
    return YoloDetector(service, Path(f"{service.lower()}.pt"), model=FakeModel(names, boxes), **kw)


def test_ppe_associates_helmets_and_vests_to_persons():
    names = ["person", "helmet", "vest"]
    boxes = [
        (0, 0.9, (10, 10, 110, 400)),  # pessoa 1 com capacete e colete
        (1, 0.8, (40, 12, 80, 40)),
        (2, 0.8, (30, 120, 90, 220)),
        (0, 0.9, (300, 10, 400, 400)),  # pessoa 2 só com colete
        (2, 0.7, (320, 120, 380, 220)),
    ]
    out = detector("PPE_COMPLIANCE", names, boxes).run(IMG, 0.3)
    assert out.metrics["persons"] == 2
    assert out.metrics["noHelmet"] == 1
    assert out.verdict == "FAIL"
    assert sorted(d.label for d in out.detections) == ["person:compliant", "person:no_helmet"]


def test_ppe_models_without_person_class_use_explicit_violation_labels():
    out = detector("PPE_COMPLIANCE", ["helmet", "head"], [(0, 0.9, (0, 0, 20, 20)), (1, 0.8, (50, 0, 70, 20))]).run(
        IMG, 0.3
    )
    assert out.metrics == {"persons": 2, "violations": 1, "noHelmet": 1, "noVest": 0, "complianceRate": 0.5}


def test_defects_and_confidence_filter():
    names = ["scratches", "patches"]
    boxes = [(0, 0.9, (0, 0, 50, 10)), (1, 0.2, (100, 100, 140, 140))]
    out = detector("QUALITY_DEFECT", names, boxes).run(IMG, 0.35)
    assert out.verdict == "FAIL" and out.metrics["defects"] == 1


def test_count_with_class_filter():
    names = ["person", "truck", "box"]
    boxes = [(2, 0.9, (0, 0, 10, 10)), (2, 0.9, (20, 0, 30, 10)), (0, 0.9, (50, 0, 60, 10))]
    out = detector("OBJECT_COUNT", names, boxes, count_classes={"box"}).run(IMG, 0.3)
    assert out.metrics["count"] == 2 and out.metrics["count:box"] == 2
