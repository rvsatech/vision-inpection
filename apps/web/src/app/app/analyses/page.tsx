'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { PageHeader, Pager } from '@/components/app/AppShell';
import ui from '@/components/app/ui.module.css';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDateTime, SERVICE_LABEL, STATUS_LABEL, statusClass, VERDICT_LABEL, verdictClass } from '@/lib/format';
import type { AnalysisListItem, Page, ServiceCode } from '@/lib/types';
import styles from './analyses.module.css';

const SERVICES: ServiceCode[] = ['QUALITY_DEFECT', 'PPE_COMPLIANCE', 'OBJECT_COUNT'];
const HELP: Record<ServiceCode, string> = {
  QUALITY_DEFECT: 'Foto frontal da peça ou chapa, bem iluminada, ocupando a maior parte do quadro.',
  PPE_COMPLIANCE: 'Foto da área operacional com os colaboradores visíveis de corpo inteiro.',
  OBJECT_COUNT: 'Foto de cima da esteira, palete ou prateleira, com os itens separados do fundo.',
};

function NewAnalysis({ onCreated }: { onCreated: (id: string) => void }) {
  const [service, setService] = useState<ServiceCode>('QUALITY_DEFECT');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append('service', service);
    fd.append('image', file);
    try {
      const a = await api<{ id: string }>('/analyses', { method: 'POST', body: fd });
      onCreated(a.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha no envio.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={`${ui.panel} ${styles.upload}`} onSubmit={submit}>
      <div className={ui.panelHead}>
        <h2 className={ui.panelTitle}>Nova análise</h2>
      </div>
      <div className={`${ui.panelBody} ${styles.uploadBody}`}>
        <fieldset className={styles.services}>
          <legend className="sr-only">Serviço</legend>
          {SERVICES.map((s) => (
            <label key={s} className={`${styles.serviceOpt} ${service === s ? styles.serviceOn : ''}`}>
              <input type="radio" name="service" value={s} checked={service === s} onChange={() => setService(s)} />
              <span className={styles.serviceName}>{SERVICE_LABEL[s]}</span>
              <span className={styles.serviceHelp}>{HELP[s]}</span>
            </label>
          ))}
        </fieldset>
        <div
          className={styles.drop}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            setFile(e.dataTransfer.files[0] ?? null);
          }}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Pré-visualização da imagem selecionada" className={styles.preview} />
          ) : (
            <p>Arraste uma imagem para cá ou</p>
          )}
          <button type="button" className="btn btn-secondary" onClick={() => input.current?.click()}>
            {file ? 'Trocar imagem' : 'Escolher arquivo'}
          </button>
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label="Imagem para análise" />
          <span className="hint">JPEG, PNG ou WebP até 10 MB</span>
        </div>
        {error && (
          <p className="alert alert-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-primary" disabled={!file || busy}>
          {busy ? 'Enviando…' : 'Enviar para análise'}
        </button>
      </div>
    </form>
  );
}

function AnalysesInner() {
  const { can } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [showNew, setShowNew] = useState(params.get('new') === '1');
  const [filters, setFilters] = useState({ service: params.get('service') ?? '', verdict: params.get('verdict') ?? '', status: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<AnalysisListItem> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    const q = new URLSearchParams({ page: String(page), pageSize: '15' });
    Object.entries(filters).forEach(([k, v]) => v && q.set(k, v));
    api<Page<AnalysisListItem>>(`/analyses?${q}`)
      .then(setData)
      .catch((e: ApiError) => setError(e.message));
  }, [filters, page]);

  useEffect(load, [load]);
  // Enquanto houver análises em andamento, atualiza a lista a cada 3 s.
  useEffect(() => {
    if (!data?.items.some((a) => a.status === 'QUEUED' || a.status === 'PROCESSING')) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [data, load]);

  const setFilter = (k: keyof typeof filters) => (e: { target: { value: string } }) => {
    setPage(1);
    setFilters((f) => ({ ...f, [k]: e.target.value }));
  };

  return (
    <>
      <PageHeader
        title="Análises"
        description="Cada imagem enviada passa pela fila de processamento e recebe um veredito em segundos."
        actions={
          can('analyses:create') &&
          !showNew && (
            <button type="button" className="btn btn-primary" onClick={() => setShowNew(true)}>
              Nova análise
            </button>
          )
        }
      />
      <div className={ui.stack}>
        {showNew && can('analyses:create') && <NewAnalysis onCreated={(id) => router.push(`/app/analyses/${id}`)} />}

        <section className={ui.panel}>
          <div className={`${ui.panelHead} ${styles.filters}`}>
            <select className="select" value={filters.service} onChange={setFilter('service')} aria-label="Filtrar por serviço">
              <option value="">Todos os serviços</option>
              {SERVICES.map((s) => (
                <option key={s} value={s}>
                  {SERVICE_LABEL[s]}
                </option>
              ))}
            </select>
            <select className="select" value={filters.verdict} onChange={setFilter('verdict')} aria-label="Filtrar por resultado">
              <option value="">Todos os resultados</option>
              <option value="FAIL">Não conformes</option>
              <option value="PASS">Conformes</option>
              <option value="INFO">Informativos</option>
            </select>
            <select className="select" value={filters.status} onChange={setFilter('status')} aria-label="Filtrar por status">
              <option value="">Todos os status</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="alert alert-error">{error}</p>}
          {data && data.items.length === 0 ? (
            <div className={ui.empty}>
              <strong>Nenhuma análise encontrada</strong>
              {can('analyses:create') ? 'Ajuste os filtros ou envie uma nova imagem.' : 'Ajuste os filtros.'}
            </div>
          ) : (
            <div className={ui.tableWrap}>
              <table className={ui.table}>
                <thead>
                  <tr>
                    <th>Resultado</th>
                    <th>Serviço</th>
                    <th>Status</th>
                    <th>Enviada por</th>
                    <th>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.items.map((a) => (
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
                      <td>{a.requestedBy.name}</td>
                      <td className={ui.muted}>{fmtDateTime(a.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        {data && <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
      </div>
    </>
  );
}

export default function AnalysesPage() {
  return (
    <Suspense>
      <AnalysesInner />
    </Suspense>
  );
}
