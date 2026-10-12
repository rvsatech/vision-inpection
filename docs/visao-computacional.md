# Visão computacional

## Os três serviços core

| Serviço | Pergunta que responde | Saída | Veredito |
|---|---|---|---|
| **Inspeção de qualidade** (`QUALITY_DEFECT`) | "Esta peça/chapa tem defeito de superfície?" | riscos e manchas com posição, área afetada | `FAIL` se houver defeito, senão `PASS` |
| **Conformidade de EPI** (`PPE_COMPLIANCE`) | "Quem está sem capacete ou colete?" | cada colaborador classificado (completo / sem capacete / sem colete), taxa de conformidade | `FAIL` se houver violação |
| **Contagem de objetos** (`OBJECT_COUNT`) | "Quantas caixas/peças há aqui?" | contagem total, grupos encostados | `INFO` (informativo) |

Por que esses três: são problemas visuais frequentes em pequenas indústrias, com retorno fácil de medir (devolução evitada, acidente evitado, divergência de expedição) e que funcionam com câmeras comuns ou fotos de celular.

> Leitura de etiquetas (OCR, códigos de barras/QR) está no [roadmap](roadmap.md) como quarto serviço.

## Dois backends por serviço

O serviço Python escolhe o backend na inicialização (`VISION_BACKEND=auto`):

| Backend | Quando | Implementação |
|---|---|---|
| `yolo` | existe `models/<serviço>.pt` | Ultralytics YOLO + regras de negócio em `app/detectors/yolo.py` (associação capacete↔pessoa, filtro de classes, severidade) |
| `heuristic` | sem pesos | pipelines OpenCV clássicos em `app/detectors/{defects,ppe,counting}.py` |

Cada resultado informa `mode` e `modelVersion`, exibidos na tela da análise. Isso deixa explícito para o cliente quando um resultado veio de um modelo treinado.

### Pipelines OpenCV (fallback)

- **Defeitos**: CLAHE → estimativa de fundo por mediana larga → resíduo normalizado por MAD (z-score robusto) → limiar + morfologia → componentes conectados → classificação por forma (alongado = risco; compacto = mancha) → fusão de caixas sobrepostas.
- **Contagem**: distância de cor (Lab) até o fundo dominante → Otsu → morfologia → contornos filtrados por área relativa à mediana; blobs ~k vezes maiores contam como k objetos encostados.
- **EPI**: cabeças por cor de pele em YCrCb (faixa ampla, testada com tons de pele claros a muito escuros) + forma circular → cor de capacete acima da cabeça (excluindo a própria pele) → cor de alta visibilidade no tronco.

Limitações honestas: os pipelines clássicos pressupõem cena controlada (câmera fixa, fundo homogêneo, iluminação estável). O de EPI depende de cabeças visíveis e pode confundir fundos com tom de pele. **Para produção, use o backend YOLO treinado** — o heurístico serve para demonstração, desenvolvimento e como fallback.

## Datasets e treino

Lista de datasets públicos sugeridos (com observações de licença) e passo a passo de treino em [`services/vision/training/README.md`](../services/vision/training/README.md). Resumo:

- **Defeitos**: NEU-DET (aço laminado, 6 classes), MVTec AD (não comercial), Severstal (Kaggle).
- **EPI**: Construction Site Safety (Kaggle), Safety Helmet Wearing Dataset, SH17.
- **Contagem**: pesos COCO (`yolo11n.pt`) para objetos genéricos; SKU-110K para itens densos.
- **Rotulagem própria**: Label Studio ou CVAT, exportando em formato YOLO.

O Roboflow não é dependência: conversão VOC → YOLO (`training/voc_to_yolo.py`) e treino (`training/train_yolo.py`) rodam localmente ou no Colab gratuito.

## Dados sintéticos

`scripts/generate_synthetic.py` gera cenas com gabarito (chapas com riscos e manchas, esteiras com caixas, áreas operacionais com colaboradores com/sem EPI em cinco tons de pele). Usos:

1. **Testes automatizados**: o CI exige acurácia mínima (≥ 90% em defeitos e contagem, ≥ 85% em EPI) sobre um conjunto gerado com semente fixa. Uma mudança que piore os detectores quebra o build.
2. **Demonstração**: o seed da API copia essas imagens e os resultados reais do pipeline (`samples/results.json`), então o painel nasce populado e coerente.
3. **Landing**: as imagens e detecções do site são saídas reais do sistema (`scripts/export_web_demo.py`).

Não servem para treinar modelos de produção.

## Contrato

`POST /v1/infer` — schemas em `packages/contracts/schemas/vision.infer.*.v1.json`. Coordenadas das caixas são **normalizadas (0..1)**, independentes da resolução. Erros:

| Status | Significado | Tratamento no worker |
|---|---|---|
| 422 | imagem inexistente, ilegível, grande demais ou serviço desconhecido | falha permanente → DLQ, motivo exibido ao usuário |
| 503 | falha temporária ao baixar a imagem | retry com backoff |
| 5xx/timeout | serviço indisponível | retry com backoff |
