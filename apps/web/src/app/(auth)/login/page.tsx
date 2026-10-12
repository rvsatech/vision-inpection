'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useState } from 'react';
import { Logo } from '@/components/Logo';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { AuthVisual } from '../AuthVisual';
import styles from '../auth.module.css';

function LoginForm() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace('/app');
  }, [loading, user, router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      router.replace(params.get('next') ?? '/app');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível entrar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <h1 className={styles.title}>Entrar</h1>
      <p className={styles.sub}>Acesse o painel de inspeção da sua empresa.</p>
      {params.get('expired') && <p className="alert alert-info">Sua sessão expirou. Entre novamente.</p>}
      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}
      <div className="field">
        <label htmlFor="email">E-mail</label>
        <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="password">Senha</label>
        <input id="password" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <button className="btn btn-primary btn-lg" disabled={busy || !email || !password}>
        {busy ? 'Entrando…' : 'Entrar'}
      </button>
      <p className={styles.alt}>
        Ainda não tem conta? <Link href="/signup">Teste grátis por 14 dias</Link>
      </p>
      {process.env.NEXT_PUBLIC_DEMO_MODE === 'true' && (
        <p className={styles.demo}>Ambiente de demonstração: carla@horizonte.ind.br / Horizonte@2026</p>
      )}
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className={styles.wrap}>
      <div className={styles.formSide}>
        <Link href="/" aria-label="Voltar ao site">
          <Logo />
        </Link>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
      <AuthVisual />
    </div>
  );
}
