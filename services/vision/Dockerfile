# syntax=docker/dockerfile:1
FROM python:3.12-slim

# WITH_YOLO=true instala Ultralytics + PyTorch CPU (imagem ~2 GB).
# Padrão: somente OpenCV (imagem ~250 MB), suficiente para o modo heurístico.
ARG WITH_YOLO=false

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt requirements-yolo.txt ./
RUN pip install -r requirements.txt \
    && if [ "$WITH_YOLO" = "true" ]; then \
         pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu && pip install -r requirements-yolo.txt; \
       fi

COPY app ./app
COPY models ./models

RUN useradd --create-home --uid 10001 vision
USER vision

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s CMD curl -fsS http://localhost:8000/health || exit 1
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
