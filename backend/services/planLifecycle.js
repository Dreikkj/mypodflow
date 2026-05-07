const { get, run } = require("../config/database");

const PAID_PLANS = new Set(["starter", "creator", "scale"]);
const PLAN_DURATION_SECONDS = 30 * 24 * 60 * 60;

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

function computeExpiryFromNow() {
  return nowUnix() + PLAN_DURATION_SECONDS;
}

async function ensureUserPlanValidity(userId) {
  const user = await get(
    "SELECT id,plan_id,plan_status,plan_expires_at FROM users WHERE id=?",
    [userId]
  );
  if (!user) return null;
  if (!PAID_PLANS.has(String(user.plan_id || ""))) return user;
  if (!user.plan_expires_at) return user;
  if (Number(user.plan_expires_at) > nowUnix()) return user;

  await run(
    `UPDATE users SET
      plan_previous_id=plan_id,
      plan_id='free',
      plan_status='expired',
      plan_updated_at=?,
      plan_started_at=NULL,
      plan_expires_at=NULL,
      updated_at=strftime('%s','now')
     WHERE id=?`,
    [nowUnix(), userId]
  );

  await run(
    "INSERT INTO logs (user_id,action,metadata,created_at) VALUES (?,?,?,strftime('%s','now'))",
    [
      userId,
      "plan_auto_expired",
      JSON.stringify({
        previous_plan_id: user.plan_id,
        previous_status: user.plan_status,
        expired_at: nowUnix(),
      }),
    ]
  );

  return get("SELECT id,plan_id,plan_status,plan_expires_at FROM users WHERE id=?", [userId]);
}

module.exports = {
  PAID_PLANS,
  PLAN_DURATION_SECONDS,
  computeExpiryFromNow,
  ensureUserPlanValidity,
};
