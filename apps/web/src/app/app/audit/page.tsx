'use client';

import { useEffect, useState } from 'react';
import { PageHeader, Pager } from '@/components/app/AppShell';
import ui from '@/components/app/ui.module.css';
import { api, ApiError } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import type { Page } from '@/lib/types';

interface Log {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
  actor: { name: string; email: string } | null;
}

const ACTION_LABEL: Record<string, string> = {
  'auth.login': 'Entrou no sistema',
  'auth.login_failed': 'Tentativa de login falhou',
  'auth.logout': 'Saiu do sistema',
  'auth.session_revoked': 'Encerrou uma sessão',
  'auth.refresh_reuse_detected': 'Reuso de sessão bloqueado',
  'user.created': 'Criou usuário',
  'user.updated': 'Editou usuário',
  'user.role_changed': 'Alterou papel de usuário',
  'user.deactivated': 'Desativou usuário',
  'user.reactivated': 'Reativou usuário',
  'user.password_changed': 'Trocou a senha',
  'tenant.created': 'Criou a empresa',
  'tenant.updated': 'Editou dados da empresa',
  'analysis.requested': 'Enviou imagem para análise',
  'analysis.completed': 'Análise concluída',
  'analysis.failed': 'Análise falhou',
  'analysis.retried': 'Reprocessou análise',
  'billing.checkout_started': 'Iniciou checkout',
  'billing.checkout.completed': 'Assinatura confirmada',
  'billing.invoice.paid': 'Fatura paga',
  'billing.invoice.payment_failed': 'Pagamento recusado',
  'billing.subscription.updated': 'Assinatura atualizada',
  'billing.subscription.canceled': 'Assinatura cancelada',
  'billing.subscription_expired': 'Assinatura expirada',
};

const GROUPS = [
  ['', 'Todos os eventos'],
  ['auth.', 'Acesso'],
  ['user.', 'Usuários'],
  ['analysis.', 'Análises'],
  ['billing.', 'Cobrança'],
];

export default function AuditPage() {
  const [data, setData] = useState<Page<Log> | null>(null);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams({ page: String(page), pageSize: '25', ...(action ? { action } : {}) });
    api<Page<Log>>(`/audit-logs?${q}`).then(setData).catch((e: ApiError) => setError(e.message));
  }, [page, action]);

  return (
    <>
      <PageHeader title="Auditoria" description="Registro imutável de acessos, alterações e eventos de cobrança da empresa." />
      {error && <p className="alert alert-error">{error}</p>}
      <section className={ui.panel}>
        <div className={ui.panelHead}>
          <select className="select" style={{ maxWidth: 240 }} value={action} onChange={(e) => (setPage(1), setAction(e.target.value))} aria-label="Filtrar eventos">
            {GROUPS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Quando</th>
                <th>Evento</th>
                <th>Quem</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((l) => (
                <tr key={l.id}>
                  <td className={ui.muted} style={{ whiteSpace: 'nowrap' }}>
                    {fmtDateTime(l.createdAt)}
                  </td>
                  <td>
                    {ACTION_LABEL[l.action] ?? l.action}
                    {l.metadata && 'email' in l.metadata && <div className={ui.muted}>{String(l.metadata.email)}</div>}
                  </td>
                  <td>{l.actor?.name ?? <span className={ui.muted}>Sistema</span>}</td>
                  <td className={ui.muted}>{l.ip ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {data && <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
    </>
  );
}
