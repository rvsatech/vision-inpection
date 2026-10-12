'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { PageHeader } from '@/components/app/AppShell';
import ui from '@/components/app/ui.module.css';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate, fmtLimit, fmtMoney, fmtNumber, SERVICE_LABEL } from '@/lib/format';
import type { Plan } from '@/lib/types';

interface Usage {
  used: number;
  limit: number;
  percent: number | null;
}
interface Overview {
  subscription: {
    status: string;
    statusLabel: string;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    operational: boolean;
    managedByStripe: boolean;
  };
  plan: Plan;
  usage: { users: Usage; analyses: Usage; storageMb: Usage };
  billingEnabled: boolean;
}

const STATUS_TAG: Record<string, string> = { ACTIVE: 'tag tag-pass', TRIALING: 'tag tag-info', PAST_DUE: 'tag tag-warn', CANCELED: 'tag tag-fail', EXPIRED: 'tag tag-fail' };

function Meter({ label, u, unit = '' }: { label: string; u: Usage; unit?: string }) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--t-sm)' }}>
        <span>{label}</span>
        <span className={ui.muted}>
          {fmtNumber(u.used)}
          {unit} de {fmtLimit(u.limit, unit)}
        </span>
      </div>
      {u.percent !== null && (
        <div className={ui.meter} role="progressbar" aria-valuenow={u.percent} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
          <div className={`${ui.meterFill} ${u.percent >= 85 ? ui.meterHigh : ''}`} style={{ width: `${u.percent}%` }} />
        </div>
      )}
    </div>
  );
}

function BillingInner() {
  const { can } = useAuth();
  const params = useSearchParams();
  const [o, setO] = useState<Overview | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api<Overview>('/billing/subscription').then(setO).catch((e: ApiError) => setError(e.message));
    api<Plan[]>('/plans').then(setPlans).catch(() => undefined);
  }, []);

  async function go(path: string, body?: unknown, key = path) {
    setBusy(key);
    setError(null);
    try {
      const { url } = await api<{ url: string }>(path, { method: 'POST', body });
      window.location.assign(url);
    } catch (e) {
      setError((e as ApiError).message);
      setBusy(null);
    }
  }

  const manage = can('billing:manage');
  const checkout = params.get('checkout');

  return (
    <>
      <PageHeader title="Plano e cobrança" description="Pagamentos processados pelo Stripe em ambiente de teste. Nenhuma cobrança real é feita." />
      {checkout === 'success' && (
        <p className="alert alert-info" style={{ marginBottom: 16 }}>
          Pagamento recebido. A assinatura é atualizada assim que o Stripe confirmar (normalmente em segundos).
        </p>
      )}
      {checkout === 'canceled' && (
        <p className="alert alert-warn" style={{ marginBottom: 16 }}>
          Checkout cancelado. Nenhum valor foi cobrado.
        </p>
      )}
      {error && (
        <p className="alert alert-error" role="alert" style={{ marginBottom: 16 }}>
          {error}
        </p>
      )}
      {o && (
        <div className={ui.stack}>
          <div className={ui.grid2}>
            <section className={ui.panel}>
              <div className={ui.panelHead}>
                <h2 className={ui.panelTitle}>Plano {o.plan.name}</h2>
                <span className={STATUS_TAG[o.subscription.status] ?? 'tag'}>{o.subscription.statusLabel}</span>
              </div>
              <div className={ui.panelBody} style={{ display: 'grid', gap: 10, fontSize: 'var(--t-sm)' }}>
                <p>
                  {o.plan.priceCents ? `${fmtMoney(o.plan.priceCents, o.plan.currency)} por mês` : 'Contrato sob consulta'}
                </p>
                {o.subscription.status === 'TRIALING' && <p>Teste gratuito até {fmtDate(o.subscription.trialEndsAt)}.</p>}
                {o.subscription.status === 'ACTIVE' && o.subscription.currentPeriodEnd && (
                  <p>{o.subscription.cancelAtPeriodEnd ? 'Cancelamento agendado para' : 'Próxima renovação em'} {fmtDate(o.subscription.currentPeriodEnd)}.</p>
                )}
                {o.subscription.status === 'PAST_DUE' && <p>O último pagamento falhou. Atualize o cartão para evitar o bloqueio.</p>}
                <p className={ui.muted}>Inclui: {o.plan.services.map((s) => SERVICE_LABEL[s]).join(', ')}.</p>
                {manage && o.subscription.managedByStripe && (
                  <div>
                    <button type="button" className="btn btn-secondary" disabled={!!busy} onClick={() => go('/billing/portal')}>
                      {busy === '/billing/portal' ? 'Abrindo…' : 'Gerenciar pagamento e faturas'}
                    </button>
                  </div>
                )}
              </div>
            </section>
            <section className={ui.panel}>
              <div className={ui.panelHead}>
                <h2 className={ui.panelTitle}>Uso</h2>
              </div>
              <div className={ui.panelBody} style={{ display: 'grid', gap: 18 }}>
                <Meter label="Análises neste mês" u={o.usage.analyses} />
                <Meter label="Usuários ativos" u={o.usage.users} />
                <Meter label="Armazenamento" u={o.usage.storageMb} unit=" MB" />
              </div>
            </section>
          </div>

          {manage && (
            <section className={ui.panel}>
              <div className={ui.panelHead}>
                <h2 className={ui.panelTitle}>Mudar de plano</h2>
              </div>
              {!o.billingEnabled && (
                <p className="alert alert-warn" style={{ margin: 18 }}>
                  Cobrança não configurada neste ambiente: defina STRIPE_SECRET_KEY (modo de teste) na API.
                </p>
              )}
              <div className={ui.tableWrap}>
                <table className={ui.table}>
                  <thead>
                    <tr>
                      <th>Plano</th>
                      <th className={ui.num}>Preço</th>
                      <th className={ui.num}>Usuários</th>
                      <th className={ui.num}>Análises/mês</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {plans.map((p) => (
                      <tr key={p.code}>
                        <td>
                          <strong style={{ fontWeight: 500 }}>{p.name}</strong>
                          <div className={ui.muted}>{p.services.map((s) => SERVICE_LABEL[s]).join(', ')}</div>
                        </td>
                        <td className={ui.num}>{p.priceCents ? fmtMoney(p.priceCents, p.currency) : 'Sob consulta'}</td>
                        <td className={ui.num}>{fmtLimit(p.maxUsers)}</td>
                        <td className={ui.num}>{fmtLimit(p.maxAnalysesPerMonth)}</td>
                        <td className={ui.num}>
                          {p.code === o.plan.code && o.subscription.status === 'ACTIVE' ? (
                            <span className={ui.muted}>Plano atual</span>
                          ) : p.checkoutAvailable ? (
                            <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => go('/billing/checkout', { planCode: p.code }, p.code)}>
                              {busy === p.code ? 'Abrindo checkout…' : 'Assinar'}
                            </button>
                          ) : p.priceCents === 0 ? (
                            <a className="btn btn-secondary" href="mailto:comercial@visioninspect.com.br">
                              Falar com o comercial
                            </a>
                          ) : (
                            <span className={ui.muted}>Indisponível</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className={`hint`} style={{ padding: '0 18px 16px' }}>
                No checkout de teste, use o cartão 4242 4242 4242 4242, qualquer data futura e qualquer CVC.
              </p>
            </section>
          )}
        </div>
      )}
    </>
  );
}

export default function BillingPage() {
  return (
    <Suspense>
      <BillingInner />
    </Suspense>
  );
}
