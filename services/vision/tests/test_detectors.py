"""Acurácia dos detectores heurísticos sobre dados sintéticos com gabarito."""

import cv2
import pytest
from generate_synthetic import generate

from app.detectors.counting import ObjectCountHeuristic
from app.detectors.defects import QualityDefectHeuristic
from app.detectors.ppe import PpeHeuristic


@pytest.fixture(scope="module")
def dataset(tmp_path_factory):
    out = tmp_path_factory.mktemp("synthetic")
    return out, generate(out, per_service=20, seed=101)


def _accuracy(dataset, service, detector, check):
    out, manifest = dataset
    items = [m for m in manifest if m["service"] == service]
    hits = sum(check(detector.run(cv2.imread(str(out / m["file"])), 0.0), m["expected"]) for m in items)
    return hits / len(items)


def test_quality_defect_detection(dataset):
    acc = _accuracy(
        dataset,
        "QUALITY_DEFECT",
        QualityDefectHeuristic(),
        lambda o, e: (o.verdict == "FAIL") == (e["defects"] > 0) and abs(o.metrics["defects"] - e["defects"]) <= 1,
    )
    assert acc >= 0.9


def test_object_count_exact(dataset):
    acc = _accuracy(dataset, "OBJECT_COUNT", ObjectCountHeuristic(), lambda o, e: o.metrics["count"] == e["count"])
    assert acc >= 0.9


def test_ppe_compliance(dataset):
    acc = _accuracy(
        dataset,
        "PPE_COMPLIANCE",
        PpeHeuristic(),
        lambda o, e: o.metrics["persons"] == e["persons"] and o.metrics["noHelmet"] == e["noHelmet"],
    )
    assert acc >= 0.85


def test_ppe_handles_diverse_skin_tones():
    """Cada tom de pele do gerador deve ser detectado como pessoa."""
    import numpy as np
    from generate_synthetic import SKIN, draw_worker, factory_floor

    for tone in SKIN:
        img = factory_floor(np.random.default_rng(1))
        draw_worker(img, 480, 600, 1.0, tone, (0, 220, 255), (0, 255, 200))
        out = PpeHeuristic().run(img, 0.0)
        assert out.metrics["persons"] == 1, f"tom {tone} não detectado"
        assert out.verdict == "PASS"


def test_clean_surface_passes():
    import numpy as np
    from generate_synthetic import metal_surface

    out = QualityDefectHeuristic().run(metal_surface(np.random.default_rng(5)), 0.35)
    assert out.verdict == "PASS" and out.detections == []
