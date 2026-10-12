'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { PageHeader, Pager } from '@/components/app/AppShell';
import ui from '@/components/app/ui.module.css';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDateTime, ROLE_LABEL } from '@/lib/format';
import type { Page, Role, User } from '@/lib/types';

const ASSIGNABLE: Role[] = ['OWNER', 'ADMIN', 'OPERATOR', 'VIEWER'];

export default function UsersPage() {
  const { user: me, can } = useAuth();
  const [data, setData] = useState<Page<User> | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  const load = useCallback(() => {
    const q = new URLSearchParams({ page: String(page), pageSize: '20', ...(search ? { search } : {}) });
    api<Page<User>>(`/users?${q}`).then(setData).catch((e: ApiError) => setError(e.message));
  }, [page, search]);
  useEffect(load, [load]);

  async function act(fn: () => Promise<unknown>, message: string) {
    setError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(message);
      load();
    } catch (e) {
      setError((e as ApiError).message);
    }
  }

  const writable = can('users:write');

  return (
    <>
      <PageHeader
        title="Usuários"
        description="Quem acessa o sistema e o que cada pessoa pode fazer."
        actions={
          writable && (
            <button type="button" className="btn btn-primary" onClick={() => dialog.current?.showModal()}>
              Adicionar usuário
            </button>
          )
        }
      />
      {error && (
        <p className="alert alert-error" role="alert" style={{ marginBottom: 16 }}>
          {error}
        </p>
      )}
      {notice && (
        <p className="alert alert-info" role="status" style={{ marginBottom: 16 }}>
          {notice}
        </p>
      )}
      <section className={ui.panel}>
        <div className={ui.panelHead}>
          <input className="input" style={{ maxWidth: 320 }} placeholder="Buscar por nome ou e-mail" value={search} onChange={(e) => (setPage(1), setSearch(e.target.value))} aria-label="Buscar usuários" />
        </div>
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Papel</th>
                <th>Situação</th>
                <th>Último acesso</th>
                {writable && <th />}
              </tr>
            </thead>
            <tbody>
              {data?.items.map((u) => (
                <tr key={u.id}>
                  <td>
                    <strong style={{ fontWeight: 500 }}>{u.name}</strong>
                    <div className={ui.muted}>{u.email}</div>
                  </td>
                  <td>
                    {writable && u.id !== me?.id ? (
                      <select
                        className="select"
                        style={{ minWidth: 190 }}
                        value={u.role}
                        aria-label={`Papel de ${u.name}`}
                        onChange={(e) => act(() => api(`/users/${u.id}`, { method: 'PATCH', body: { role: e.target.value } }), `Papel de ${u.name} atualizado.`)}
                      >
                        {ASSIGNABLE.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      ROLE_LABEL[u.role]
                    )}
                  </td>
                  <td>{u.status === 'ACTIVE' ? <span className="tag tag-pass">Ativo</span> : <span className="tag">Inativo</span>}</td>
                  <td className={ui.muted}>{fmtDateTime(u.lastLoginAt)}</td>
                  {writable && (
                    <td className={ui.num}>
                      {u.id !== me?.id &&
                        (u.status === 'ACTIVE' ? (
                          <button type="button" className="btn btn-ghost" onClick={() => act(() => api(`/users/${u.id}/deactivate`, { method: 'POST' }), `${u.name} foi desativado(a) e desconectado(a).`)}>
                            Desativar
                          </button>
                        ) : (
                          <button type="button" className="btn btn-ghost" onClick={() => act(() => api(`/users/${u.id}/reactivate`, { method: 'POST' }), `${u.name} foi reativado(a).`)}>
                            Reativar
                          </button>
                        ))}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {data && <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}

      <dialog ref={dialog} className={ui.dialog} aria-labelledby="new-user-title">
        <NewUserForm
          onClose={() => dialog.current?.close()}
          onCreated={(u) => {
            dialog.current?.close();
            setNotice(`${u.name} foi adicionado(a). Compartilhe a senha inicial por um canal seguro.`);
            load();
          }}
        />
      </dialog>
    </>
  );
}

function NewUserForm({ onClose, onCreated }: { onClose: () => void; onCreated: (u: User) => void }) {
  const [form, setForm] = useState({ name: '', email: '', role: 'OPERATOR' as Role, password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const u = await api<User>('/users', { method: 'POST', body: form });
      setForm({ name: '', email: '', role: 'OPERATOR', password: '' });
      onCreated(u);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className={ui.panelHead}>
        <h2 id="new-user-title" className={ui.panelTitle}>
          Adicionar usuário
        </h2>
      </div>
      <div className={`${ui.panelBody} ${ui.formGrid}`}>
        {error && <p className="alert alert-error">{error}</p>}
        <div className="field">
          <label htmlFor="nu-name">Nome</label>
          <input id="nu-name" className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="nu-email">E-mail</label>
          <input id="nu-email" className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="nu-role">Papel</label>
          <select id="nu-role" className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
            {ASSIGNABLE.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="nu-pass">Senha inicial</label>
          <input id="nu-pass" className="input" type="password" required minLength={10} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
          <span className="hint">Mínimo de 10 caracteres, com letras e números.</span>
        </div>
        <div className={ui.actionsRow}>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Adicionando…' : 'Adicionar usuário'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </form>
  );
}
