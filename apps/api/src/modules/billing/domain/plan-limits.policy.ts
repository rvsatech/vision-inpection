import { DomainError } from '../../../shared/domain/domain-error';
import { VISION_SERVICE_INFO, VisionServiceCode } from '../../inspection/domain/vision-service';
import { Plan, UNLIMITED, withinLimit } from './plan';
import { Subscription } from './subscription';

export interface TenantUsage {
  activeUsers: number;
  analysesThisMonth: number;
  storageBytes: number;
}

const MB = 1024 * 1024;

/**
 * Regras de limite por plano. Funções puras: recebem estado, devolvem decisão.
 * Mantidas fora dos serviços para serem fáceis de testar e reaproveitar.
 */
export class PlanLimitsPolicy {
  constructor(private readonly graceDays: number) {}

  assertOperational(sub: Subscription | null, now: Date) {
    if (!sub || !sub.isOperational(now, this.graceDays)) {
      throw new DomainError(
        'SUBSCRIPTION_INACTIVE',
        'A assinatura da empresa não está ativa. Regularize o plano em Faturamento para continuar.',
        { status: sub?.status ?? null },
      );
    }
  }

  assertCanAddUser(sub: Subscription | null, plan: Plan, usage: TenantUsage, now: Date) {
    this.assertOperational(sub, now);
    if (!withinLimit(plan.maxUsers, usage.activeUsers + 1)) {
      throw new DomainError('LIMIT_EXCEEDED', `O plano ${plan.name} permite até ${plan.maxUsers} usuários ativos.`, {
        limit: 'users',
        max: plan.maxUsers,
      });
    }
  }

  assertCanRunAnalysis(sub: Subscription | null, plan: Plan, usage: TenantUsage, service: VisionServiceCode, fileBytes: number, now: Date) {
    this.assertOperational(sub, now);
    if (!plan.services.includes(service)) {
      throw new DomainError('LIMIT_EXCEEDED', `O serviço "${VISION_SERVICE_INFO[service].name}" não está incluído no plano ${plan.name}.`, {
        limit: 'service',
        service,
      });
    }
    if (!withinLimit(plan.maxAnalysesPerMonth, usage.analysesThisMonth + 1)) {
      throw new DomainError('LIMIT_EXCEEDED', `Limite mensal de ${plan.maxAnalysesPerMonth} análises atingido.`, {
        limit: 'analyses',
        max: plan.maxAnalysesPerMonth,
      });
    }
    if (plan.maxStorageMb !== UNLIMITED && usage.storageBytes + fileBytes > plan.maxStorageMb * MB) {
      throw new DomainError('LIMIT_EXCEEDED', `Armazenamento do plano (${plan.maxStorageMb} MB) esgotado.`, {
        limit: 'storage',
        max: plan.maxStorageMb,
      });
    }
  }

  /** Percentuais de uso para exibição (null = ilimitado). */
  usageReport(plan: Plan, usage: TenantUsage) {
    const pct = (limit: number, value: number) => (limit === UNLIMITED ? null : Math.min(100, Math.round((value / Math.max(limit, 1)) * 100)));
    return {
      users: { used: usage.activeUsers, limit: plan.maxUsers, percent: pct(plan.maxUsers, usage.activeUsers) },
      analyses: { used: usage.analysesThisMonth, limit: plan.maxAnalysesPerMonth, percent: pct(plan.maxAnalysesPerMonth, usage.analysesThisMonth) },
      storageMb: {
        used: Math.round((usage.storageBytes / MB) * 10) / 10,
        limit: plan.maxStorageMb,
        percent: pct(plan.maxStorageMb, usage.storageBytes / MB),
      },
    };
  }
}
