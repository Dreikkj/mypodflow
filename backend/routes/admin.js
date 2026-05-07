/**
 * myPodFlow — Rotas admin (PIX manual, sem gateway).
 * Todas exigem JWT + is_admin.
 */
const router = require("express").Router();
const { adminMiddleware } = require("../middleware/auth");
const { get, all, run } = require("../config/database");

const SAFE_USER_FIELDS = `id,name,email,plan_id,plan_status,plan_updated_at,plan_started_at,plan_expires_at,pix_approved_at,pix_approved_by,plan_previous_id,is_admin,created_at`;
const PLAN_30_DAYS_SECONDS = 30 * 24 * 60 * 60;

router.use(adminMiddleware);

/** Lista usuários (paginação + busca opcional por email/nome) */
router.get("/users", async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const q = (req.query.q || "").trim().toLowerCase();

    let sql = `SELECT ${SAFE_USER_FIELDS} FROM users WHERE 1=1`;
    const params = [];
    if (q) {
      sql += " AND (lower(email) LIKE ? OR lower(name) LIKE ?)";
      params.push(`%${q}%`, `%${q}%`);
    }
    sql += " ORDER BY updated_at DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const users = await all(sql, params);
    const totalRow = await get(
      q
        ? "SELECT COUNT(*) AS n FROM users WHERE lower(email) LIKE ? OR lower(name) LIKE ?"
        : "SELECT COUNT(*) AS n FROM users",
      q ? [`%${q}%`, `%${q}%`] : []
    );

    res.json({ users, total: totalRow?.n ?? 0, limit, offset });
  } catch (e) {
    console.error("[ADMIN_LIST_USERS]", e);
    res.status(500).json({ error: "Erro ao listar usuários." });
  }
});

/** Busca usuário por email exato */
router.get("/users/by-email", async (req, res) => {
  try {
    const email = (req.query.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "Parâmetro email obrigatório." });

    const user = await get(`SELECT ${SAFE_USER_FIELDS} FROM users WHERE lower(email)=?`, [email]);
    if (!user) return res.status(404).json({ error: "Usuário não encontrado." });

    const pendingPayments = await all(
      `SELECT id,amount_cents,status,provider,description,created_at
       FROM payments WHERE user_id=? AND status='awaiting_review'
       ORDER BY created_at DESC LIMIT 10`,
      [user.id]
    );

    res.json({ user, pendingPayments });
  } catch (e) {
    console.error("[ADMIN_USER_BY_EMAIL]", e);
    res.status(500).json({ error: "Erro ao buscar usuário." });
  }
});

/**
 * Aprova pagamento PIX manual e atualiza plano do usuário.
 * Body: { planId: 'starter'|'creator'|'scale'|'free', paymentId?: number }
 */
router.post("/users/:userId/approve-pix", async (req, res) => {
  try {
    const targetId = parseInt(req.params.userId, 10);
    const { planId, paymentId } = req.body || {};
    if (!targetId || !planId) {
      return res.status(400).json({ error: "userId e planId são obrigatórios." });
    }

    const plan = await get("SELECT id,name FROM plans WHERE id=? AND is_active=1", [planId]);
    if (!plan) return res.status(400).json({ error: "Plano inválido ou inativo." });

    const target = await get(`SELECT id,email,name,plan_id FROM users WHERE id=?`, [targetId]);
    if (!target) return res.status(404).json({ error: "Usuário alvo não encontrado." });

    const adminId = req.user.id;
    const previousPlanId = target.plan_id;
    const nowUnix = Math.floor(Date.now() / 1000);

    const isPaid = planId !== "free";
    const planStatus = isPaid ? "active" : "free";
    const planStartedAt = isPaid ? nowUnix : null;
    const planExpiresAt = isPaid ? nowUnix + PLAN_30_DAYS_SECONDS : null;

    await run(
      `UPDATE users SET
        plan_previous_id=?,
        plan_id=?,
        plan_status=?,
        plan_updated_at=?,
        plan_started_at=?,
        plan_expires_at=?,
        pix_approved_at=?,
        pix_approved_by=?,
        updated_at=strftime('%s','now')
       WHERE id=?`,
      [
        previousPlanId,
        planId,
        planStatus,
        nowUnix,
        planStartedAt,
        planExpiresAt,
        isPaid ? nowUnix : null,
        isPaid ? adminId : null,
        targetId,
      ]
    );

    let paymentUpdated = null;
    if (paymentId != null) {
      const pid = parseInt(paymentId, 10);
      const pay = await get("SELECT id,user_id,status FROM payments WHERE id=?", [pid]);
      if (pay && pay.user_id === targetId && pay.status === "awaiting_review") {
        await run(
          `UPDATE payments SET status='approved', approved_at=strftime('%s','now'), approved_by_admin_id=? WHERE id=?`,
          [adminId, pid]
        );
        paymentUpdated = pid;
      }
    }

    const meta = {
      action: "pix_plan_approved",
      target_user_id: targetId,
      target_email: target.email,
      previous_plan_id: previousPlanId,
      new_plan_id: planId,
      payment_id: paymentUpdated,
      admin_id: adminId,
      plan_started_at: planStartedAt,
      plan_expires_at: planExpiresAt,
    };
    await run(
      "INSERT INTO logs (user_id,action,ip,user_agent,metadata,created_at) VALUES (?,?,?,?,?,strftime('%s','now'))",
      [adminId, "admin_pix_approve", req.ip || "", req.headers["user-agent"] || "", JSON.stringify(meta)]
    );

    console.log(`[ADMIN_PIX_APPROVE] admin=${adminId} target=${targetId} ${previousPlanId} -> ${planId} payment=${paymentUpdated ?? "-"}`);

    const updated = await get(`SELECT ${SAFE_USER_FIELDS} FROM users WHERE id=?`, [targetId]);
    res.json({
      message: `Plano atualizado para ${plan.name}.`,
      user: updated,
      previous_plan_id: previousPlanId,
      payment_marked_approved: paymentUpdated,
    });
  } catch (e) {
    console.error("[ADMIN_APPROVE_PIX]", e);
    res.status(500).json({ error: "Erro ao aprovar pagamento PIX." });
  }
});

module.exports = router;
