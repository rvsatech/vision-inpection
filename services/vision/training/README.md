# Treino dos modelos de visão

O serviço funciona em dois modos por serviço:

| Modo | Quando | Vantagem | Limite |
|---|---|---|---|
| `heuristic` (OpenCV) | sem pesos em `models/` | zero treino, roda em qualquer CPU, determinístico | só cenas controladas (fundo homogêneo, câmera fixa) |
| `yolo` (Ultralytics) | com `models/<serviço>.pt` | robusto a cenas reais | precisa de dados rotulados e treino |

Recomendação para um cliente real: **começar com câmera fixa + heurístico** para validar o processo
e coletar imagens da própria linha; em paralelo, rotular essas imagens e treinar o YOLO.

## Datasets públicos sugeridos

> **Confira sempre a licença antes de uso comercial.** Vários datasets acadêmicos proíbem uso comercial;
> nesses casos, use-os só para prototipar e treine o modelo final com imagens do cliente.

| Serviço | Dataset | Conteúdo | Observação de licença |
|---|---|---|---|
| Defeitos | **NEU Surface Defect Database (NEU-DET)** | ~1.800 imagens de aço laminado, 6 classes (crazing, inclusion, patches, pitted surface, rolled-in scale, scratches), anotação VOC | uso acadêmico — verifique termos |
| Defeitos | **MVTec AD** | 15 categorias industriais (parafusos, cabos, superfícies), foco em detecção de anomalias | CC BY-NC-SA 4.0 (não comercial) |
| Defeitos | **Severstal: Steel Defect Detection** (Kaggle) | chapas de aço com máscaras de segmentação | regras da competição Kaggle |
| EPI | **Construction Site Safety** (Kaggle) | person, hardhat, no-hardhat, safety vest, no-safety vest… | verifique na página do dataset |
| EPI | **Safety Helmet Wearing Dataset (SHWD)** (GitHub) | capacete × cabeça sem capacete | verifique o repositório |
| EPI | **SH17** | 17 classes de EPI em ambiente de manufatura | verifique termos |
| Contagem | **COCO** (pesos `yolo11n.pt` já treinados) | 80 classes genéricas (pessoas, veículos, garrafas…) | anotações CC BY 4.0 |
| Contagem | **SKU-110K** | produtos densamente empilhados em prateleiras | uso acadêmico — verifique termos |

Para rotular imagens próprias: **Label Studio** ou **CVAT** (ambos open source, exportam em formato YOLO).

## Passo a passo

```bash
cd services/vision
pip install torch --index-url https://download.pytorch.org/whl/cpu   # ou a versão CUDA
pip install -r requirements-yolo.txt

# 1. Converter (se o dataset vier em Pascal VOC)
python training/voc_to_yolo.py --images NEU-DET/IMAGES --annotations NEU-DET/ANNOTATIONS --out datasets/neu-det

# 2. Treinar (transfer learning a partir do yolo11n)
python training/train_yolo.py --task defects --data datasets/neu-det/data.yaml --epochs 100 --imgsz 224

# 3. O melhor peso vai para models/defects.pt → reinicie o serviço
```

Sem GPU local, o Google Colab gratuito é suficiente para treinar modelos `n`/`s` com alguns milhares de imagens.

## Nomes de classes esperados

O pós-processamento (`app/detectors/yolo.py`) reconhece:

- **EPI:** `person`, `helmet`/`hardhat`, `vest`/`safety vest`, e violações explícitas `head`, `no-hardhat`, `no_helmet`, `no-safety vest`, `no_vest`.
- **Defeitos:** qualquer classe conta como defeito (o nome aparece no resultado).
- **Contagem:** todas as classes, ou só as definidas em `VISION_COUNT_CLASSES=box,pallet`.

## Dados sintéticos

`scripts/generate_synthetic.py` gera cenas com gabarito para os 3 serviços. Esses dados alimentam os testes
automatizados (acurácia mínima no CI) e o seed de demonstração. **Não servem para treinar modelos de produção.**
