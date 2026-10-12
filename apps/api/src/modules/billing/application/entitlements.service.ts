import { Inject, Injectable } from '@nestjs/common';
import type { EntitlementsPort } from '../../../shared/application/entitlements';
import { Clock, CLOCK } from '../../../shared/domain/clock';
import { DomainError } from '../../../shared/domain/domain-error';
import { APP_ENV, AppEnv } from '../../../shared/infrastructure/config/env';
import type { VisionServiceCode } from '../../inspection/domain/vision-service';
import { PlanLimitsPolicy } from '../domain/plan-limits.policy';
import { PLAN_REPOSITORY, PlanRepository, SUBSCRIPTION_REPOSITORY, SubscriptionRepository, USAGE_READER, UsageReader } from '../domain/ports';

@Injectable()
export class EntitlementsService implements EntitlementsPort {
  private readonly policy: PlanLimitsPolicy;

  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY) private readonly subs: SubscriptionRepository,
    @Inject(PLAN_REPOSITORY) private readonly plans: PlanRepository,
    @Inject(USAGE_READER) private readonly usage: UsageReader,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(APP_ENV) env: Pick<AppEnv, 'PAST_DUE_GRACE_DAYS'>,
  ) {
    this.policy = new PlanLimitsPolicy(env.PAST_DUE_GRACE_DAYS);
  }

  async assertCanAddUser(tenantId: string) {
    const { sub, plan, usage, now } = await this.load(tenantId);
    this.policy.assertCanAddUser(sub, plan, usage, now);
  }

  async assertCanRunAnalysis(tenantId: string, service: VisionServiceCode, fileBytes: number) {
    const { sub, plan, usage, now } = await this.load(tenantId);
    this.policy.assertCanRunAnalysis(sub, plan, usage, service, fileBytes, now);
  }

  private async load(tenantId: string) {
    const now = this.clock.now();
    const sub = await this.subs.findByTenant(tenantId);
    if (!sub) throw new DomainError('SUBSCRIPTION_INACTIVE', 'Empresa sem assinatura.');
    const plan = await this.plans.findById(sub.planId);
    if (!plan) throw new DomainError('NOT_FOUND', 'Plano não encontrado.');
    return { sub, plan, usage: await this.usage.read(tenantId, now), now };
  }
}
