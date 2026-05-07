/**
 * Promove o email configurado para admin.
 * Sete ADMIN_EMAIL no Railway/backend.
 */
const { get, run } = require("./database");

async function bootstrapAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();

  if (!email) {
    console.log("[Admin] ADMIN_EMAIL não configurado.");
    return;
  }

  const user = await get("SELECT id, email, is_admin FROM users WHERE lower(email)=?", [email]);

  if (!user) {
    console.log(`[Admin] Usuário ${email} ainda não existe. Faça login/cadastro e redeploy depois.`);
    return;
  }

  if (user.is_admin === 1) {
    console.log(`[Admin] ${email} já é admin.`);
    return;
  }

  await run("UPDATE users SET is_admin=1 WHERE id=?", [user.id]);
  console.log(`✓ Admin concedido para ${email}`);
}

module.exports = { bootstrapAdmin };