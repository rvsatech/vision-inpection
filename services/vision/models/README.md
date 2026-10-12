# Pesos dos modelos

Coloque aqui os pesos treinados (não versionados no Git):

| Arquivo | Serviço | Como obter |
|---|---|---|
| `ppe.pt` | Conformidade de EPI | `python training/train_yolo.py --task ppe` |
| `defects.pt` | Inspeção de qualidade | `python training/train_yolo.py --task defects` |
| `count.pt` | Contagem de objetos | copie `yolo11n.pt` (COCO) ou treine com suas caixas/paletes |

Sem pesos, o serviço usa automaticamente o pipeline OpenCV (`mode: "heuristic"`).
