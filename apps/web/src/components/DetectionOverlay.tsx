'use client';

import type { DetectionItem } from '@/lib/types';
import { detectionLabel } from '@/lib/format';
import styles from './DetectionOverlay.module.css';

const COLOR = { critical: '#b8402f', warning: '#e8a317', info: '#0f4c5c' } as const;

/**
 * Desenha as detecções (coordenadas normalizadas 0..1) sobre a imagem.
 * `animate` faz as caixas serem "traçadas" uma vez — o único movimento automático do hero.
 */
export function DetectionOverlay({
  src,
  alt,
  detections,
  animate = false,
  showLabels = true,
}: {
  src: string;
  alt: string;
  detections: DetectionItem[];
  animate?: boolean;
  showLabels?: boolean;
}) {
  return (
    <figure className={styles.frame}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className={styles.img} />
      <svg className={styles.svg} viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
        {detections.map((d, i) => {
          const c = COLOR[d.severity ?? 'info'];
          const x = d.bbox.x * 1000;
          const y = d.bbox.y * 1000;
          const w = d.bbox.w * 1000;
          const h = d.bbox.h * 1000;
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={w}
              height={h}
              fill="none"
              stroke={c}
              strokeWidth={3}
              vectorEffect="non-scaling-stroke"
              pathLength={100}
              className={animate ? styles.draw : undefined}
              style={animate ? { animationDelay: `${0.35 + i * 0.18}s` } : undefined}
            />
          );
        })}
      </svg>
      {showLabels &&
        detections.map((d, i) => (
          <span
            key={i}
            className={`${styles.label} ${animate ? styles.fadeIn : ''}`}
            style={{
              left: `${d.bbox.x * 100}%`,
              top: `${d.bbox.y * 100}%`,
              background: COLOR[d.severity ?? 'info'],
              animationDelay: animate ? `${0.6 + i * 0.18}s` : undefined,
            }}
          >
            {detectionLabel(d.label)} {Math.round(d.confidence * 100)}%
          </span>
        ))}
    </figure>
  );
}
