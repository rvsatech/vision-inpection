"""Configuração via variáveis de ambiente."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class Settings:
    storage_dir: Path = field(
        default_factory=lambda: Path(os.getenv("VISION_STORAGE_DIR", BASE_DIR / ".." / ".." / "storage")).resolve()
    )
    models_dir: Path = field(
        default_factory=lambda: Path(os.getenv("VISION_MODELS_DIR", BASE_DIR / "models")).resolve()
    )
    # auto: YOLO quando houver pesos treinados; heuristic: força OpenCV; yolo: exige pesos.
    backend: str = field(default_factory=lambda: os.getenv("VISION_BACKEND", "auto"))
    max_image_bytes: int = field(default_factory=lambda: int(os.getenv("VISION_MAX_IMAGE_MB", "15")) * 1024 * 1024)
    max_side: int = field(default_factory=lambda: int(os.getenv("VISION_MAX_SIDE", "1600")))
    download_timeout: float = field(default_factory=lambda: float(os.getenv("VISION_DOWNLOAD_TIMEOUT", "15")))


settings = Settings()
