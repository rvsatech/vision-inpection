"""Carrega a imagem da análise (storage local compartilhado ou URL assinada)."""

from __future__ import annotations

from pathlib import Path
from urllib.parse import urlparse

import cv2
import httpx
import numpy as np

from .schemas import ImageRef


class ImageError(Exception):
    """Imagem inexistente, ilegível ou fora dos limites → HTTP 422 (falha permanente)."""


class TransientImageError(Exception):
    """Falha temporária ao baixar a imagem → HTTP 503 (o worker tenta de novo)."""


def load_image(ref: ImageRef, storage_dir: Path, max_bytes: int, timeout: float) -> np.ndarray:
    data = _read_remote(ref.url, max_bytes, timeout) if ref.url else _read_local(ref.key, storage_dir, max_bytes)
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise ImageError("arquivo não é uma imagem válida")
    return img


def _read_local(key: str, storage_dir: Path, max_bytes: int) -> bytes:
    root = storage_dir.resolve()
    path = (root / key).resolve()
    if root not in path.parents:
        raise ImageError("chave de imagem inválida")
    if not path.is_file():
        raise ImageError(f"imagem não encontrada no storage: {key}")
    if path.stat().st_size > max_bytes:
        raise ImageError("imagem excede o tamanho máximo")
    return path.read_bytes()


def _read_remote(url: str, max_bytes: int, timeout: float) -> bytes:
    if urlparse(url).scheme not in {"https", "http"}:
        raise ImageError("URL de imagem inválida")
    try:
        with httpx.stream("GET", url, timeout=timeout, follow_redirects=False) as r:
            if r.status_code in (404, 400, 403):
                raise ImageError(f"imagem indisponível (HTTP {r.status_code})")
            if r.status_code >= 300:
                raise TransientImageError(f"falha ao baixar imagem (HTTP {r.status_code})")
            buf = bytearray()
            for chunk in r.iter_bytes():
                buf.extend(chunk)
                if len(buf) > max_bytes:
                    raise ImageError("imagem excede o tamanho máximo")
            return bytes(buf)
    except httpx.HTTPError as e:
        raise TransientImageError(f"falha de rede ao baixar imagem: {e}") from e


def fit(img: np.ndarray, max_side: int) -> np.ndarray:
    """Reduz imagens grandes (as coordenadas de saída são normalizadas, então não muda o resultado)."""
    h, w = img.shape[:2]
    s = max(h, w)
    if s <= max_side:
        return img
    k = max_side / s
    return cv2.resize(img, (int(w * k), int(h * k)), interpolation=cv2.INTER_AREA)
