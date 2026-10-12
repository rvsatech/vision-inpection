"""
Treino de modelos YOLO (Ultralytics) para os serviços core.

Exemplos:
    # EPI com o dataset "Construction Site Safety" convertido para YOLO
    python training/train_yolo.py --task ppe --data datasets/ppe/data.yaml --epochs 60

    # Defeitos de superfície com NEU-DET (após training/voc_to_yolo.py)
    python training/train_yolo.py --task defects --data datasets/neu-det/data.yaml --epochs 100 --imgsz 224

O melhor checkpoint é copiado para models/<arquivo>.pt e passa a ser usado
automaticamente pelo serviço (VISION_BACKEND=auto).
Requer: pip install -r requirements-yolo.txt (PyTorch). GPU recomendada; em CPU use --epochs baixo.
"""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGET = {"ppe": "ppe.pt", "defects": "defects.pt", "count": "count.pt"}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--task", choices=TARGET, required=True)
    ap.add_argument("--data", required=True, help="data.yaml no formato Ultralytics")
    ap.add_argument("--model", default="yolo11n.pt", help="checkpoint base (transfer learning)")
    ap.add_argument("--epochs", type=int, default=50)
    ap.add_argument("--imgsz", type=int, default=640)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--device", default=None, help="ex.: 0 (GPU) ou cpu")
    a = ap.parse_args()

    from ultralytics import YOLO

    model = YOLO(a.model)
    results = model.train(
        data=a.data,
        epochs=a.epochs,
        imgsz=a.imgsz,
        batch=a.batch,
        device=a.device,
        project=str(ROOT / "runs"),
        name=a.task,
        exist_ok=True,
        patience=20,
    )
    best = Path(results.save_dir) / "weights" / "best.pt"
    metrics = YOLO(str(best)).val(data=a.data, imgsz=a.imgsz)
    dest = ROOT / "models" / TARGET[a.task]
    shutil.copy(best, dest)
    print(f"\nmAP50={metrics.box.map50:.3f}  mAP50-95={metrics.box.map:.3f}")
    print(f"Pesos copiados para {dest}. Reinicie o serviço de visão para carregar.")


if __name__ == "__main__":
    main()
