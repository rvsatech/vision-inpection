/** Marca: um retículo de câmera (cantos de enquadramento) com o alvo em âmbar. */
export function Logo({ inverted = false, size = 28 }: { inverted?: boolean; size?: number }) {
  const ink = inverted ? '#ffffff' : '#1d272d';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: ink }}>
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
        <path d="M3 10V3h7M22 3h7v7M29 22v7h-7M10 29H3v-7" fill="none" stroke={inverted ? '#fff' : '#0f4c5c'} strokeWidth="2.6" />
        <rect x="12" y="12" width="8" height="8" fill="#e8a317" />
      </svg>
      <span style={{ fontFamily: 'var(--font-cond)', fontWeight: 600, fontSize: size * 0.68, letterSpacing: '-0.01em' }}>
        Vision Inspect
      </span>
    </span>
  );
}
