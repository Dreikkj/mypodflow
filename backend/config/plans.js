/**
 * podcast.ai — Plans Configuration
 * Criado por Eslem Marques
 * © 2026 podcast.ai
 */

const { run, get } = require('./database');

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price_cents: 0,
    monthly_minutes: 20,        // total único, não mensal
    monthly_shorts: 0,
    extra_minute_price_cents: 0,
    extra_short_price_cents: 0,
    has_instagram: 0,
    has_integrations: 'none',
    support_level: 'none',
    is_highlighted: 0,
  },
  {
    id: 'starter',
    name: 'Starter',
    price_cents: 3900,          // R$39
    monthly_minutes: 120,
    monthly_shorts: 10,
    extra_minute_price_cents: 10, // R$0,10
    extra_short_price_cents: 60,  // R$0,60
    has_instagram: 0,
    has_integrations: 'none',
    support_level: 'normal',
    is_highlighted: 0,
  },
  {
    id: 'creator',
    name: 'Creator',
    price_cents: 9900,          // R$99
    monthly_minutes: 600,
    monthly_shorts: 60,
    extra_minute_price_cents: 8,  // R$0,08
    extra_short_price_cents: 45,  // R$0,45
    has_instagram: 1,
    has_integrations: 'basic',
    support_level: 'normal',
    is_highlighted: 1,           // destacado como recomendado
  },
  {
    id: 'scale',
    name: 'Scale',
    price_cents: 39900,         // R$399
    monthly_minutes: 2000,
    monthly_shorts: 250,
    extra_minute_price_cents: 6,  // R$0,06
    extra_short_price_cents: 30,  // R$0,30
    has_instagram: 1,
    has_integrations: 'all',
    support_level: 'priority',
    is_highlighted: 0,
  },
];

async function seedPlans() {
  for (const plan of PLANS) {
    await run(
      `INSERT OR REPLACE INTO plans 
       (id,name,price_cents,monthly_minutes,monthly_shorts,extra_minute_price_cents,extra_short_price_cents,has_instagram,has_integrations,support_level,is_highlighted)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [plan.id, plan.name, plan.price_cents, plan.monthly_minutes, plan.monthly_shorts,
       plan.extra_minute_price_cents, plan.extra_short_price_cents,
       plan.has_instagram, plan.has_integrations, plan.support_level, plan.is_highlighted]
    );
  }
  console.log('✓ Plans seeded');
}

function formatPrice(cents) {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

module.exports = { PLANS, seedPlans, formatPrice };
