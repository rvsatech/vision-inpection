import type { DetectionItem, ServiceCode, Verdict } from './types';

/** Gerado por services/vision/scripts/export_web_demo.py — resultados reais do pipeline de visão. */
export const DEMO: Record<string, { service: ServiceCode; headline: string; verdict: Verdict; metrics: Record<string, number>; detections: DetectionItem[] }> = {
  "ppe_hero.jpg": {
    "service": "PPE_COMPLIANCE",
    "headline": "1 sem capacete e 1 sem colete — 4 colaboradores na cena",
    "verdict": "FAIL",
    "metrics": {
      "persons": 4.0,
      "violations": 2.0,
      "noHelmet": 1.0,
      "noVest": 1.0,
      "complianceRate": 0.5
    },
    "detections": [
      {
        "label": "person:no_vest",
        "confidence": 0.904,
        "severity": "warning",
        "bbox": {
          "x": 0.1177,
          "y": 0.475,
          "w": 0.0896,
          "h": 0.4766
        }
      },
      {
        "label": "person:compliant",
        "confidence": 0.877,
        "severity": "info",
        "bbox": {
          "x": 0.5437,
          "y": 0.4578,
          "w": 0.0938,
          "h": 0.5
        }
      },
      {
        "label": "person:compliant",
        "confidence": 0.897,
        "severity": "info",
        "bbox": {
          "x": 0.3406,
          "y": 0.4484,
          "w": 0.0979,
          "h": 0.5234
        }
      },
      {
        "label": "person:no_helmet",
        "confidence": 0.938,
        "severity": "critical",
        "bbox": {
          "x": 0.7531,
          "y": 0.45,
          "w": 0.0854,
          "h": 0.4656
        }
      }
    ]
  },
  "defect_00.jpg": {
    "service": "QUALITY_DEFECT",
    "headline": "3 defeitos encontrados (2 riscos, 1 mancha)",
    "verdict": "FAIL",
    "metrics": {
      "defects": 3.0,
      "scratches": 2.0,
      "spots": 1.0,
      "affectedAreaPct": 5.75
    },
    "detections": [
      {
        "label": "scratch",
        "confidence": 1.0,
        "severity": "critical",
        "bbox": {
          "x": 0.601,
          "y": 0.4578,
          "w": 0.1396,
          "h": 0.3625
        }
      },
      {
        "label": "scratch",
        "confidence": 1.0,
        "severity": "critical",
        "bbox": {
          "x": 0.5354,
          "y": 0.3969,
          "w": 0.2271,
          "h": 0.0234
        }
      },
      {
        "label": "spot",
        "confidence": 1.0,
        "severity": "warning",
        "bbox": {
          "x": 0.75,
          "y": 0.6734,
          "w": 0.0385,
          "h": 0.0422
        }
      }
    ]
  },
  "count_03.jpg": {
    "service": "OBJECT_COUNT",
    "headline": "14 objetos contados",
    "verdict": "INFO",
    "metrics": {
      "count": 14.0,
      "groups": 0.0
    },
    "detections": [
      {
        "label": "object",
        "confidence": 0.933,
        "severity": "info",
        "bbox": {
          "x": 0.85,
          "y": 0.7047,
          "w": 0.1031,
          "h": 0.175
        }
      },
      {
        "label": "object",
        "confidence": 0.923,
        "severity": "info",
        "bbox": {
          "x": 0.5427,
          "y": 0.7,
          "w": 0.1073,
          "h": 0.1969
        }
      },
      {
        "label": "object",
        "confidence": 0.921,
        "severity": "info",
        "bbox": {
          "x": 0.0552,
          "y": 0.6906,
          "w": 0.0958,
          "h": 0.1781
        }
      },
      {
        "label": "object",
        "confidence": 0.907,
        "severity": "info",
        "bbox": {
          "x": 0.3802,
          "y": 0.6828,
          "w": 0.0938,
          "h": 0.1703
        }
      },
      {
        "label": "object",
        "confidence": 0.929,
        "severity": "info",
        "bbox": {
          "x": 0.6719,
          "y": 0.6734,
          "w": 0.1104,
          "h": 0.1766
        }
      },
      {
        "label": "object",
        "confidence": 0.934,
        "severity": "info",
        "bbox": {
          "x": 0.0385,
          "y": 0.4172,
          "w": 0.101,
          "h": 0.1875
        }
      },
      {
        "label": "object",
        "confidence": 0.923,
        "severity": "info",
        "bbox": {
          "x": 0.5115,
          "y": 0.3922,
          "w": 0.1094,
          "h": 0.1859
        }
      },
      {
        "label": "object",
        "confidence": 0.929,
        "severity": "info",
        "bbox": {
          "x": 0.374,
          "y": 0.3719,
          "w": 0.0979,
          "h": 0.1766
        }
      },
      {
        "label": "object",
        "confidence": 0.916,
        "severity": "info",
        "bbox": {
          "x": 0.8375,
          "y": 0.3641,
          "w": 0.1104,
          "h": 0.1969
        }
      },
      {
        "label": "object",
        "confidence": 0.918,
        "severity": "info",
        "bbox": {
          "x": 0.0427,
          "y": 0.1844,
          "w": 0.1052,
          "h": 0.1719
        }
      },
      {
        "label": "object",
        "confidence": 0.929,
        "severity": "info",
        "bbox": {
          "x": 0.2135,
          "y": 0.1656,
          "w": 0.1146,
          "h": 0.1672
        }
      },
      {
        "label": "object",
        "confidence": 0.929,
        "severity": "info",
        "bbox": {
          "x": 0.6573,
          "y": 0.1391,
          "w": 0.1021,
          "h": 0.1797
        }
      },
      {
        "label": "object",
        "confidence": 0.918,
        "severity": "info",
        "bbox": {
          "x": 0.501,
          "y": 0.1234,
          "w": 0.0958,
          "h": 0.1734
        }
      },
      {
        "label": "object",
        "confidence": 0.909,
        "severity": "info",
        "bbox": {
          "x": 0.3552,
          "y": 0.1016,
          "w": 0.1187,
          "h": 0.1938
        }
      }
    ]
  }
};
