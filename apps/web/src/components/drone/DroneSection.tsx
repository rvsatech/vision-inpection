'use client';

import { Canvas } from '@react-three/fiber';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Anchor, DroneRig, IndustrialScene } from './scene';
import styles from './DroneSection.module.css';

gsap.registerPlugin(ScrollTrigger);

type Severity = 'critical' | 'warning' | 'info';

/** Pontos da planta que o "sistema" sinaliza durante o voo, com a janela de progresso em que aparecem. */
const FINDINGS: (Anchor & { text: string; severity: Severity; from: number; to: number })[] = [
  { id: 'w3', position: [-23.5, 3.1, 3.5], text: 'Sem capacete na área de paletes', severity: 'critical', from: 0.1, to: 0.36 },
  { id: 'pallets', position: [-25, 4.2, 9], text: '11 volumes em estoque', severity: 'info', from: 0.12, to: 0.34 },
  { id: 'w1', position: [-11, 3.1, -3], text: 'EPI completo', severity: 'info', from: 0.3, to: 0.52 },
  { id: 'belt', position: [-6, 2.4, -6], text: 'Esteira 2: 9 caixas em trânsito', severity: 'info', from: 0.3, to: 0.55 },
  { id: 'press', position: [10, 7.6, -6], text: 'Prensa P-04 sem anomalias', severity: 'info', from: 0.5, to: 0.72 },
  { id: 'w2', position: [13, 3.1, -2], text: 'EPI completo', severity: 'info', from: 0.5, to: 0.72 },
  { id: 'tank', position: [29.7, 4.4, 8.3], text: 'Tanque T-2: corrosão no costado', severity: 'warning', from: 0.68, to: 0.9 },
];

/** Etapas do voo — de fato uma sequência, por isso numeradas. */
const WAYPOINTS = [
  { at: 0.22, title: 'Armazenagem', body: 'O drone confere EPI de quem circula entre os paletes e o volume em estoque.' },
  { at: 0.42, title: 'Linha de embalagem', body: 'A câmera fixa da esteira conta caixas; o voo confirma postura e EPI do operador.' },
  { at: 0.62, title: 'Prensagem', body: 'Inspeção visual da prensa e do perímetro de segurança durante a operação.' },
  { at: 0.8, title: 'Parque de tanques', body: 'Imagens do costado e da tubulação para detectar corrosão antes da parada.' },
];

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export default function DroneSection() {
  const section = useRef<HTMLElement>(null);
  const progress = useRef(0);
  const tagRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const altRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false); // monta o Canvas só perto da viewport
  const [inView, setInView] = useState(false); // pausa a renderização fora da tela
  const [mode, setMode] = useState<'pending' | 'flight' | 'static' | 'fallback'>('pending');
  const [stop, setStop] = useState(-1);
  const [lite, setLite] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setLite(window.matchMedia('(max-width: 760px)').matches);
    setMode(!webglAvailable() ? 'fallback' : reduced ? 'static' : 'flight');
    if (reduced) progress.current = 1;

    const el = section.current!;
    const near = new IntersectionObserver(([e]) => e.isIntersecting && setMounted(true), { rootMargin: '600px 0px' });
    const vis = new IntersectionObserver(([e]) => setInView(e.isIntersecting));
    near.observe(el);
    vis.observe(el);
    return () => {
      near.disconnect();
      vis.disconnect();
    };
  }, []);

  useEffect(() => {
    if (mode !== 'flight') return;
    // A seção fica presa logo abaixo do cabeçalho fixo do site.
    const headerH = (document.querySelector('header') as HTMLElement | null)?.offsetHeight ?? 0;
    section.current!.style.setProperty('--offset', `${headerH}px`);
    const st = ScrollTrigger.create({
      trigger: section.current,
      start: `top ${headerH}px`,
      end: '+=260%', // ~5 s de voo em uma rolagem normal
      pin: true,
      scrub: true,
      onUpdate: (self) => {
        progress.current = self.progress;
        if (barRef.current) barRef.current.style.transform = `scaleX(${self.progress})`;
        let s = -1;
        WAYPOINTS.forEach((w, i) => self.progress >= w.at - 0.12 && (s = i));
        setStop((prev) => (prev === s ? prev : s));
      },
    });
    return () => st.kill();
  }, [mode]);

  const onProject = useCallback((screen: Record<string, { x: number; y: number; visible: boolean }>, p: number, altitude: number) => {
    for (const f of FINDINGS) {
      const el = tagRefs.current[f.id];
      const s = screen[f.id];
      if (!el || !s) continue;
      const show = s.visible && p >= f.from && p <= f.to;
      el.style.opacity = show ? '1' : '0';
      el.style.transform = `translate3d(${s.x}px, ${s.y}px, 0)`;
    }
    if (altRef.current) altRef.current.textContent = altitude.toFixed(1).replace('.', ',');
  }, []);

  const skip = () => {
    const st = ScrollTrigger.getAll().find((t) => t.trigger === section.current);
    window.scrollTo({ top: st ? st.end + 1 : window.scrollY + window.innerHeight, behavior: 'auto' });
  };

  if (mode === 'fallback') {
    return (
      <section className={styles.fallback} aria-labelledby="drone-title">
        <h2 id="drone-title">Sobrevoo de inspeção</h2>
        <p>Seu navegador não suporta WebGL, então o sobrevoo 3D não pode ser exibido. Os achados do percurso:</p>
        <ul>
          {FINDINGS.map((f) => (
            <li key={f.id}>{f.text}</li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section ref={section} className={styles.section} aria-labelledby="drone-title">
      <div className={styles.stage}>
        {mounted && (
          <Canvas
            className={styles.canvas}
            frameloop={inView ? 'always' : 'never'}
            dpr={lite ? 1 : [1, 1.5]}
            gl={{ antialias: !lite, powerPreference: 'high-performance' }}
            camera={{ fov: 50, near: 0.5, far: 220, position: [-48, 32, 42] }}
          >
            <IndustrialScene lite={lite} />
            <DroneRig progress={progress} anchors={FINDINGS} onProject={onProject} />
          </Canvas>
        )}

        {/* HUD do drone */}
        <div className={styles.hud} aria-hidden="true">
          <span className={`${styles.corner} ${styles.tl}`} />
          <span className={`${styles.corner} ${styles.tr}`} />
          <span className={`${styles.corner} ${styles.bl}`} />
          <span className={`${styles.corner} ${styles.br}`} />
          <span className={styles.reticle} />
          <div className={styles.telemetry}>
            <span className={styles.rec}>REC</span>
            <span>
              Altitude <b ref={altRef}>32,0</b> m
            </span>
            <span>
              Bateria <b>78%</b>
            </span>
          </div>
          {FINDINGS.map((f) => (
            <div key={f.id} ref={(el) => void (tagRefs.current[f.id] = el)} className={`${styles.tag} ${styles[f.severity]}`}>
              <span className={styles.box} />
              <span className={styles.tagText}>{f.text}</span>
            </div>
          ))}
        </div>

        <div className={styles.copy}>
          <h2 id="drone-title" className={styles.title}>
            Um sobrevoo pela planta
          </h2>
          <p className={styles.lead}>Role a página para conduzir o drone. Cada parada mostra o que a Vision Inspect sinaliza em uma rota real de inspeção.</p>
          <ol className={styles.stops}>
            {WAYPOINTS.map((w, i) => (
              <li key={w.title} className={i === stop ? styles.active : i < stop ? styles.done : undefined}>
                <span className={styles.stopNum}>{i + 1}</span>
                <span>
                  <strong>{w.title}</strong>
                  <span className={styles.stopBody}>{w.body}</span>
                </span>
              </li>
            ))}
          </ol>
          {mode === 'flight' && (
            <button type="button" className={styles.skip} onClick={skip}>
              Pular sobrevoo
            </button>
          )}
        </div>

        <div className={styles.progress} aria-hidden="true">
          <div ref={barRef} className={styles.bar} />
        </div>
      </div>
    </section>
  );
}
