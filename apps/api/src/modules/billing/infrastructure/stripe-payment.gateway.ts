import { Inject, Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { DomainError } from '../../../shared/domain/domain-error';
import { APP_ENV, AppEnv } from '../../../shared/infrastructure/config/env';
import type { Plan } from '../domain/plan';
import type { BillingCustomer, PaymentGateway } from '../domain/ports';

/**
 * Adaptador do Stripe — somente TEST MODE (a validação de env rejeita chaves live).
 * Toda a lógica de estado da assinatura vem dos webhooks (processados pelo worker Go),
 * nunca do retorno do checkout: o redirect de sucesso pode ser forjado, o webhook assinado não.
 */
@Injectable()
export class StripePaymentGateway implements PaymentGateway {
  private readonly logger = new Logger('Stripe');
  private readonly stripe: Stripe | null;

  constructor(@Inject(APP_ENV) env: AppEnv) {
    this.stripe = env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2, appInfo: { name: 'vision-inspect' } }) : null;
    if (!this.stripe) this.logger.warn('STRIPE_SECRET_KEY não definido — checkout desabilitado.');
  }

  get enabled() {
    return !!this.stripe;
  }

  async ensureCustomer(c: BillingCustomer): Promise<string> {
    const customer = await this.client().customers.create(
      { name: c.tenantName, email: c.email, metadata: { tenantId: c.tenantId } },
      { idempotencyKey: `customer-${c.tenantId}` },
    );
    return customer.id;
  }

  async createCheckoutSession(input: { customerId: string; tenantId: string; plan: Plan; successUrl: string; cancelUrl: string }) {
    const metadata = { tenantId: input.tenantId, planCode: input.plan.code };
    const session = await this.client().checkout.sessions.create({
      mode: 'subscription',
      customer: input.customerId,
      client_reference_id: input.tenantId,
      line_items: [{ price: input.plan.stripePriceId!, quantity: 1 }],
      metadata,
      subscription_data: { metadata },
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      locale: 'pt-BR',
      allow_promotion_codes: true,
    });
    if (!session.url) throw new DomainError('UNAVAILABLE', 'Stripe não retornou URL de checkout.');
    return { url: session.url, id: session.id };
  }

  async createPortalSession(input: { customerId: string; returnUrl: string }) {
    const s = await this.client().billingPortal.sessions.create({ customer: input.customerId, return_url: input.returnUrl });
    return { url: s.url };
  }

  private client(): Stripe {
    if (!this.stripe) throw new DomainError('UNAVAILABLE', 'Cobrança não configurada.');
    return this.stripe;
  }
}
