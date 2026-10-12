"""Serviço de visão computacional do Vision Inspect (FastAPI)."""

from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.concurrency import run_in_threadpool

from .config import settings
from .detectors import build_detectors
from .detectors.base import Detector
from .images import ImageError, TransientImageError, fit, load_image
from .schemas import BBox, Detection, ImageInfo, InferRequest, InferResponse, Summary

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("vision")

DEFAULT_CONFIDENCE = 0.35
SERVICE_INFO = {
    "QUALITY_DEFECT": "Detecção de riscos, manchas e falhas de superfície",
    "PPE_COMPLIANCE": "Verificação de capacete e colete de alta visibilidade",
    "OBJECT_COUNT": "Contagem de caixas, peças e paletes",
}

detectors: dict[str, Detector] = {}


@asynccontextmanager
async def lifespan(_: FastAPI):
    detectors.update(build_detectors(settings.backend, settings.models_dir))
    log.info("storage=%s backend=%s", settings.storage_dir, settings.backend)
    yield
    detectors.clear()


app = FastAPI(title="Vision Inspect — Visão Computacional", version="1.0.0", lifespan=lifespan)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "vision", "backends": {k: d.mode for k, d in detectors.items()}}


@app.get("/v1/services")
def services() -> list[dict]:
    return [
        {"code": k, "description": SERVICE_INFO[k], "mode": d.mode, "modelVersion": d.model_version}
        for k, d in detectors.items()
    ]


@app.post("/v1/infer", response_model=InferResponse)
async def infer(req: InferRequest) -> InferResponse:
    detector = detectors.get(req.service)
    if detector is None:
        raise HTTPException(status_code=422, detail=f"serviço desconhecido: {req.service}")
    threshold = (req.options.confidenceThreshold if req.options else None) or DEFAULT_CONFIDENCE
    started = time.perf_counter()
    try:
        img = await run_in_threadpool(
            load_image, req.image, settings.storage_dir, settings.max_image_bytes, settings.download_timeout
        )
    except ImageError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    except TransientImageError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e

    img = fit(img, settings.max_side)
    h, w = img.shape[:2]
    # inferência é CPU-bound: roda fora do event loop
    out = await run_in_threadpool(detector.run, img, threshold)
    latency = (time.perf_counter() - started) * 1000

    detections = [
        Detection(
            label=d.label,
            confidence=round(float(d.confidence), 3),
            severity=d.severity,  # type: ignore[arg-type]
            bbox=BBox(
                x=round(d.box[0] / w, 4), y=round(d.box[1] / h, 4), w=round(d.box[2] / w, 4), h=round(d.box[3] / h, 4)
            ),
        )
        for d in out.detections
    ]
    log.info(
        "analysis=%s service=%s verdict=%s dets=%d %.0fms",
        req.analysisId,
        req.service,
        out.verdict,
        len(detections),
        latency,
    )
    return InferResponse(
        analysisId=req.analysisId,
        service=req.service,
        mode=detector.mode,  # type: ignore[arg-type]
        modelVersion=detector.model_version,
        latencyMs=round(latency, 1),
        image=ImageInfo(width=w, height=h),
        summary=Summary(
            verdict=out.verdict, headline=out.headline, metrics={k: float(v) for k, v in out.metrics.items()}
        ),  # type: ignore[arg-type]
        detections=detections,
    )
