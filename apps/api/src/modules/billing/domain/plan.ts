import type { VisionServiceCode } from '../../inspection/domain/vision-service';

export interface Plan {
  id: string;
  code: string;
  name: string;
  description: string;
  priceCents: number;
  currency: string;
  stripePriceId: string | null;
  maxUsers: number;
  maxAnalysesPerMonth: number;
  maxStorageMb: number;
  services: VisionServiceCode[];
  isPublic: boolean;
}

/** -1 significa "ilimitado" (plano Enterprise). */
export const UNLIMITED = -1;
export const withinLimit = (limit: number, value: number) => limit === UNLIMITED || value <= limit;
