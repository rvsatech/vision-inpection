'use client';

import { useState } from 'react';
import styles from './chart.module.css';

interface Day {
  day: string;
  total: number;
  failed: number;
}

const fmtDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

/**
 * Barras empilhadas por dia: conformes/informativas (petróleo) e não conformes (vermelho de falha).
 * Uma escala só, legenda sempre visível, tooltip por barra e tabela equivalente para leitores de tela.
 */
export function DailyChart({ series }: { series: Day[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(4, ...series.map((d) => d.total));
  const ticks = [0, Math.round(max / 2), max];
  const W = 640;
  const H = 180;
  const padL = 28;
  const padB = 22;
  const bw = (W - padL) / series.length;
  const y = (v: number) => H - padB - (v / max) * (H - padB - 8);

  return (
    <div className={styles.wrap}>
      <ul className={styles.legend}>
        <li>
          <span className={styles.swatch} style={{ background: 'var(--petrol)' }} /> Conformes e informativas
        </li>
        <li>
          <span className={styles.swatch} style={{ background: 'var(--fault)' }} /> Não conformes
        </li>
      </ul>
      <div className={styles.plot}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Análises por dia nos últimos 14 dias" onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="var(--steel-200)" strokeWidth={1} />
              <text x={padL - 6} y={y(t) + 4} textAnchor="end" className={styles.axis}>
                {t}
              </text>
            </g>
          ))}
          {series.map((d, i) => {
            const x = padL + i * bw + 3;
            const w = bw - 6;
            const ok = d.total - d.failed;
            const yOk = y(ok);
            const yAll = y(d.total);
            return (
              <g key={d.day} onMouseEnter={() => setHover(i)}>
                {/* alvo de hover maior que a barra */}
                <rect x={padL + i * bw} y={0} width={bw} height={H - padB} fill="transparent" />
                {ok > 0 && <rect x={x} y={yOk} width={w} height={H - padB - yOk} rx={d.failed ? 0 : 4} fill="var(--petrol)" opacity={hover === null || hover === i ? 1 : 0.55} />}
                {d.failed > 0 && (
                  <rect x={x} y={yAll} width={w} height={Math.max(0, yOk - yAll - (ok > 0 ? 2 : 0))} rx={4} fill="var(--fault)" opacity={hover === null || hover === i ? 1 : 0.55} />
                )}
                {(i % 2 === 0 || series.length <= 7) && (
                  <text x={x + w / 2} y={H - 6} textAnchor="middle" className={styles.axis}>
                    {fmtDay(d.day)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {hover !== null && (
          <div className={styles.tooltip} style={{ left: `${((padL + (hover + 0.5) * bw) / W) * 100}%` }} role="status">
            <strong>{fmtDay(series[hover].day)}</strong>
            <span>{series[hover].total} análises</span>
            <span>{series[hover].failed} não conformes</span>
          </div>
        )}
      </div>
      <table className="sr-only">
        <caption>Análises por dia</caption>
        <thead>
          <tr>
            <th>Dia</th>
            <th>Total</th>
            <th>Não conformes</th>
          </tr>
        </thead>
        <tbody>
          {series.map((d) => (
            <tr key={d.day}>
              <td>{fmtDay(d.day)}</td>
              <td>{d.total}</td>
              <td>{d.failed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
