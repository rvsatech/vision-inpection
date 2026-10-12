import type { AnalysisStatus, Role, ServiceCode, Verdict } from './types';

export const SERVICE_LABEL: Record<ServiceCode, string> = {
  QUALITY_DEFECT: 'Inspeção de qualidade',
  PPE_COMPLIANCE: 'Conformidade de EPI',
  OBJECT_COUNT: 'Contagem de objetos',
};

export const SERVICE_SHORT: Record<ServiceCode, string> = {
  QUALITY_DEFECT: 'Qualidade',
  PPE_COMPLIANCE: 'EPI',
  OBJECT_COUNT: 'Contagem',
};

export const ROLE_LABEL: Record<Role, string> = {
  PLATFORM_ADMIN: 'Admin. da plataforma',
  OWNER: 'Proprietário',
  ADMIN: 'Administrador',
  OPERATOR: 'Operador / Inspetor',
  VIEWER: 'Leitura',
};

export const STATUS_LABEL: Record<AnalysisStatus, string> = {
  QUEUED: 'Na fila',
  PROCESSING: 'Processando',
  COMPLETED: 'Concluída',
  FAILED: 'Falhou',
};

export const VERDICT_LABEL: Record<Verdict, string> = { PASS: 'Conforme', FAIL: 'Não conforme', INFO: 'Informativo' };

export const verdictClass = (v: Verdict | null) => (v === 'PASS' ? 'tag tag-pass' : v === 'FAIL' ? 'tag tag-fail' : 'tag tag-info');
export const statusClass = (s: AnalysisStatus) =>
  s === 'FAILED' ? 'tag tag-fail' : s === 'COMPLETED' ? 'tag' : 'tag tag-warn';

const dt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const d = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
export const fmtDateTime = (s?: string | null) => (s ? dt.format(new Date(s)) : '—');
export const fmtDate = (s?: string | null) => (s ? d.format(new Date(s)) : '—');
export const fmtMoney = (cents: number, currency = 'brl') =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(cents / 100);
export const fmtNumber = (n: number) => new Intl.NumberFormat('pt-BR').format(n);
export const fmtLimit = (n: number, unit = '') => (n < 0 ? 'Ilimitado' : `${fmtNumber(n)}${unit}`);
export const fmtBytes = (b: number) => (b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

const DETECTION_LABEL: Record<string, string> = {
  'person:compliant': 'EPI completo',
  'person:no_helmet': 'Sem capacete',
  'person:no_vest': 'Sem colete',
  scratch: 'Risco',
  spot: 'Mancha',
  object: 'Objeto',
};
export const detectionLabel = (l: string) =>
  DETECTION_LABEL[l] ?? (l.startsWith('object_group:') ? `Grupo de ${l.split(':')[1]}` : l.replace(/_/g, ' '));

const METRIC_LABEL: Record<string, string> = {
  persons: 'Colaboradores',
  violations: 'Não conformidades',
  noHelmet: 'Sem capacete',
  noVest: 'Sem colete',
  complianceRate: 'Taxa de conformidade',
  defects: 'Defeitos',
  scratches: 'Riscos',
  spots: 'Manchas',
  affectedAreaPct: 'Área afetada',
  count: 'Total contado',
  groups: 'Grupos encostados',
};
export const metricLabel = (k: string) => METRIC_LABEL[k] ?? k.replace(/^count:/, 'Qtd. ');
export const metricValue = (k: string, v: number) =>
  k === 'complianceRate' ? `${Math.round(v * 100)}%` : k === 'affectedAreaPct' ? `${v.toLocaleString('pt-BR')}%` : fmtNumber(v);

const METRIC_ORDER = ['persons', 'violations', 'noHelmet', 'noVest', 'complianceRate', 'defects', 'scratches', 'spots', 'affectedAreaPct', 'count', 'groups'];
/** O JSONB do Postgres não preserva a ordem das chaves; exibimos numa ordem de leitura fixa. */
export const sortMetrics = (m: Record<string, number>) =>
  Object.entries(m).sort(([a], [b]) => (METRIC_ORDER.indexOf(a) + 1 || 99) - (METRIC_ORDER.indexOf(b) + 1 || 99));
