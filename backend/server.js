require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const passport = require("passport");
const path = require("path");
const fs = require("fs");

const { initDB } = require("./config/database");
const { seedPlans } = require("./config/plans");
const { bootstrapAdmin } = require("./config/bootstrapAdmin");
const { startStorageCleanup } = require("./services/storageCleanup");

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const contentRoutes = require("./routes/processing");
const uploadRoutes = require("./routes/uploads");
const billingRoutes = require("./routes/billing");
const adminRoutes = require("./routes/admin");

const app = express();
const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

fs.mkdirSync(path.join(__dirname, "uploads"), { recursive: true });
fs.mkdirSync(path.join(__dirname, "uploads", "temp"), { recursive: true });
fs.mkdirSync(path.join(__dirname, "uploads", "url-imports"), { recursive: true });

app.use(helmet({ contentSecurityPolicy: false }));
app.use(
  cors({
    origin: [FRONTEND_URL],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));
app.use(passport.initialize());

app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Muitas requisições. Tente novamente em alguns minutos." },
  })
);

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/contents", contentRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/admin", adminRoutes);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "myPodFlow",
    version: "1.0.0",
    now: Date.now(),
  });
});

const frontendDist = path.join(__dirname, "../frontend");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    return res.sendFile(path.join(frontendDist, "index.html"));
  });
}

app.use((err, _req, res, _next) => {
  console.error("[UNHANDLED]", err);
  res.status(500).json({ error: "Erro interno no servidor." });
});

app.use((_req, res) => {
  res.status(404).json({ error: "Rota não encontrada." });
});

async function start() {
  await initDB();
  await seedPlans();
  await bootstrapAdmin();
  startStorageCleanup(path.join(__dirname, "uploads"));
  app.listen(PORT, () => {
    console.log("myPodFlow backend running");
    console.log(`PORT=${PORT}`);
    console.log(`OPENAI=${process.env.OPENAI_API_KEY ? "configured" : "missing"}`);
    console.log(`GOOGLE_OAUTH=${process.env.GOOGLE_CLIENT_ID ? "configured" : "missing"}`);
  });
}

start().catch((err) => {
  console.error("[BOOT_ERROR]", err);
  process.exit(1);
});

module.exports = app;
