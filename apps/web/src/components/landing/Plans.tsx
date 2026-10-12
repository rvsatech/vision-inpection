'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fmtLimit, fmtMoney, SERVICE_LABEL } from '@/lib/format';
import type { Plan } from '@/lib/types';
import styles from './landing.module.css';

// Usado se a API estiver fora do ar — a página de marketing não pode quebrar.
const FALLBACK: Plan[] = [
  { id: 's', code: 'STARTER', name: 'Essencial', description: 'Para uma linha de produção começando a digitalizar a inspeção visual.', priceCents: 69000, currency: 'brl', maxUsers: 5, maxAnalysesPerMonth: 300, maxStorageMb: 2048, services: ['QUALITY_DEFECT', 'OBJECT_COUNT'] },
  { id: 'p', code: 'PRO', name: 'Profissional', description: 'Todos os serviços de visão, mais usuários e volume para a planta inteira.', priceCents: 189000, currency: 'brl', maxUsers: 20, maxAnalysesPerMonth: 3000, maxStorageMb: 20480, services: ['QUALITY_DEFECT', 'PPE_COMPLIANCE', 'OBJECT_COUNT'] },
  { id: 'e', code: 'ENTERPRISE', name: 'Enterprise', description: 'Múltiplas plantas, modelos treinados com seus dados e SLA dedicado.', priceCents: 0, currency: 'brl', maxUsers: -1, maxAnalysesPerMonth: -1, maxStorageMb: -1, services: ['QUALITY_DEFECT', 'PPE_COMPLIANCE', 'OBJECT_COUNT'] },
];

export function Plans() {
  const [plans, setPlans] = useState<Plan[]>(FALLBACK);
  useEffect(() => {
    fetch('/api/plans')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((p: Plan[]) => p.length && setPlans(p))
      .catch(() => undefined);
  }, []);

  return (
    <div className={styles.plans}>
      {plans.map((p) => {
        const featured = p.code === 'PRO';
        const enterprise = p.priceCents === 0;
        return (
          <article key={p.code} className={`${styles.plan} ${featured ? styles.planFeatured : ''}`}>
            {featured && <p className={styles.planFlag}>Mais escolhido</p>}
            <h3 className={styles.planName}>{p.name}</h3>
            <p className={styles.planPrice}>
              {enterprise ? 'Sob consulta' : fmtMoney(p.priceCents, p.currency)}
              {!enterprise && <span>/mês</span>}
            </p>
            <p className={styles.planDesc}>{p.description}</p>
            <ul className={styles.planList}>
              <li>{fmtLimit(p.maxUsers)} usuários</li>
              <li>{fmtLimit(p.maxAnalysesPerMonth)} análises por mês</li>
              <li>{p.maxStorageMb < 0 ? 'Armazenamento ilimitado' : `${fmtLimit(Math.round(p.maxStorageMb / 1024))} GB de imagens`}</li>
              {p.services.map((s) => (
                <li key={s}>{SERVICE_LABEL[s]}</li>
              ))}
            </ul>
            {enterprise ? (
              <a className="btn btn-secondary" href="mailto:comercial@visioninspect.com.br?subject=Plano%20Enterprise">
                Falar com o comercial
              </a>
            ) : (
              <Link className={`btn ${featured ? 'btn-primary' : 'btn-secondary'}`} href={`/signup?plan=${p.code}`}>
                Testar 14 dias grátis
              </Link>
            )}
          </article>
        );
      })}
    </div>
  );
}
