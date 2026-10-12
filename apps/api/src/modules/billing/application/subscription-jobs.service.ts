import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_RECORDER, AuditRecorder } from '../../../shared/application/audit';
import { Clock, CLOCK } from '../../../shared/domain/clock';
import { APP_ENV, AppEnv } from '../../../shared/infrastructure/config/env';
import { SUBSCRIPTION_REPOSITORY, SubscriptionRepository } from '../domain/ports';

/** Jobs disparados pelo scheduler do worker Go (POST /internal/jobs/...). */
@Injectable()
export class SubscriptionJobsService {
  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY) private readonly subs: SubscriptionRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(APP_ENV) private readonly env: Pick<AppEnv, 'PAST_DUE_GRACE_DAYS'>,
  ) {}

  async expireDue() {
    const now = this.clock.now();
    const candidates = await this.subs.findExpirable(now);
    let expired = 0;
    for (const sub of candidates) {
      const from = sub.status;
      if (sub.expireIfDue(now, this.env.PAST_DUE_GRACE_DAYS)) {
        await this.subs.save(sub);
        await this.audit.record({
          tenantId: sub.tenantId,
          actorId: null,
          action: 'billing.subscription_expired',
          entityType: 'subscription',
          entityId: sub.id,
          metadata: { from },
        });
        expired++;
      }
    }
    return { checked: candidates.length, expired };
  }
}
