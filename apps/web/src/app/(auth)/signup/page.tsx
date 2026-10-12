'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useState } from 'react';
import { Logo } from '@/components/Logo';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { AuthVisual } from '../AuthVisual';
import styles from '../auth.module.css';

const PLAN_NAMES: Record<string, string> = { STARTER: 'Essencial', PRO: 'Profissional' };

function SignupForm() {
  const { signup } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const plan = PLAN_NAMES[params.get('plan') ?? ''] ? params.get('plan')! : 'PRO';
  const [segments, setSegments] = useState<string[]>([]);
  const [form, setForm] = useState({ companyName: '', document: '', segment: '', ownerName: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<string[]>('/segments').then(setSegments).catch(() => undefined);
  }, []);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, string> = { ...form, planCode: plan };
      if (!body.document) delete body.document;
      if (!body.segment) delete body.segment;
      await signup(body);
      router.replace('/app?welcome=1');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível criar a conta.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <h1 className={styles.title}>Criar conta de teste</h1>
      <p className={styles.sub}>14 dias do plano {PLAN_NAMES[plan]}, sem cartão de crédito.</p>
      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}
      <div className="field">
        <label htmlFor="companyName">Empresa</label>
        <input id="companyName" className="input" required minLength={3} value={form.companyName} onChange={set('companyName')} autoComplete="organization" />
      </div>
      <div className={styles.row}>
        <div className="field">
          <label htmlFor="document">CNPJ (opcional)</label>
          <input id="document" className="input" inputMode="numeric" value={form.document} onChange={set('document')} placeholder="00.000.000/0000-00" />
        </div>
        <div className="field">
          <label htmlFor="segment">Segmento</label>
          <select id="segment" className="select" value={form.segment} onChange={set('segment')}>
            <option value="">Selecione</option>
            {segments.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="ownerName">Seu nome</label>
        <input id="ownerName" className="input" required minLength={2} value={form.ownerName} onChange={set('ownerName')} autoComplete="name" />
      </div>
      <div className="field">
        <label htmlFor="email">E-mail corporativo</label>
        <input id="email" className="input" type="email" required value={form.email} onChange={set('email')} autoComplete="email" />
      </div>
      <div className="field">
        <label htmlFor="password">Senha</label>
        <input id="password" className="input" type="password" required minLength={10} value={form.password} onChange={set('password')} autoComplete="new-password" />
        <span className="hint">Mínimo de 10 caracteres, com letras e números.</span>
      </div>
      <button className="btn btn-primary btn-lg" disabled={busy}>
        {busy ? 'Criando conta…' : 'Criar conta e entrar'}
      </button>
      <p className={styles.alt}>
        Já tem conta? <Link href="/login">Entrar</Link>
      </p>
    </form>
  );
}

export default function SignupPage() {
  return (
    <div className={styles.wrap}>
      <div className={styles.formSide}>
        <Link href="/" aria-label="Voltar ao site">
          <Logo />
        </Link>
        <Suspense>
          <SignupForm />
        </Suspense>
      </div>
      <AuthVisual />
    </div>
  );
}
