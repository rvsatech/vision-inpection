export type Role = 'PLATFORM_ADMIN' | 'OWNER' | 'ADMIN' | 'OPERATOR' | 'VIEWER';
export type ServiceCode = 'QUALITY_DEFECT' | 'PPE_COMPLIANCE' | 'OBJECT_COUNT';
export type AnalysisStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export type Verdict = 'PASS' | 'FAIL' | 'INFO';

export interface User {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: Role;
  status: 'ACTIVE' | 'INACTIVE';
  lastLoginAt?: string | null;
  createdAt?: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Plan {
  id: string;
  code: string;
  name: string;
  description: string;
  priceCents: number;
  currency: string;
  maxUsers: number;
  maxAnalysesPerMonth: number;
  maxStorageMb: number;
  services: ServiceCode[];
  checkoutAvailable?: boolean;
}

export interface AnalysisListItem {
  id: string;
  service: ServiceCode;
  status: AnalysisStatus;
  verdict: Verdict | null;
  headline: string | null;
  originalName: string;
  sizeBytes: number;
  attempts: number;
  queuedAt: string;
  completedAt: string | null;
  createdAt: string;
  requestedBy: { id: string; name: string };
}

export interface DetectionItem {
  label: string;
  confidence: number;
  bbox: { x: number; y: number; w: number; h: number };
  severity?: 'info' | 'warning' | 'critical';
}

export interface InferenceResult {
  mode: 'yolo' | 'heuristic';
  modelVersion: string;
  latencyMs: number;
  image: { width: number; height: number };
  summary: { verdict: Verdict; headline: string; metrics: Record<string, number> };
  detections: DetectionItem[];
}

export interface AnalysisDetail extends AnalysisListItem {
  result: InferenceResult | null;
  failureReason: string | null;
  startedAt: string | null;
  contentType: string;
  imageAvailable: boolean;
}
