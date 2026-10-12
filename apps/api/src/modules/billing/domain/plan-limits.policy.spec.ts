import { Plan, UNLIMITED } from './plan';
import { PlanLimitsPolicy, TenantUsage } from './plan-limits.policy';
import { Subscription } from './subscription';

const now = new Date('2026-10-05T00:00:00Z');
const plan = (over: Partial<Plan> = {}): Plan => ({
  id: 'p',
  code: 'STARTER',
  name: 'Essencial',
  description: '',
  priceCents: 69000,
  currency: 'brl',
  stripePriceId: null,
  maxUsers: 5,
  maxAnalysesPerMonth: 300,
  maxStorageMb: 100,
  services: ['QUALITY_DEFECT', 'OBJECT_COUNT'],
  isPublic: true,
  ...over,
});
const usage = (over: Partial<TenantUsage> = {}): TenantUsage => ({ activeUsers: 1, analysesThisMonth: 0, storageBytes: 0, ...over });
const active = () => {
  const s = Subscription.startTrial({ id: 's', tenantId: 't', planId: 'p' }, new Date('2026-10-01T00:00:00Z'), 14);
  s.activate({ end: new Date('2026-11-01T00:00:00Z') });
  return s;
};
const policy = new PlanLimitsPolicy(7);

describe('PlanLimitsPolicy', () => {
  it('bloqueia sem assinatura operacional', () => {
    expect(() => policy.assertCanAddUser(null, plan(), usage(), now)).toThrow(expect.objectContaining({ code: 'SUBSCRIPTION_INACTIVE' }));
  });

  it('limita usuários', () => {
    expect(() => policy.assertCanAddUser(active(), plan(), usage({ activeUsers: 4 }), now)).not.toThrow();
    expect(() => policy.assertCanAddUser(active(), plan(), usage({ activeUsers: 5 }), now)).toThrow(expect.objectContaining({ code: 'LIMIT_EXCEEDED' }));
  });

  it('bloqueia serviço fora do plano', () => {
    expect(() => policy.assertCanRunAnalysis(active(), plan(), usage(), 'PPE_COMPLIANCE', 10, now)).toThrow(/não está incluído/);
  });

  it('limita análises mensais e armazenamento', () => {
    expect(() => policy.assertCanRunAnalysis(active(), plan(), usage({ analysesThisMonth: 300 }), 'QUALITY_DEFECT', 10, now)).toThrow(/Limite mensal/);
    const almostFull = usage({ storageBytes: 100 * 1024 * 1024 - 5 });
    expect(() => policy.assertCanRunAnalysis(active(), plan(), almostFull, 'QUALITY_DEFECT', 10, now)).toThrow(/Armazenamento/);
  });

  it('plano ilimitado não bloqueia', () => {
    const p = plan({ maxUsers: UNLIMITED, maxAnalysesPerMonth: UNLIMITED, maxStorageMb: UNLIMITED, services: ['PPE_COMPLIANCE'] });
    expect(() => policy.assertCanRunAnalysis(active(), p, usage({ analysesThisMonth: 1e6, storageBytes: 1e12 }), 'PPE_COMPLIANCE', 1e6, now)).not.toThrow();
    expect(policy.usageReport(p, usage()).analyses.percent).toBeNull();
  });

  it('relatório de uso em percentual', () => {
    const r = policy.usageReport(plan(), usage({ activeUsers: 2, analysesThisMonth: 150, storageBytes: 25 * 1024 * 1024 }));
    expect(r.users.percent).toBe(40);
    expect(r.analyses.percent).toBe(50);
    expect(r.storageMb).toEqual({ used: 25, limit: 100, percent: 25 });
  });
});
