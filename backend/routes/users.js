const router = require("express").Router();
const bcrypt = require("bcryptjs");
const { get, run } = require("../config/database");
const { authMiddleware } = require("../middleware/auth");

router.get("/usage", authMiddleware, async (req, res) => {
  try {
    const user = await get(
      `SELECT u.id,u.plan_id,u.plan_status,u.plan_started_at,u.plan_expires_at,u.free_minutes_used,p.monthly_minutes,p.monthly_shorts,p.name AS plan_name
       FROM users u
       JOIN plans p ON p.id = u.plan_id
       WHERE u.id=?`,
      [req.user.id]
    );
    const contents = await get("SELECT COUNT(*) AS total FROM contents WHERE user_id=? AND status='done'", [req.user.id]);

    const minutesUsed = Number(user.free_minutes_used || 0);
    const minutesLimit = Number(user.monthly_minutes || 0);
    const minutesPct = minutesLimit ? Math.min(100, Math.round((minutesUsed / minutesLimit) * 100)) : 0;

    res.json({
      plan: user.plan_id,
      planStatus: user.plan_status,
      planName: user.plan_name,
      planStartedAt: user.plan_started_at || null,
      planExpiresAt: user.plan_expires_at || null,
      minutesUsed,
      minutesLimit,
      minutesPct,
      contentsGenerated: contents.total || 0,
      shortsLimit: Number(user.monthly_shorts || 0),
    });
  } catch (error) {
    console.error("[USERS_USAGE]", error);
    res.status(500).json({ error: "Erro ao carregar uso da conta." });
  }
});

router.put("/me", authMiddleware, async (req, res) => {
  try {
    const { name, podcastName, bio } = req.body;
    await run(
      `UPDATE users
       SET name=COALESCE(?,name), podcast_name=COALESCE(?,podcast_name), bio=COALESCE(?,bio), updated_at=strftime('%s','now')
       WHERE id=?`,
      [name?.trim()?.slice(0, 100) || null, podcastName?.trim()?.slice(0, 120) || null, bio?.trim()?.slice(0, 600) || null, req.user.id]
    );
    res.json({ message: "Perfil atualizado." });
  } catch (error) {
    console.error("[USERS_UPDATE_ME]", error);
    res.status(500).json({ error: "Erro ao atualizar perfil." });
  }
});

router.put("/password", authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: "Senha atual e nova senha são obrigatórias." });
    if (newPassword.length < 8) return res.status(400).json({ error: "Nova senha deve ter ao menos 8 caracteres." });

    const user = await get("SELECT password_hash FROM users WHERE id=?", [req.user.id]);
    if (user.password_hash.startsWith("google:")) {
      return res.status(400).json({ error: "Conta criada via Google não possui senha local." });
    }

    const ok = await bcrypt.compare(currentPassword, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Senha atual inválida." });

    const hash = await bcrypt.hash(newPassword, 12);
    await run("UPDATE users SET password_hash=?, updated_at=strftime('%s','now') WHERE id=?", [hash, req.user.id]);
    res.json({ message: "Senha atualizada." });
  } catch (error) {
    console.error("[USERS_UPDATE_PASSWORD]", error);
    res.status(500).json({ error: "Erro ao alterar senha." });
  }
});

module.exports = router;
