import { validation } from '../../../shared/domain/domain-error';

export type TenantStatus = 'ACTIVE' | 'SUSPENDED';

export const SEGMENTS = [
  'Metalurgia',
  'Alimentos e bebidas',
  'Embalagens',
  'Plásticos e borracha',
  'Automotivo',
  'Logística e armazenagem',
  'Química',
  'Outro',
] as const;

export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/** Valida dígitos verificadores do CNPJ (aceita com ou sem máscara). */
export function isValidCnpj(input: string): boolean {
  const d = input.replace(/\D/g, '');
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + Number(d[i]) * w, 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

export function normalizeCompanyName(name: string) {
  const n = name.trim().replace(/\s+/g, ' ');
  if (n.length < 3) throw validation('Nome da empresa muito curto.');
  if (n.length > 120) throw validation('Nome da empresa muito longo.');
  return n;
}

export function normalizeDocument(doc?: string | null) {
  if (!doc) return null;
  if (!isValidCnpj(doc)) throw validation('CNPJ inválido.');
  const d = doc.replace(/\D/g, '');
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}
