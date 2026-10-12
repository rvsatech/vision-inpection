/**
 * Cria (ou reaproveita) produtos e preços dos planos no Stripe em TEST MODE.
 * Idempotente via lookup_key. Uso:
 *   STRIPE_SECRET_KEY=sk_test_... npm run stripe:bootstrap -w apps/api
 * Copie as linhas STRIPE_PRICE_* exibidas para o seu .env e rode o seed de novo.
 */
import { config } from 'dotenv';
import Stripe from 'stripe';
import { PLAN_CATALOG } from '../prisma/plans';

config({ path: ['.env', '../../.env'], quiet: true });

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !/^(sk|rk)_test_/.test(key)) {
    console.error('Defina STRIPE_SECRET_KEY com uma chave de TESTE (sk_test_...).');
    process.exit(1);
  }
  const stripe = new Stripe(key);
  const lines: string[] = [];

  for (const plan of PLAN_CATALOG.filter((p) => p.priceEnv && p.priceCents > 0)) {
    const lookupKey = `vision_${plan.code.toLowerCase()}_monthly_brl`;
    const existing = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
    let price = existing.data[0];
    if (!price) {
      const product = await stripe.products.create({
        name: `Vision Inspect — ${plan.name}`,
        description: plan.description,
        metadata: { planCode: plan.code },
      });
      price = await stripe.prices.create({
        product: product.id,
        currency: 'brl',
        unit_amount: plan.priceCents,
        recurring: { interval: 'month' },
        lookup_key: lookupKey,
        metadata: { planCode: plan.code },
      });
      console.log(`✔ criado ${plan.code}: ${price.id}`);
    } else {
      console.log(`• já existe ${plan.code}: ${price.id}`);
    }
    lines.push(`${plan.priceEnv}=${price.id}`);
  }
  console.log('\nAdicione ao .env:\n' + lines.join('\n'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
