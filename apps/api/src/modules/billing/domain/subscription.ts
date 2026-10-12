import { addDays } from '../../../shared/domain/clock';
import { DomainError } from '../../../shared/domain/domain-error';

export type SubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED';

/**
 * Máquina de estados da assinatura.
 *
 *   TRIALING ──pagamento──▶ ACTIVE ◀──pagamento── PAST_DUE
 *      │                     │  ▲                    │
 *      │                     │  └────renovação───────┘
 *      ▼                     ▼
 *   EXPIRED ◀──fim do prazo── CANCELED
 *
 * EXPIRED pode voltar a ACTIVE quando o cliente assina novamente.
 */
const TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  TRIALING: ['ACTIVE', 'CANCELED', 'EXPIRED', 'PAST_DUE'],
  ACTIVE: ['ACTIVE', 'PAST_DUE', 'CANCELED'],
  PAST_DUE: ['ACTIVE', 'CANCELED', 'EXPIRED', 'PAST_DUE'],
  CANCELED: ['ACTIVE', 'EXPIRED'],
  EXPIRED: ['ACTIVE'],
};

export const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  TRIALING: 'Em teste',
  ACTIVE: 'Ativa',
  PAST_DUE: 'Pagamento pendente',
  CANCELED: 'Cancelada',
  EXPIRED: 'Expirada',
};

export interface SubscriptionProps {
  id: string;
  tenantId: string;
  planId: string;
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  pastDueSince: Date | null;
  stripeSubscriptionId: string | null;
}

export class Subscription {
  private constructor(private props: SubscriptionProps) {}

  static startTrial(input: { id: string; tenantId: string; planId: string }, now: Date, trialDays: number) {
    return new Subscription({
      ...input,
      status: 'TRIALING',
      trialEndsAt: addDays(now, trialDays),
      currentPeriodStart: now,
      currentPeriodEnd: addDays(now, trialDays),
      cancelAtPeriodEnd: false,
      canceledAt: null,
      pastDueSince: null,
      stripeSubscriptionId: null,
    });
  }

  static restore(props: SubscriptionProps) {
    return new Subscription({ ...props });
  }

  get id() { return this.props.id; }
  get tenantId() { return this.props.tenantId; }
  get planId() { return this.props.planId; }
  get status() { return this.props.status; }
  get stripeSubscriptionId() { return this.props.stripeSubscriptionId; }

  toSnapshot(): Readonly<SubscriptionProps> {
    return { ...this.props };
  }

  /**
   * A empresa pode operar (criar análises/usuários)?
   * PAST_DUE ainda opera durante o período de carência.
   */
  isOperational(now: Date, graceDays: number): boolean {
    switch (this.props.status) {
      case 'ACTIVE':
        return true;
      case 'TRIALING':
        return !this.props.trialEndsAt || this.props.trialEndsAt > now;
      case 'PAST_DUE':
        return !!this.props.pastDueSince && addDays(this.props.pastDueSince, graceDays) > now;
      case 'CANCELED':
        return !!this.props.currentPeriodEnd && this.props.currentPeriodEnd > now;
      default:
        return false;
    }
  }

  linkStripe(stripeSubscriptionId: string) {
    this.props.stripeSubscriptionId = stripeSubscriptionId;
  }

  changePlan(planId: string) {
    this.props.planId = planId;
  }

  activate(period: { start?: Date | null; end?: Date | null }) {
    this.transition('ACTIVE');
    this.props.trialEndsAt = null;
    this.props.pastDueSince = null;
    this.props.canceledAt = null;
    if (period.start) this.props.currentPeriodStart = period.start;
    if (period.end) this.props.currentPeriodEnd = period.end;
  }

  markPastDue(now: Date) {
    this.transition('PAST_DUE');
    this.props.pastDueSince ??= now;
  }

  scheduleCancel(atPeriodEnd: boolean) {
    this.props.cancelAtPeriodEnd = atPeriodEnd;
  }

  cancel(now: Date) {
    if (this.props.status === 'CANCELED') return;
    this.transition('CANCELED');
    this.props.canceledAt = now;
    this.props.cancelAtPeriodEnd = false;
  }

  /** Executado pelo job periódico. Retorna true se expirou. */
  expireIfDue(now: Date, graceDays: number): boolean {
    const p = this.props;
    const due =
      (p.status === 'TRIALING' && !!p.trialEndsAt && p.trialEndsAt <= now) ||
      (p.status === 'PAST_DUE' && !!p.pastDueSince && addDays(p.pastDueSince, graceDays) <= now) ||
      (p.status === 'CANCELED' && (!p.currentPeriodEnd || p.currentPeriodEnd <= now));
    if (!due) return false;
    this.transition('EXPIRED');
    return true;
  }

  private transition(to: SubscriptionStatus) {
    if (!TRANSITIONS[this.props.status].includes(to)) {
      throw new DomainError('INVALID_STATE', `Transição de assinatura inválida: ${this.props.status} → ${to}.`);
    }
    this.props.status = to;
  }
}

/** Tradução do status bruto do Stripe para o nosso domínio. */
export function fromStripeStatus(status: string | undefined): SubscriptionStatus | null {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'ACTIVE';
    case 'past_due':
    case 'unpaid':
      return 'PAST_DUE';
    case 'canceled':
      return 'CANCELED';
    case 'incomplete_expired':
      return 'EXPIRED';
    default:
      return null; // incomplete, paused: sem mudança de estado
  }
}
