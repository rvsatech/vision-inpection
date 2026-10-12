/** Catálogo dos 3 serviços core de visão computacional. */
export const VISION_SERVICES = ['QUALITY_DEFECT', 'PPE_COMPLIANCE', 'OBJECT_COUNT'] as const;
export type VisionServiceCode = (typeof VISION_SERVICES)[number];

export const VISION_SERVICE_INFO: Record<VisionServiceCode, { name: string; description: string }> = {
  QUALITY_DEFECT: {
    name: 'Inspeção de qualidade',
    description: 'Detecta riscos, manchas, trincas e falhas de superfície em peças e chapas.',
  },
  PPE_COMPLIANCE: {
    name: 'Conformidade de EPI',
    description: 'Identifica colaboradores sem capacete ou colete em áreas operacionais.',
  },
  OBJECT_COUNT: {
    name: 'Contagem de objetos',
    description: 'Conta peças, caixas e paletes em linha ou estoque a partir de uma imagem.',
  },
};
