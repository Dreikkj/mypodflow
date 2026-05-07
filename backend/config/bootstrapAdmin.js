/**
 * Promotes configured email to admin (first deploy / ops).
 * Set ADMIN_EMAIL no .env — não altera outros usuários.
 */
const { run } = require("./database");

async function bootstrapAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) return;
  const result = await run("UPDATE users SET is_admin=1 WHERE lower(email)=?", [email]);
  if (result.changes > 0) {
    console.log(`✓ Admin concedido para ${email}`);
  }
}

module.exports = { bootstrapAdmin };
