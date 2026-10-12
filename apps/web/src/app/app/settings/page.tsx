'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/app/AppShell';
import ui from '@/components/app/ui.module.css';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDateTime } from '@/lib/format';

interface Company {
  name: string;
  document: string | null;
  segment: string | null;
}
interface Session {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastUsedAt: string;
}

const describeAgent = (ua: string | null) => {
  if (!ua) return 'Dispositivo desconhecido';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} no ${os}` : browser;
};

export default function SettingsPage() {
  const { can, logout } = useAuth();
  const [company, setCompany] = useState<Company | null>(null);
  const [segments, setSegments] = useState<string[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [msg, setMsg] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const [pwd, setPwd] = useState({ currentPassword: '', newPassword: '' });

  const loadSessions = useCallback(() => {
    api<Session[]>('/auth/sessions').then(setSessions).catch(() => undefined);
  }, []);

  useEffect(() => {
    api<Company>('/company').then(setCompany).catch(() => undefined);
    api<string[]>('/segments').then(setSegments).catch(() => undefined);
    loadSessions();
  }, [loadSessions]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try {
      await fn();
      setMsg({ kind: 'info', text: ok });
    } catch (e) {
      setMsg({ kind: 'error', text: (e as ApiError).message });
    }
  };

  function saveCompany(e: FormEvent) {
    e.preventDefault();
    if (!company) return;
    const body: Record<string, string> = { name: company.name };
    if (company.document) body.document = company.document;
    if (company.segment) body.segment = company.segment;
    run(async () => setCompany(await api<Company>('/company', { method: 'PATCH', body })), 'Dados da empresa salvos.');
  }

  function changePassword(e: FormEvent) {
    e.preventDefault();
    run(async () => {
      await api('/auth/password', { method: 'POST', body: pwd });
      await logout();
    }, 'Senha alterada. Entre novamente com a nova senha.');
  }

  return (
    <>
      <PageHeader title="Configurações" description="Dados da empresa, sua senha e os dispositivos conectados à sua conta." />
      {msg && (
        <p className={`alert ${msg.kind === 'error' ? 'alert-error' : 'alert-info'}`} role="status" style={{ marginBottom: 16 }}>
          {msg.text}
        </p>
      )}
      <div className={ui.grid2}>
        {company && (
          <form className={ui.panel} onSubmit={saveCompany}>
            <div className={ui.panelHead}>
              <h2 className={ui.panelTitle}>Empresa</h2>
            </div>
            <fieldset disabled={!can('company:write')} className={`${ui.panelBody} ${ui.formGrid}`} style={{ border: 0, margin: 0 }}>
              <div className="field">
                <label htmlFor="c-name">Razão social ou nome</label>
                <input id="c-name" className="input" value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="c-doc">CNPJ</label>
                <input id="c-doc" className="input" value={company.document ?? ''} onChange={(e) => setCompany({ ...company, document: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="c-seg">Segmento</label>
                <select id="c-seg" className="select" value={company.segment ?? ''} onChange={(e) => setCompany({ ...company, segment: e.target.value })}>
                  <option value="">Não informado</option>
                  {segments.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
              {can('company:write') && (
                <div>
                  <button className="btn btn-primary">Salvar empresa</button>
                </div>
              )}
            </fieldset>
          </form>
        )}

        <form className={ui.panel} onSubmit={changePassword}>
          <div className={ui.panelHead}>
            <h2 className={ui.panelTitle}>Senha</h2>
          </div>
          <div className={`${ui.panelBody} ${ui.formGrid}`}>
            <div className="field">
              <label htmlFor="p-cur">Senha atual</label>
              <input id="p-cur" className="input" type="password" autoComplete="current-password" required value={pwd.currentPassword} onChange={(e) => setPwd({ ...pwd, currentPassword: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="p-new">Nova senha</label>
              <input id="p-new" className="input" type="password" autoComplete="new-password" required minLength={10} value={pwd.newPassword} onChange={(e) => setPwd({ ...pwd, newPassword: e.target.value })} />
              <span className="hint">Ao trocar a senha, todas as sessões são encerradas.</span>
            </div>
            <div>
              <button className="btn btn-primary">Trocar senha</button>
            </div>
          </div>
        </form>
      </div>

      <section className={ui.panel} style={{ marginTop: 20 }}>
        <div className={ui.panelHead}>
          <h2 className={ui.panelTitle}>Sessões ativas</h2>
        </div>
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Dispositivo</th>
                <th>IP</th>
                <th>Iniciada em</th>
                <th>Último uso</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td>{describeAgent(s.userAgent)}</td>
                  <td className={ui.muted}>{s.ip ?? '—'}</td>
                  <td className={ui.muted}>{fmtDateTime(s.createdAt)}</td>
                  <td className={ui.muted}>{fmtDateTime(s.lastUsedAt)}</td>
                  <td className={ui.num}>
                    <button type="button" className="btn btn-ghost" onClick={() => run(async () => (await api(`/auth/sessions/${s.id}`, { method: 'DELETE' }), loadSessions()), 'Sessão encerrada.')}>
                      Encerrar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
