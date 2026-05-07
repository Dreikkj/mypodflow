const router = require("express").Router();
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;

const { run, get } = require("../config/database");
const { authMiddleware } = require("../middleware/auth");
const { ensureUserPlanValidity } = require("../services/planLifecycle");

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

function sign(user) {
  return jwt.sign(
    { id: user.id, email: user.email, plan: user.plan_id, isAdmin: Boolean(user.is_admin) },
    process.env.JWT_SECRET,
    { expiresIn: "30d" }
  );
}

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_CALLBACK_URL) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value?.toLowerCase();
          if (!email) return done(new Error("Google não retornou email."));

          let user = await get("SELECT * FROM users WHERE email=?", [email]);
          if (!user) {
            const randomPassword = `google:${crypto.randomBytes(24).toString("hex")}`;
            const created = await run(
              "INSERT INTO users (name,email,password_hash,plan_id,email_verified,avatar_url) VALUES (?,?,?,?,?,?)",
              [profile.displayName || "Usuário", email, randomPassword, "free", 1, profile.photos?.[0]?.value || null]
            );
            user = await get("SELECT * FROM users WHERE id=?", [created.id]);
          }

          return done(null, user);
        } catch (error) {
          return done(error);
        }
      }
    )
  );
}

router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Nome, email e senha são obrigatórios." });
    }
    if (password.length < 8) return res.status(400).json({ error: "Senha deve ter pelo menos 8 caracteres." });

    const normalizedEmail = email.toLowerCase().trim();
    const exists = await get("SELECT id FROM users WHERE email=?", [normalizedEmail]);
    if (exists) return res.status(409).json({ error: "Email já cadastrado." });

    const hash = await bcrypt.hash(password, 12);
    const created = await run(
      "INSERT INTO users (name,email,password_hash,plan_id,email_verified) VALUES (?,?,?,?,?)",
      [name.trim().slice(0, 100), normalizedEmail, hash, "free", 1]
    );

    const user = await get(
      "SELECT id,name,email,plan_id,plan_status,plan_updated_at,pix_approved_at,is_admin,email_verified,avatar_url,created_at FROM users WHERE id=?",
      [created.id]
    );
    return res.status(201).json({ token: sign(user), user });
  } catch (error) {
    console.error("[AUTH_REGISTER]", error);
    return res.status(500).json({ error: "Erro ao criar conta." });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email e senha são obrigatórios." });

    const user = await get("SELECT * FROM users WHERE email=?", [email.toLowerCase().trim()]);
    if (!user) return res.status(401).json({ error: "Credenciais inválidas." });
    if (user.password_hash.startsWith("google:")) {
      return res.status(400).json({ error: "Conta criada com Google. Faça login com Google." });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Credenciais inválidas." });

    await ensureUserPlanValidity(user.id);
    const fresh = await get("SELECT * FROM users WHERE id=?", [user.id]);

    const safeUser = {
      id: fresh.id,
      name: fresh.name,
      email: fresh.email,
      plan_id: fresh.plan_id,
      plan_status: fresh.plan_status,
      plan_updated_at: fresh.plan_updated_at,
      plan_started_at: fresh.plan_started_at,
      plan_expires_at: fresh.plan_expires_at,
      pix_approved_at: fresh.pix_approved_at,
      is_admin: fresh.is_admin,
      email_verified: fresh.email_verified,
      avatar_url: fresh.avatar_url,
    };
    return res.json({ token: sign(fresh), user: safeUser });
  } catch (error) {
    console.error("[AUTH_LOGIN]", error);
    return res.status(500).json({ error: "Erro ao realizar login." });
  }
});

router.get("/me", authMiddleware, async (req, res) => {
  const user = await get(
    `SELECT id,name,email,plan_id,plan_status,plan_updated_at,plan_started_at,plan_expires_at,pix_approved_at,
            is_admin,email_verified,avatar_url,podcast_name,bio,created_at
     FROM users WHERE id=?`,
    [req.user.id]
  );
  res.json({ user });
});

router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email obrigatório." });
    const user = await get("SELECT id FROM users WHERE email=?", [email.toLowerCase().trim()]);
    if (!user) return res.json({ message: "Se o email existir, enviaremos instruções." });

    const token = crypto.randomBytes(32).toString("hex");
    await run("UPDATE users SET reset_token=?, reset_token_expires=? WHERE id=?", [token, Date.now() + 3600000, user.id]);

    return res.json({ message: "Se o email existir, enviaremos instruções." });
  } catch (error) {
    console.error("[AUTH_FORGOT_PASSWORD]", error);
    return res.status(500).json({ error: "Erro ao processar recuperação de senha." });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: "Token e senha são obrigatórios." });
    if (password.length < 8) return res.status(400).json({ error: "Senha deve ter pelo menos 8 caracteres." });

    const user = await get("SELECT id FROM users WHERE reset_token=? AND reset_token_expires>?", [token, Date.now()]);
    if (!user) return res.status(400).json({ error: "Token inválido ou expirado." });

    const hash = await bcrypt.hash(password, 12);
    await run("UPDATE users SET password_hash=?, reset_token=NULL, reset_token_expires=NULL WHERE id=?", [hash, user.id]);
    return res.json({ message: "Senha alterada com sucesso." });
  } catch (error) {
    console.error("[AUTH_RESET_PASSWORD]", error);
    return res.status(500).json({ error: "Erro ao redefinir senha." });
  }
});

router.get("/google", (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(503).json({ error: "Google OAuth não configurado." });
  }
  return passport.authenticate("google", { scope: ["profile", "email"], session: false })(req, res, next);
});

router.get("/google/callback", (req, res, next) => {
  passport.authenticate("google", { session: false }, (error, user) => {
    if (error || !user) {
      const message = encodeURIComponent(error?.message || "Falha no login com Google.");
      return res.redirect(`${FRONTEND_URL}/?auth_error=${message}`);
    }

    const token = sign(user);
    const userParam = encodeURIComponent(
      JSON.stringify({
        id: user.id,
        name: user.name,
        email: user.email,
        plan_id: user.plan_id,
        plan_status: user.plan_status,
        is_admin: user.is_admin,
        avatar_url: user.avatar_url,
      })
    );
    return res.redirect(`${FRONTEND_URL}/?token=${token}&user=${userParam}`);
  })(req, res, next);
});

module.exports = router;
