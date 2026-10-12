'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { PageHeader } from '@/components/app/AppShell';
import { DailyChart } from '@/components/app/DailyChart';
import ui from '@/components/app/ui.module.css';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDateTime, fmtNumber, SERVICE_LABEL, STATUS_LABEL, statusClass, VERDICT_LABEL, verdictClass } from '@/lib/format';
import type { AnalysisListItem, ServiceCode } from '@/lib/types';
import styles from './dashboard.module.css';

interface Dashboard {
  totals: { total: number; pass: number; fail: number; conformityRate: number | null; byStatus: Record<string, number> };
  services: { code: ServiceCode; name: string; total: number; pass: number; fail: number; conformityRate: number | null }[];
  series: { day: string; total: number; failed: number }[];
  recent: AnalysisListItem[];
}
interface Overview {
  subscription: { status: string; statusLabel: string; trialEndsAt: string | null; operational: boolean };
  plan: { name: string };
  usage: { analyses: { used: number; limit: number; percent: number | null } };
}

function DashboardInner() {
  const { user, can } = useAuth();
  const params = useSearchParams();
  const [data, setData] = useState<Dashboard | null>(null);
  const [billing, setBilling] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Dashboard>('/dashboard').then(setData).catch((e: ApiError) => setError(e.message));
    api<Overview>('/billing/subscription').then(setBilling).catch(() => undefined);
  }, []);

  const pending = (data?.totals.byStatus.QUEUED ?? 0) + (data?.totals.byStatus.PROCESSING ?? 0);
  const trialDays = billing?.subscription.trialEndsAt ? Math.max(0, Math.ceil((new Date(billing.subscription.trialEndsAt).getTime() - Date.now()) / 86_400_000)) : null;

  return (
    <>
      <PageHeader
        title={`Olá, ${user?.name.split(' ')[0]}`}
        description="Resumo das inspeções do mês corrente."
        actions={
          can('analyses:create') && (
            <Link href="/app/analyses?new=1" className="btn btn-primary">
              Nova análise
            </Link>
          )
        }
      />
      {params.get('welcome') && (
        <p className="alert alert-info" style={{ marginBottom: 20 }}>
          Conta criada. Envie a primeira imagem em <Link href="/app/analyses?new=1">Nova análise</Link> para ver o resultado em segundos.
        </p>
      )}
      {billing && billing.subscription.status === 'TRIALING' && trialDays !== null && (
        <p className="alert alert-warn" style={{ marginBottom: 20 }}>
          Seu teste do plano {billing.plan.name} termina em {trialDays} {trialDays === 1 ? 'dia' : 'dias'}.{' '}
          <Link href="/app/billing">Escolher plano</Link>
        </p>
      )}
      {billing && !billing.subscription.operational && (
        <p className="alert alert-error" style={{ marginBottom: 20 }}>
          Assinatura {billing.subscription.statusLabel.toLowerCase()}: novas análises estão bloqueadas. <Link href="/app/billing">Regularizar</Link>
        </p>
      )}
      {error && <p className="alert alert-error">{error}</p>}

      {data && (
        <div className={ui.stack}>
          <section className={styles.kpis} aria-label="Indicadores do mês">
            <div className={styles.kpi}>
              <span className={styles.kpiLabel}>Conformidade</span>
              <span className={styles.kpiValue}>{data.totals.conformityRate === null ? '—' : `${data.totals.conformityRate.toLocaleString('pt-BR')}%`}</span>
              <span className={styles.kpiFoot}>
                {data.totals.pass} conformes de {data.totals.pass + data.totals.fail} avaliadas
              </span>
            </div>
            <div className={styles.kpi}>
              <span className={styles.kpiLabel}>Não conformidades</span>
              <span className={`${styles.kpiValue} ${data.totals.fail ? styles.kpiFail : ''}`}>{fmtNumber(data.totals.fail)}</span>
              <Link href="/app/analyses?verdict=FAIL" className={styles.kpiFoot}>
                Ver ocorrências
              </Link>
            </div>
            <div className={styles.kpi}>
              <span className={styles.kpiLabel}>Análises no mês</span>
              <span className={styles.kpiValue}>{fmtNumber(data.totals.total)}</span>
              {billing && (
                <span className={styles.kpiFoot}>
                  {billing.usage.analyses.limit < 0 ? 'Plano sem limite mensal' : `${billing.usage.analyses.percent}% do limite de ${fmtNumber(billing.usage.analyses.limit)}`}
                </span>
              )}
            </div>
            <div className={styles.kpi}>
              <span className={styles.kpiLabel}>Em processamento</span>
              <span className={styles.kpiValue}>{fmtNumber(pending)}</span>
              <span className={styles.kpiFoot}>{pending ? 'Atualize em alguns segundos' : 'Fila vazia'}</span>
            </div>
          </section>

          <div className={ui.grid2}>
            <section className={ui.panel}>
              <div className={ui.panelHead}>
                <h2 className={ui.panelTitle}>Últimos 14 dias</h2>
              </div>
              <div className={ui.panelBody}>
                <DailyChart series={data.series} />
              </div>
            </section>
            <section className={ui.panel}>
              <div className={ui.panelHead}>
                <h2 className={ui.panelTitle}>Por serviço no mês</h2>
              </div>
              <table className={ui.table}>
                <thead>
                  <tr>
                    <th>Serviço</th>
                    <th className={ui.num}>Análises</th>
                    <th className={ui.num}>Não conformes</th>
                    <th className={ui.num}>Conformidade</th>
                  </tr>
                </thead>
                <tbody>
                  {data.services.map((s) => (
                    <tr key={s.code}>
                      <td>
                        <Link href={`/app/analyses?service=${s.code}`}>{SERVICE_LABEL[s.code]}</Link>
                      </td>
                      <td className={ui.num}>{s.total}</td>
                      <td className={ui.num}>{s.fail}</td>
                      <td className={ui.num}>{s.code === 'OBJECT_COUNT' ? <span className={ui.muted}>informativo</span> : s.conformityRate === null ? '—' : `${s.conformityRate.toLocaleString('pt-BR')}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>

          <section className={ui.panel}>
            <div className={ui.panelHead}>
              <h2 className={ui.panelTitle}>Análises recentes</h2>
              <Link href="/app/analyses" className="btn btn-ghost">
                Ver todas
              </Link>
            </div>
            {data.recent.length === 0 ? (
              <div className={ui.empty}>
                <strong>Nenhuma análise ainda</strong>
                Envie uma foto da linha para começar.
              </div>
            ) : (
              <div className={ui.tableWrap}>
                <table className={ui.table}>
                  <thead>
                    <tr>
                      <th>Resultado</th>
                      <th>Serviço</th>
                      <th>Status</th>
                      <th>Enviada em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <Link href={`/app/analyses/${a.id}`}>{a.headline ?? a.originalName}</Link>
                        </td>
                        <td>{SERVICE_LABEL[a.service]}</td>
                        <td>
                          {a.status === 'COMPLETED' && a.verdict ? (
                            <span className={verdictClass(a.verdict)}>{VERDICT_LABEL[a.verdict]}</span>
                          ) : (
                            <span className={statusClass(a.status)}>{STATUS_LABEL[a.status]}</span>
                          )}
                        </td>
                        <td className={ui.muted}>{fmtDateTime(a.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardInner />
    </Suspense>
  );
}
