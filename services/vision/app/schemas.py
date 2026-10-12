"""Modelos Pydantic espelhando packages/contracts (vision.infer.request/response v1)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

ServiceCode = Literal["QUALITY_DEFECT", "PPE_COMPLIANCE", "OBJECT_COUNT"]
Verdict = Literal["PASS", "FAIL", "INFO"]
Severity = Literal["info", "warning", "critical"]


class ImageRef(BaseModel):
    storage: Literal["local", "supabase"]
    key: str = Field(min_length=1)
    url: str | None = None
    contentType: str | None = None


class InferOptions(BaseModel):
    confidenceThreshold: float | None = Field(default=None, ge=0.0, le=1.0)


class InferRequest(BaseModel):
    analysisId: str
    service: ServiceCode
    image: ImageRef
    options: InferOptions | None = None


class BBox(BaseModel):
    x: float
    y: float
    w: float
    h: float


class Detection(BaseModel):
    label: str
    confidence: float = Field(ge=0.0, le=1.0)
    bbox: BBox
    severity: Severity = "info"


class ImageInfo(BaseModel):
    width: int
    height: int


class Summary(BaseModel):
    verdict: Verdict
    headline: str
    metrics: dict[str, float]


class InferResponse(BaseModel):
    analysisId: str
    service: ServiceCode
    mode: Literal["yolo", "heuristic"]
    modelVersion: str
    latencyMs: float
    image: ImageInfo
    summary: Summary
    detections: list[Detection]
