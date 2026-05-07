/**
 * podcast.ai — Auth Middleware
 * Criado por Eslem Marques
 */
const jwt = require('jsonwebtoken');
const { get } = require('../config/database');
const { ensureUserPlanValidity } = require("../services/planLifecycle");

async function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token não fornecido' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    await ensureUserPlanValidity(decoded.id);
    const user = await get('SELECT id,name,email,plan_id,plan_status,plan_expires_at,is_admin,is_blocked FROM users WHERE id=?', [decoded.id]);
    if (!user) return res.status(401).json({ error: 'Usuário não encontrado' });
    if (user.is_blocked) return res.status(403).json({ error: 'Conta bloqueada. Entre em contato com o suporte.' });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

async function adminMiddleware(req, res, next) {
  await authMiddleware(req, res, async () => {
    if (!req.user.is_admin) return res.status(403).json({ error: 'Acesso restrito a administradores' });
    next();
  });
}

module.exports = { authMiddleware, adminMiddleware };
