/**
 * podcast.ai — Plan Limits Middleware
 * Criado por Eslem Marques
 */
const { get } = require('../config/database');

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

async function checkMinutes(req, res, next) {
  const user = req.user;
  const plan = await get('SELECT * FROM plans WHERE id=?', [user.plan_id]);
  if (!plan) return res.status(400).json({ error: 'Plano inválido' });

  if (user.plan_id === 'free') {
    if (user.free_minutes_used >= 20) {
      return res.status(403).json({
        error: 'Você usou todos os seus 20 minutos gratuitos.',
        code: 'FREE_LIMIT_REACHED',
        upgrade_url: '/planos'
      });
    }
  } else {
    const month = currentMonth();
    const usage = await get('SELECT * FROM usage WHERE user_id=? AND month=?', [user.id, month]);
    const used = usage?.minutes_used || 0;
    if (used >= plan.monthly_minutes && plan.extra_minute_price_cents === 0) {
      return res.status(403).json({
        error: 'Limite de minutos atingido.',
        code: 'MINUTES_LIMIT_REACHED',
        used, limit: plan.monthly_minutes,
        upgrade_url: '/planos'
      });
    }
  }
  req.plan = plan;
  next();
}

async function checkShorts(req, res, next) {
  const user = req.user;
  const plan = await get('SELECT * FROM plans WHERE id=?', [user.plan_id]);

  if (user.plan_id === 'free') {
    return res.status(403).json({ error: 'Shorts não disponíveis no plano Free.', code: 'SHORTS_NOT_AVAILABLE' });
  }

  const month = currentMonth();
  const usage = await get('SELECT * FROM usage WHERE user_id=? AND month=?', [user.id, month]);
  const used = usage?.shorts_used || 0;

  if (used >= plan.monthly_shorts && plan.extra_short_price_cents === 0) {
    return res.status(403).json({
      error: 'Limite de shorts atingido.',
      code: 'SHORTS_LIMIT_REACHED',
      used, limit: plan.monthly_shorts,
    });
  }
  req.plan = plan;
  next();
}

module.exports = { checkMinutes, checkShorts, currentMonth };
