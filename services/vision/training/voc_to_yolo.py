"""
Converte anotações Pascal VOC (XML) para o formato YOLO e gera data.yaml.
Útil para NEU-DET e vários datasets de EPI distribuídos em VOC.

    python training/voc_to_yolo.py --images NEU-DET/IMAGES --annotations NEU-DET/ANNOTATIONS --out datasets/neu-det
"""

from __future__ import annotations

import argparse
import random
import shutil
import xml.etree.ElementTree as ET
from pathlib import Path


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--images", required=True)
    ap.add_argument("--annotations", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--val", type=float, default=0.2)
    ap.add_argument("--seed", type=int, default=42)
    a = ap.parse_args()

    images, anns, out = Path(a.images), Path(a.annotations), Path(a.out)
    xmls = sorted(anns.glob("*.xml"))
    classes: list[str] = []
    random.Random(a.seed).shuffle(xmls)
    n_val = int(len(xmls) * a.val)

    for i, xml in enumerate(xmls):
        split = "val" if i < n_val else "train"
        root = ET.parse(xml).getroot()
        fname = root.findtext("filename") or xml.with_suffix(".jpg").name
        src = images / fname
        if not src.exists():
            matches = list(images.glob(xml.stem + ".*"))
            if not matches:
                continue
            src = matches[0]
        w = float(root.findtext("size/width") or 1)
        h = float(root.findtext("size/height") or 1)
        lines = []
        for obj in root.iter("object"):
            name = (obj.findtext("name") or "").strip().lower()
            if name not in classes:
                classes.append(name)
            b = obj.find("bndbox")
            x1, y1, x2, y2 = (float(b.findtext(k)) for k in ("xmin", "ymin", "xmax", "ymax"))
            lines.append(
                f"{classes.index(name)} {(x1 + x2) / 2 / w:.6f} {(y1 + y2) / 2 / h:.6f} {(x2 - x1) / w:.6f} {(y2 - y1) / h:.6f}"
            )
        (out / "images" / split).mkdir(parents=True, exist_ok=True)
        (out / "labels" / split).mkdir(parents=True, exist_ok=True)
        shutil.copy(src, out / "images" / split / src.name)
        (out / "labels" / split / (src.stem + ".txt")).write_text("\n".join(lines), encoding="utf-8")

    names = "\n".join(f"  {i}: {c}" for i, c in enumerate(classes))
    (out / "data.yaml").write_text(
        f"path: {out.resolve()}\ntrain: images/train\nval: images/val\nnames:\n{names}\n", encoding="utf-8"
    )
    print(f"{len(xmls)} anotações convertidas; classes: {classes}")


if __name__ == "__main__":
    main()
