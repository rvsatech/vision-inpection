'use client';

import { useRouter } from 'next/navigation';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, refreshSession, session } from './api';
import type { Role, User } from './types';

type Permission =
  | 'users:read'
  | 'users:write'
  | 'company:write'
  | 'billing:manage'
  | 'analyses:create'
  | 'audit:read'
  | 'platform:manage';

// Espelho das permissões da API (a API é quem decide; aqui só esconde o que não se aplica).
const PERMS: Record<Role, Permission[]> = {
  PLATFORM_ADMIN: ['users:read', 'users:write', 'company:write', 'billing:manage', 'analyses:create', 'audit:read', 'platform:manage'],
  OWNER: ['users:read', 'users:write', 'company:write', 'billing:manage', 'analyses:create', 'audit:read'],
  ADMIN: ['users:read', 'users:write', 'company:write', 'analyses:create', 'audit:read'],
  OPERATOR: ['analyses:create'],
  VIEWER: [],
};

interface AuthState {
  user: User | null;
  loading: boolean;
  can: (p: Permission) => boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (input: Record<string, string>) => Promise<void>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const reload = useCallback(async () => {
    setUser(await api<User>('/auth/me'));
  }, []);

  useEffect(() => {
    session.onLost(() => {
      setUser(null);
      router.replace('/login?expired=1');
    });
    // Restaura a sessão a partir do cookie httpOnly. O cookie "vi_s" (sem segredo) evita
    // uma chamada inútil (e um 401 no console) para visitantes que nunca entraram.
    const hasSession = document.cookie.split('; ').some((c) => c.startsWith('vi_s='));
    (hasSession ? refreshSession() : Promise.resolve(false))
      .then(async (ok) => (ok ? reload() : undefined))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [reload, router]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      can: (p) => !!user && PERMS[user.role].includes(p),
      async login(email, password) {
        const r = await api<{ accessToken: string; user: User }>('/auth/login', { method: 'POST', body: { email, password } });
        session.set(r.accessToken);
        setUser(r.user);
      },
      async signup(input) {
        const r = await api<{ accessToken: string; user: User }>('/signup', { method: 'POST', body: input });
        session.set(r.accessToken);
        setUser(r.user);
      },
      async logout() {
        await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
        session.set(null);
        setUser(null);
        router.replace('/login');
      },
      reload,
    }),
    [user, loading, reload, router],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth fora do AuthProvider');
  return ctx;
}
