"""
Gera imagens sintéticas para os 3 serviços core, com gabarito (ground truth).

Uso:
    python scripts/generate_synthetic.py --out samples --per-service 6

Serve para: (1) testes automatizados dos detectores, (2) dados de demonstração do
seed, (3) smoke test do pipeline completo sem depender de datasets externos.
Para treinar modelos de produção, use os datasets públicos listados em training/README.md.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import cv2
import numpy as np

W, H = 960, 640


def _rng(seed: int) -> np.random.Generator:
    return np.random.default_rng(seed)


# ───────────────────────── Defeitos de superfície ─────────────────────────
def metal_surface(rng: np.random.Generator) -> np.ndarray:
    base = rng.normal(0, 1, (H, W)).astype(np.float32)
    brushed = cv2.GaussianBlur(base, (0, 0), sigmaX=25, sigmaY=0.8) * 18
    grain = rng.normal(0, 3.5, (H, W)).astype(np.float32)
    yy, xx = np.mgrid[0:H, 0:W]
    light = 18 * np.cos((xx - W * rng.uniform(0.3, 0.7)) / W * math.pi) + 6 * (yy / H)
    img = np.clip(150 + brushed + grain + light, 0, 255).astype(np.uint8)
    return cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)


def draw_defects(img: np.ndarray, rng: np.random.Generator, n_scratch: int, n_spot: int) -> list[dict]:
    truth = []
    for _ in range(n_scratch):
        x1, y1 = int(rng.uniform(80, W - 80)), int(rng.uniform(80, H - 80))
        ang, length = rng.uniform(0, math.pi), rng.uniform(140, 300)
        x2 = int(np.clip(x1 + math.cos(ang) * length, 20, W - 20))
        y2 = int(np.clip(y1 + math.sin(ang) * length, 20, H - 20))
        cv2.line(img, (x1, y1), (x2, y2), (88, 88, 92), 3, cv2.LINE_AA)
        cv2.line(img, (x1 + 1, y1 + 2), (x2 + 1, y2 + 2), (190, 190, 192), 1, cv2.LINE_AA)
        truth.append({"label": "scratch", "box": [min(x1, x2), min(y1, y2), abs(x2 - x1) + 1, abs(y2 - y1) + 1]})
    for _ in range(n_spot):
        cx, cy = int(rng.uniform(60, W - 60)), int(rng.uniform(60, H - 60))
        rx, ry = int(rng.uniform(9, 22)), int(rng.uniform(8, 18))
        overlay = img.copy()
        cv2.ellipse(overlay, (cx, cy), (rx, ry), rng.uniform(0, 180), 0, 360, (70, 74, 82), -1, cv2.LINE_AA)
        img[:] = cv2.addWeighted(overlay, 0.85, img, 0.15, 0)
        truth.append({"label": "spot", "box": [cx - rx, cy - ry, 2 * rx, 2 * ry]})
    return truth


# ───────────────────────── Contagem de caixas ─────────────────────────
def conveyor(rng: np.random.Generator) -> np.ndarray:
    img = np.full((H, W, 3), (58, 60, 62), np.uint8)
    img += rng.integers(0, 6, (H, W, 3), dtype=np.uint8)
    for x in range(0, W, 48):  # roletes da esteira
        cv2.line(img, (x, 0), (x, H), (48, 50, 52), 2)
    cv2.rectangle(img, (0, 0), (W, 28), (140, 145, 150), -1)
    cv2.rectangle(img, (0, H - 28), (W, H), (140, 145, 150), -1)
    return img


def draw_boxes(img: np.ndarray, rng: np.random.Generator, n: int) -> list[dict]:
    cols, rows = 6, 3
    cells = rng.permutation(cols * rows)[:n]
    truth = []
    cw, ch = (W - 60) / cols, (H - 120) / rows
    for c in cells:
        gx, gy = c % cols, c // cols
        bw, bh = int(rng.uniform(0.62, 0.78) * cw), int(rng.uniform(0.6, 0.78) * ch)
        x = int(30 + gx * cw + rng.uniform(0, cw - bw))
        y = int(60 + gy * ch + rng.uniform(0, ch - bh))
        tone = rng.uniform(0.85, 1.1)
        color = tuple(int(v * tone) for v in (70, 125, 175))  # papelão (BGR)
        cv2.rectangle(img, (x, y), (x + bw, y + bh), color, -1)
        cv2.rectangle(img, (x, y), (x + bw, y + bh), tuple(int(v * 0.7) for v in color), 2)
        cv2.rectangle(img, (x + bw // 2 - 6, y), (x + bw // 2 + 6, y + bh), (150, 190, 215), -1)  # fita
        truth.append({"label": "box", "box": [x, y, bw, bh]})
    return truth


# ───────────────────────── EPI ─────────────────────────
SKIN = [(125, 194, 241), (105, 172, 224), (66, 134, 198), (36, 85, 141), (40, 60, 90)]  # BGR, tons variados
HELMETS = [(0, 220, 255), (245, 245, 245), (0, 140, 255), (200, 120, 20)]
VESTS = [(0, 255, 200), (0, 120, 255)]


def factory_floor(rng: np.random.Generator) -> np.ndarray:
    img = np.zeros((H, W, 3), np.uint8)
    img[: H // 2] = (120, 110, 100)  # parede cinza-azulada
    img[H // 2 :] = (95, 98, 100)  # piso
    img += rng.integers(0, 8, (H, W, 3), dtype=np.uint8)
    cv2.rectangle(img, (40, 120), (260, 330), (110, 80, 50), -1)  # máquina
    cv2.rectangle(img, (700, 90), (920, 330), (60, 90, 60), -1)
    cv2.line(img, (0, H - 60), (W, H - 60), (0, 200, 230), 6)  # faixa de segurança
    return img


def draw_worker(img, cx: int, base_y: int, scale: float, skin, helmet, vest) -> dict:
    head_r = int(22 * scale)
    torso_h, torso_w = int(120 * scale), int(70 * scale)
    leg_h = int(130 * scale)
    head_c = (cx, base_y - leg_h - torso_h - head_r - int(4 * scale))
    # pernas e tronco (uniforme azul-marinho)
    cv2.rectangle(img, (cx - torso_w // 2 + 6, base_y - leg_h), (cx - 4, base_y), (70, 40, 30), -1)
    cv2.rectangle(img, (cx + 4, base_y - leg_h), (cx + torso_w // 2 - 6, base_y), (70, 40, 30), -1)
    cv2.rectangle(
        img, (cx - torso_w // 2, base_y - leg_h - torso_h), (cx + torso_w // 2, base_y - leg_h), (90, 50, 35), -1
    )
    if vest is not None:
        top = base_y - leg_h - torso_h + int(8 * scale)
        cv2.rectangle(
            img, (cx - torso_w // 2 + 3, top), (cx + torso_w // 2 - 3, base_y - leg_h - int(10 * scale)), vest, -1
        )
        for k in (0.45, 0.7):
            yy = int(top + (torso_h - 18 * scale) * k)
            cv2.rectangle(
                img, (cx - torso_w // 2 + 3, yy), (cx + torso_w // 2 - 3, yy + int(6 * scale)), (200, 200, 200), -1
            )
    cv2.circle(img, head_c, head_r, skin, -1, cv2.LINE_AA)
    if helmet is not None:
        cv2.ellipse(
            img,
            (head_c[0], head_c[1] - int(4 * scale)),
            (head_r + int(5 * scale), head_r + int(2 * scale)),
            0,
            180,
            360,
            helmet,
            -1,
            cv2.LINE_AA,
        )
        cv2.rectangle(
            img,
            (head_c[0] - head_r - int(8 * scale), head_c[1] - int(6 * scale)),
            (head_c[0] + head_r + int(8 * scale), head_c[1] - int(2 * scale)),
            helmet,
            -1,
        )
    else:
        cv2.ellipse(
            img,
            (head_c[0], head_c[1] - int(6 * scale)),
            (head_r, int(head_r * 0.6)),
            0,
            180,
            360,
            (25, 25, 30),
            -1,
            cv2.LINE_AA,
        )
    top_y = head_c[1] - head_r - int(10 * scale)
    return {
        "label": "person",
        "helmet": helmet is not None,
        "vest": vest is not None,
        "box": [cx - torso_w // 2, top_y, torso_w, base_y - top_y],
    }


def draw_workers(img, rng: np.random.Generator, n: int, no_helmet: int, no_vest: int) -> list[dict]:
    xs = np.linspace(170, W - 170, n).astype(int)
    truth = []
    flags = list(range(n))
    rng.shuffle(flags)
    missing_helmet, missing_vest = set(flags[:no_helmet]), set(flags[no_helmet : no_helmet + no_vest])
    for i, cx in enumerate(xs):
        scale = rng.uniform(0.85, 1.05)
        skin = SKIN[int(rng.integers(0, len(SKIN)))]
        helmet = None if i in missing_helmet else HELMETS[int(rng.integers(0, len(HELMETS)))]
        vest = None if i in missing_vest else VESTS[int(rng.integers(0, len(VESTS)))]
        truth.append(
            draw_worker(
                img, int(cx + rng.uniform(-30, 30)), int(H - 40 - rng.uniform(0, 30)), scale, skin, helmet, vest
            )
        )
    return truth


# ───────────────────────── Geração ─────────────────────────
def generate(out: Path, per_service: int, seed: int = 7) -> list[dict]:
    out.mkdir(parents=True, exist_ok=True)
    manifest: list[dict] = []
    rng = _rng(seed)
    for i in range(per_service):
        img = metal_surface(rng)
        # metade das peças sem defeito, metade com — base equilibrada para testes e demo
        n_scratch, n_spot = (0, 0) if i % 2 == 1 else (int(rng.integers(0, 3)), int(rng.integers(1, 3)))
        truth = draw_defects(img, rng, n_scratch, n_spot)
        name = f"defect_{i:02d}.jpg"
        cv2.imwrite(str(out / name), img, [cv2.IMWRITE_JPEG_QUALITY, 88])
        manifest.append(
            {"file": name, "service": "QUALITY_DEFECT", "expected": {"defects": len(truth)}, "truth": truth}
        )

        img = conveyor(rng)
        n = int(rng.integers(5, 16))
        truth = draw_boxes(img, rng, n)
        name = f"count_{i:02d}.jpg"
        cv2.imwrite(str(out / name), img, [cv2.IMWRITE_JPEG_QUALITY, 88])
        manifest.append({"file": name, "service": "OBJECT_COUNT", "expected": {"count": n}, "truth": truth})

        img = factory_floor(rng)
        n = int(rng.integers(2, 5))
        compliant = i % 2 == 1
        nh = 0 if compliant else int(rng.integers(1, n))
        nv = 0 if compliant else (int(rng.integers(0, 2)) if n - nh > 1 else 0)
        truth = draw_workers(img, rng, n, nh, nv)
        name = f"ppe_{i:02d}.jpg"
        cv2.imwrite(str(out / name), img, [cv2.IMWRITE_JPEG_QUALITY, 88])
        manifest.append(
            {
                "file": name,
                "service": "PPE_COMPLIANCE",
                "expected": {"persons": n, "noHelmet": nh, "noVest": nv},
                "truth": truth,
            }
        )
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "samples"))
    ap.add_argument("--per-service", type=int, default=6)
    ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args()
    m = generate(Path(a.out), a.per_service, a.seed)
    print(f"{len(m)} imagens geradas em {a.out}")
