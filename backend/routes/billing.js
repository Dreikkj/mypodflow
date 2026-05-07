const router = require("express").Router();
const { all, get, run } = require("../config/database");
const { authMiddleware } = require("../middleware/auth");

const DISCORD_URL = "https://discord.gg/kzE62vDz4j";

function pixConfig(planId) {
  const normalized = String(planId || "").toUpperCase();
  return {
    qrCode: process.env[`PIX_${normalized}_QRCODE`] || "",
    copyPaste: process.env[`PIX_${normalized}_COPYPASTE`] || "",
  };
}

router.get("/plans", async (_req, res) => {
  const plans = await all(
    "SELECT id,name,price_cents,monthly_minutes,monthly_shorts,is_highlighted FROM plans WHERE id!='free' ORDER BY price_cents ASC"
  );
  res.json({ plans });
});

router.post("/pix-intent", authMiddleware, async (req, res) => {
  const { planId } = req.body;
  if (!planId) return res.status(400).json({ error: "Plano obrigatório." });

  const plan = await get("SELECT id,name,price_cents FROM plans WHERE id=? AND id!='free'", [planId]);
  if (!plan) return res.status(404).json({ error: "Plano inválido." });

  const pix = pixConfig(plan.id);
  if (!pix.qrCode || !pix.copyPaste) {
    return res.status(503).json({ error: `PIX do plano ${plan.id} não configurado no servidor.` });
  }

  const payment = await run(
    `INSERT INTO payments (user_id,amount_cents,type,status,provider,provider_payment_id,description,created_at)
     VALUES (?,?,'subscription','pending','manual_pix',?, ?,strftime('%s','now'))`,
    [req.user.id, plan.price_cents, `manual_${plan.id}_${Date.now()}`, `PIX manual - ${plan.name}`]
  );

  res.json({
    paymentId: payment.id,
    plan: { id: plan.id, name: plan.name, price_cents: plan.price_cents },
    pixQrCode: pix.qrCode,
    pixCopyPaste: pix.copyPaste,
    discordUrl: DISCORD_URL,
    instructions: [
      "Copie o código PIX ou escaneie o QR Code.",
      "Realize o pagamento no seu banco.",
      "Clique em 'Já paguei' e abra o Discord.",
      "Envie o comprovante para liberação manual do plano.",
    ],
  });
});

router.post("/i-paid", authMiddleware, async (req, res) => {
  const { paymentId } = req.body;
  if (!paymentId) return res.status(400).json({ error: "paymentId obrigatório." });

  const payment = await get("SELECT * FROM payments WHERE id=? AND user_id=?", [paymentId, req.user.id]);
  if (!payment) return res.status(404).json({ error: "Pagamento não encontrado." });

  await run("UPDATE payments SET status='awaiting_review' WHERE id=?", [paymentId]);
  await run(
    "UPDATE users SET plan_status='pending_pix_review', plan_updated_at=strftime('%s','now'), updated_at=strftime('%s','now') WHERE id=?",
    [req.user.id]
  );
  res.json({
    message: "Recebido! Seu pagamento está aguardando revisão manual.",
    discordUrl: DISCORD_URL,
  });
});

module.exports = router;
