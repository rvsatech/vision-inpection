import { DomainError } from '../../../shared/domain/domain-error';
import { fromStripeStatus, Subscription } from './subscription';

const day = 86_400_000;
const t0 = new Date('2026-10-01T00:00:00Z');
const at = (days: number) => new Date(t0.getTime() + days * day);
const trial = () => Subscription.startTrial({ id: 's1', tenantId: 't1', planId: 'p1' }, t0, 14);

describe('Subscription — máquina de estados', () => {
  it('trial opera até o fim do período e depois expira', () => {
    const s = trial();
    expect(s.status).toBe('TRIALING');
    expect(s.isOperational(at(13), 7)).toBe(true);
    expect(s.isOperational(at(14), 7)).toBe(false);
    expect(s.expireIfDue(at(10), 7)).toBe(false);
    expect(s.expireIfDue(at(15), 7)).toBe(true);
    expect(s.status).toBe('EXPIRED');
  });

  it('pagamento ativa e limpa trial', () => {
    const s = trial();
    s.activate({ start: at(2), end: at(32) });
    expect(s.status).toBe('ACTIVE');
    expect(s.toSnapshot().trialEndsAt).toBeNull();
    expect(s.toSnapshot().currentPeriodEnd).toEqual(at(32));
  });

  it('falha de pagamento → PAST_DUE com carência', () => {
    const s = trial();
    s.activate({ end: at(30) });
    s.markPastDue(at(31));
    s.markPastDue(at(33)); // não reinicia a carência
    expect(s.toSnapshot().pastDueSince).toEqual(at(31));
    expect(s.isOperational(at(37), 7)).toBe(true);
    expect(s.isOperational(at(38), 7)).toBe(false);
    expect(s.expireIfDue(at(38), 7)).toBe(true);
  });

  it('recuperação de PAST_DUE volta para ACTIVE', () => {
    const s = trial();
    s.activate({});
    s.markPastDue(at(1));
    s.activate({ end: at(60) });
    expect(s.status).toBe('ACTIVE');
    expect(s.toSnapshot().pastDueSince).toBeNull();
  });

  it('cancelada mantém acesso até o fim do período pago', () => {
    const s = trial();
    s.activate({ end: at(30) });
    s.cancel(at(10));
    expect(s.status).toBe('CANCELED');
    expect(s.isOperational(at(20), 7)).toBe(true);
    expect(s.expireIfDue(at(29), 7)).toBe(false);
    expect(s.expireIfDue(at(30), 7)).toBe(true);
  });

  it('bloqueia transições inválidas', () => {
    const s = trial();
    s.expireIfDue(at(20), 7);
    expect(() => s.markPastDue(at(21))).toThrow(DomainError);
    expect(() => s.cancel(at(21))).toThrow(/inválida/);
    s.activate({ end: at(50) }); // reassinatura
    expect(s.status).toBe('ACTIVE');
  });

  it('traduz status do Stripe', () => {
    expect(fromStripeStatus('active')).toBe('ACTIVE');
    expect(fromStripeStatus('unpaid')).toBe('PAST_DUE');
    expect(fromStripeStatus('canceled')).toBe('CANCELED');
    expect(fromStripeStatus('incomplete')).toBeNull();
  });
});
