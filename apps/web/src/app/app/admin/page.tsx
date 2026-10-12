'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/app/AppShell';
import ui from '@/components/app/ui.module.css';
import { api, ApiError } from '@/lib/api';
import { fmtDate, fmtDateTime, fmtMoney } from '@/lib/format';
import type { Page } from '@/lib/types';

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: string;
  storageBytesUsed: number;
  subscription: { status: string; trialEndsAt: string | null; currentPeriodEnd: string | null; plan: { name: string } } | null;
  _count: { users: number; analyses: number };
}
interface SubsPage {
  summary: { byStatus: Record<string, number>; mrrCents: number };
}
interface BillingEventRow {
  id: string;
  type: string;
  processedAt: string;
  tenantId: string | null;
}

const SUB_LABEL: Record<string, string> = { TRIALING: 'Em teste', ACTIVE: 'Ativa', PAST_DUE: 'Pendente', CANCELED: 'Cancelada', EXPIRED: 'Expirada' };
const SUB_TAG: Record<string, string> = { ACTIVE: 'tag tag-pass', TRIALING: 'tag tag-info', PAST_DUE: 'tag tag-warn', CANCELED: 'tag tag-fail', EXPIRED: 'tag tag-fail' };

export default function AdminPage() {
  const [tenants, setTenants] = useState<Page<TenantRow> | null>(null);
  const [subs, setSubs] = useState<SubsPage | null>(null);
  const [events, setEvents] = useState<BillingEventRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Page<TenantRow>>('/admin/tenants?pageSize=50').then(setTenants).catch((e: ApiError) => setError(e.message));
    api<SubsPage>('/admin/billing/subscriptions?pageSize=1').then(setSubs).catch(() => undefined);
    api<Page<BillingEventRow>>('/admin/billing/events?pageSize=10').then((p) => setEvents(p.items)).catch(() => undefined);
  }, []);
  useEffect(load, [load]);

  async function toggle(t: TenantRow) {
    try {
      await api(`/admin/tenants/${t.id}/status`, { method: 'PATCH', body: { status: t.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' } });
      load();
    } catch (e) {
      setError((e as ApiError).message);
    }
  }

  return (
    <>
      <PageHeader title="Plataforma" description="Empresas clientes, situação das assinaturas e eventos de cobrança recebidos do Stripe." />
      {error && <p className="alert alert-error">{error}</p>}
      {subs && (
        <section className={ui.panel} style={{ marginBottom: 20 }}>
          <div className={ui.panelBody} style={{ display: 'flex', flexWrap: 'wrap', gap: 32 }}>
            <div>
              <div className={ui.muted} style={{ fontSize: 'var(--t-sm)' }}>
                Receita recorrente mensal
              </div>
              <div style={{ fontFamily: 'var(--font-cond)', fontSize: 'var(--t-2xl)', fontWeight: 600 }}>{fmtMoney(subs.summary.mrrCents)}</div>
            </div>
            {Object.entries(SUB_LABEL).map(([k, l]) => (
              <div key={k}>
                <div className={ui.muted} style={{ fontSize: 'var(--t-sm)' }}>
                  {l}
                </div>
                <div style={{ fontFamily: 'var(--font-cond)', fontSize: 'var(--t-2xl)', fontWeight: 600 }}>{subs.summary.byStatus[k] ?? 0}</div>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className={ui.panel}>
        <div className={ui.panelHead}>
          <h2 className={ui.panelTitle}>Empresas ({tenants?.total ?? 0})</h2>
        </div>
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Plano</th>
                <th>Assinatura</th>
                <th className={ui.num}>Usuários</th>
                <th className={ui.num}>Análises</th>
                <th>Cliente desde</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tenants?.items.map((t) => (
                <tr key={t.id}>
                  <td>
                    <strong style={{ fontWeight: 500 }}>{t.name}</strong>
                    {t.status === 'SUSPENDED' && (
                      <div>
                        <span className="tag tag-fail">Suspensa</span>
                      </div>
                    )}
                  </td>
                  <td>{t.subscription?.plan.name ?? '—'}</td>
                  <td>
                    {t.subscription && <span className={SUB_TAG[t.subscription.status]}>{SUB_LABEL[t.subscription.status]}</span>}
                    {t.subscription?.status === 'TRIALING' && <div className={ui.muted}>até {fmtDate(t.subscription.trialEndsAt)}</div>}
                  </td>
                  <td className={ui.num}>{t._count.users}</td>
                  <td className={ui.num}>{t._count.analyses}</td>
                  <td className={ui.muted}>{fmtDate(t.createdAt)}</td>
                  <td className={ui.num}>
                    {t.slug !== 'vision-inspect' && (
                      <button type="button" className={`btn ${t.status === 'ACTIVE' ? 'btn-danger' : 'btn-secondary'}`} onClick={() => toggle(t)}>
                        {t.status === 'ACTIVE' ? 'Suspender' : 'Reativar'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className={ui.panel} style={{ marginTop: 20 }}>
        <div className={ui.panelHead}>
          <h2 className={ui.panelTitle}>Últimos eventos do Stripe</h2>
        </div>
        {events.length === 0 ? (
          <div className={ui.empty}>Nenhum evento recebido ainda. Rode `stripe listen` para encaminhar webhooks ao worker.</div>
        ) : (
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Evento</th>
                <th>Tipo</th>
                <th>Processado em</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td className={ui.muted}>{e.id}</td>
                  <td>{e.type}</td>
                  <td className={ui.muted}>{fmtDateTime(e.processedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
