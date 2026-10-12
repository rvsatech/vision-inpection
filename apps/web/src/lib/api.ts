/**
 * Cliente HTTP do app. Fala sempre com /api/* (mesma origem — o Next repassa
 * para a API). O access token fica só em memória; o refresh token vive em
 * cookie httpOnly que o JavaScript não consegue ler.
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
let onSessionLost: (() => void) | null = null;

export const session = {
  set(token: string | null) {
    accessToken = token;
  },
  get() {
    return accessToken;
  },
  onLost(fn: () => void) {
    onSessionLost = fn;
  },
};

/** Renova o access token usando o cookie. Requisições simultâneas compartilham a mesma renovação. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' })
    .then(async (r) => {
      if (!r.ok) return false;
      const body = (await r.json()) as { accessToken: string };
      accessToken = body.accessToken;
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

async function parseError(res: Response): Promise<ApiError> {
  let body: { message?: string; code?: string; details?: Record<string, unknown> } = {};
  try {
    body = await res.json();
  } catch {
    /* corpo vazio */
  }
  const fallback = res.status >= 500 ? 'O servidor não respondeu como esperado. Tente novamente em instantes.' : 'Não foi possível concluir a operação.';
  return new ApiError(res.status, body.code ?? String(res.status), body.message ?? fallback, body.details);
}

type Options = Omit<RequestInit, 'body'> & { body?: unknown; raw?: boolean };

export async function api<T = unknown>(path: string, opts: Options = {}, retry = true): Promise<T> {
  const headers = new Headers(opts.headers);
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) body = opts.body;
  else if (opts.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(opts.body);
  }
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...opts, headers, body, credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Sem conexão com o servidor. Verifique sua internet.');
  }

  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    if (await refreshSession()) return api<T>(path, opts, false);
    accessToken = null;
    onSessionLost?.();
  }
  if (!res.ok) throw await parseError(res);
  if (opts.raw) return res as unknown as T;
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Baixa um binário autenticado (ex.: imagem da análise) como object URL. */
export async function fetchBlobUrl(path: string): Promise<string> {
  const res = await api<Response>(path, { raw: true });
  return URL.createObjectURL(await res.blob());
}
