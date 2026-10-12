"""Testes do endpoint HTTP + validação do contrato vision.infer.response.v1."""

import json
import shutil

import pytest
from conftest import CONTRACTS
from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator


@pytest.fixture()
def client(tmp_path, monkeypatch):
    from generate_synthetic import generate

    tenant_dir = tmp_path / "tenant-1"
    tenant_dir.mkdir()
    for m in generate(tmp_path / "gen", per_service=1, seed=3):
        shutil.copy(tmp_path / "gen" / m["file"], tenant_dir / m["file"])
    (tenant_dir / "not-an-image.jpg").write_bytes(b"MZ\x90\x00 isto nao e imagem")

    import app.main as main

    monkeypatch.setattr(main, "settings", main.settings.__class__(storage_dir=tmp_path, backend="heuristic"))
    with TestClient(main.app) as c:
        yield c


@pytest.fixture(scope="module")
def response_validator():
    schema = json.loads((CONTRACTS / "schemas" / "vision.infer.response.v1.json").read_text(encoding="utf-8"))
    return Draft202012Validator(schema)


def body(service, key, analysis_id="a-1", **options):
    b = {"analysisId": analysis_id, "service": service, "image": {"storage": "local", "key": key}}
    if options:
        b["options"] = options
    return b


@pytest.mark.parametrize(
    ("service", "file"),
    [("QUALITY_DEFECT", "defect_00.jpg"), ("OBJECT_COUNT", "count_00.jpg"), ("PPE_COMPLIANCE", "ppe_00.jpg")],
)
def test_infer_returns_contract(client, response_validator, service, file):
    r = client.post("/v1/infer", json=body(service, f"tenant-1/{file}", confidenceThreshold=0.3))
    assert r.status_code == 200, r.text
    data = r.json()
    errors = sorted(response_validator.iter_errors(data), key=str)
    assert errors == [], errors
    assert data["mode"] == "heuristic"
    for d in data["detections"]:
        assert 0 <= d["bbox"]["x"] <= 1 and 0 <= d["bbox"]["w"] <= 1


def test_contract_example_is_valid(response_validator):
    example = json.loads((CONTRACTS / "examples" / "vision.infer.response.v1.json").read_text(encoding="utf-8"))
    assert list(response_validator.iter_errors(example)) == []


def test_health_lists_backends(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert set(r.json()["backends"]) == {"QUALITY_DEFECT", "PPE_COMPLIANCE", "OBJECT_COUNT"}


@pytest.mark.parametrize(
    "key",
    ["tenant-1/nao-existe.jpg", "tenant-1/not-an-image.jpg", "../../etc/passwd", "../outside.jpg"],
)
def test_bad_images_are_permanent_422(client, key):
    r = client.post("/v1/infer", json=body("OBJECT_COUNT", key))
    assert r.status_code == 422


def test_unknown_service_rejected(client):
    r = client.post("/v1/infer", json=body("MAGIC", "tenant-1/count_00.jpg"))
    assert r.status_code == 422
