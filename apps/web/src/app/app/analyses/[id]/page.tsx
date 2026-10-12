'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/app/AppShell';
import { DetectionOverlay } from '@/components/DetectionOverlay';
import ui from '@/components/app/ui.module.css';
import { api, ApiError, fetchBlobUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  detectionLabel,
  fmtBytes,
  fmtDateTime,
  metricLabel,
  metricValue,
  sortMetrics,
  SERVICE_LABEL,
  STATUS_LABEL,
  statusClass,
  VERDICT_LABEL,
  verdictClass,
} from '@/lib/format';
import type { AnalysisDetail } from '@/lib/types';
import styles from './detail.module.css';

const SEVERITY_LABEL = { critical: 'Crítico', warning: 'Atenção', info: 'Informativo' } as const;

export default function AnalysisDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const [a, setA] = useState<AnalysisDetail | null>(null);
  const [img, setImg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let alive = true;
    const load = async () => {
      try {
        const d = await api<AnalysisDetail>(`/analyses/${id}`);
        if (!alive) return;
        setA(d);
        if (d.status === 'QUEUED' || d.status === 'PROCESSING') timer = setTimeout(load, 1500);
      } catch (e) {
        setError((e as ApiError).message);
      }
    };
    load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [id]);

  useEffect(() => {
    if (!a?.imageAvailable || img) return;
    let url: string | null = null;
    fetchBlobUrl(`/analyses/${id}/image`)
      .then((u) => setImg((url = u)))
      .catch(() => undefined);
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [a?.imageAvailable, id, img]);

  async function retry() {
    setBusy(true);
    try {
      setA(await api<AnalysisDetail>(`/analyses/${id}/retry`, { method: 'POST' }).then(() => api<AnalysisDetail>(`/analyses/${id}`)));
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="alert alert-error">{error}</p>;
  if (!a) return <p className={ui.muted}>Carregando…</p>;

  const running = a.status === 'QUEUED' || a.status === 'PROCESSING';
  const r = a.result;

  return (
    <>
      <p className={styles.back}>
        <Link href="/app/analyses">Análises</Link>
      </p>
      <PageHeader
        title={a.headline ?? (running ? 'Processando imagem…' : a.originalName)}
        description={`${SERVICE_LABEL[a.service]}, enviada por ${a.requestedBy.name} em ${fmtDateTime(a.createdAt)}`}
        actions={
          a.status === 'FAILED' &&
          can('analyses:create') && (
            <button type="button" className="btn btn-secondary" onClick={retry} disabled={busy}>
              Reprocessar
            </button>
          )
        }
      />
      <div className={styles.layout}>
        <section className={`${ui.panel} ${styles.imagePanel}`}>
          {img ? (
            <DetectionOverlay src={img} alt={`Imagem analisada: ${a.originalName}`} detections={r?.detections ?? []} />
          ) : (
            <div className={ui.empty}>{a.imageAvailable ? 'Carregando imagem…' : 'Imagem removida pela política de retenção.'}</div>
          )}
        </section>

        <aside className={ui.stack}>
          <section className={ui.panel}>
            <div className={ui.panelBody}>
              <div className={styles.verdictRow}>
                {a.status === 'COMPLETED' && a.verdict ? (
                  <span className={verdictClass(a.verdict)}>{VERDICT_LABEL[a.verdict]}</span>
                ) : (
                  <span className={statusClass(a.status)}>{STATUS_LABEL[a.status]}</span>
                )}
                {running && <span className={ui.muted}>Atualizando automaticamente</span>}
              </div>
              {a.status === 'FAILED' && <p className="alert alert-error">{a.failureReason}</p>}
              {r && (
                <dl className={styles.metrics}>
                  {sortMetrics(r.summary.metrics).map(([k, v]) => (
                    <div key={k}>
                      <dt>{metricLabel(k)}</dt>
                      <dd>{metricValue(k, v)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </section>

          {r && r.detections.length > 0 && (
            <section className={ui.panel}>
              <div className={ui.panelHead}>
                <h2 className={ui.panelTitle}>Achados ({r.detections.length})</h2>
              </div>
              <table className={ui.table}>
                <thead>
                  <tr>
                    <th>Achado</th>
                    <th>Gravidade</th>
                    <th className={ui.num}>Confiança</th>
                  </tr>
                </thead>
                <tbody>
                  {r.detections.map((d, i) => (
                    <tr key={i}>
                      <td>{detectionLabel(d.label)}</td>
                      <td>{SEVERITY_LABEL[d.severity ?? 'info']}</td>
                      <td className={ui.num}>{Math.round(d.confidence * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section className={ui.panel}>
            <dl className={`${ui.panelBody} ${styles.tech}`}>
              <dt>Arquivo</dt>
              <dd>
                {a.originalName} ({fmtBytes(a.sizeBytes)})
              </dd>
              <dt>Tentativas</dt>
              <dd>{a.attempts}</dd>
              {r && (
                <>
                  <dt>Modelo</dt>
                  <dd>
                    {r.modelVersion} ({r.mode === 'yolo' ? 'rede neural' : 'visão clássica'})
                  </dd>
                  <dt>Tempo de inferência</dt>
                  <dd>{Math.round(r.latencyMs)} ms</dd>
                </>
              )}
              <dt>Concluída em</dt>
              <dd>{fmtDateTime(a.completedAt)}</dd>
            </dl>
          </section>
        </aside>
      </div>
    </>
  );
}
