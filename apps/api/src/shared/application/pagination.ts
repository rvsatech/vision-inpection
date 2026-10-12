export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const normalizePaging = (page?: number, pageSize?: number) => {
  const p = Math.max(1, Math.floor(page ?? 1));
  const s = Math.min(100, Math.max(1, Math.floor(pageSize ?? 20)));
  return { page: p, pageSize: s, skip: (p - 1) * s, take: s };
};
