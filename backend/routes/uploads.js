const router = require("express").Router();
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const fs = require("fs/promises");
const { run } = require("../config/database");
const { authMiddleware } = require("../middleware/auth");

const uploadThrottle = new Map();
const MAX_UPLOADS_PER_WINDOW = 8;
const UPLOAD_WINDOW_MS = 10 * 60 * 1000;

function parseGenerateCaptions(v) {
  if (v === undefined || v === null || v === "") return 1;
  const s = String(v).trim().toLowerCase();
  if (s === "false" || s === "0" || s === "off" || s === "no") return 0;
  return 1;
}

function sanitizeText(v, max = 120) {
  return String(v || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

async function probeMedia(filePath) {
  return new Promise((resolve, reject) => {
    const p = spawn("ffprobe", [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_streams",
      filePath,
    ]);
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    p.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    p.on("error", reject);
    p.on("close", (code) => {
      if (code !== 0) return reject(new Error(stderr || "ffprobe falhou."));
      try {
        const parsed = JSON.parse(stdout || "{}");
        const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
        const hasAudio = streams.some((s) => s.codec_type === "audio");
        const hasVideo = streams.some((s) => s.codec_type === "video");
        resolve({ hasAudio, hasVideo });
      } catch (e) {
        reject(e);
      }
    });
  });
}

function checkUploadThrottle(userId) {
  const now = Date.now();
  const key = String(userId);
  const state = uploadThrottle.get(key) || [];
  const valid = state.filter((ts) => now - ts < UPLOAD_WINDOW_MS);
  if (valid.length >= MAX_UPLOADS_PER_WINDOW) return false;
  valid.push(now);
  uploadThrottle.set(key, valid);
  return true;
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.join(__dirname, "../uploads")),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${req.user.id}-${Date.now()}-${crypto.randomBytes(5).toString("hex")}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 300 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [".mp3", ".wav", ".m4a", ".aac", ".ogg", ".mp4", ".webm"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) return cb(new Error("Formato não suportado."));
    cb(null, true);
  },
});

router.post("/file", authMiddleware, upload.single("audio"), async (req, res) => {
  try {
    if (!checkUploadThrottle(req.user.id)) {
      return res.status(429).json({ error: "Muitos uploads em sequência. Aguarde alguns minutos e tente novamente." });
    }
    if (!req.file) return res.status(400).json({ error: "Arquivo obrigatório." });

    const mediaInfo = await probeMedia(req.file.path);
    if (!mediaInfo.hasAudio && !mediaInfo.hasVideo) {
      await fs.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ error: "Arquivo inválido. Envie um áudio ou vídeo real." });
    }

    const title = sanitizeText(req.body.title || req.file.originalname.replace(/\.[^/.]+$/, ""), 140);
    const generateCaptions = parseGenerateCaptions(req.body.generateCaptions);
    const created = await run(
      `INSERT INTO contents (user_id,title,source_type,file_path,file_name,status,generate_captions,formats_requested,created_at,updated_at)
       VALUES (?,?,?,?,?,'pending',?,?,strftime('%s','now'),strftime('%s','now'))`,
      [req.user.id, title, "file", req.file.path, req.file.originalname, generateCaptions, JSON.stringify(["blog", "thread", "newsletter", "transcript", "shorts"])]
    );
    res.status(201).json({ contentId: created.id, message: "Upload concluído." });
  } catch (error) {
    console.error("[UPLOAD_FILE]", error);
    res.status(500).json({ error: "Erro ao salvar upload." });
  }
});

router.post("/url", authMiddleware, async (req, res) => {
  if (!checkUploadThrottle(req.user.id)) {
    return res.status(429).json({ error: "Muitos uploads em sequência. Aguarde alguns minutos e tente novamente." });
  }
  const { url, title, generateCaptions } = req.body;
  const cleanUrl = sanitizeText(url, 1500);
  if (!cleanUrl) return res.status(400).json({ error: "URL obrigatória." });
  if (!/^https?:\/\//i.test(cleanUrl)) return res.status(400).json({ error: "URL inválida. Use um link http(s)." });
  const caps = parseGenerateCaptions(generateCaptions);
  const safeTitle = sanitizeText(title || cleanUrl.slice(0, 80), 140);
  const created = await run(
    `INSERT INTO contents (user_id,title,source_type,source_url,status,generate_captions,formats_requested,created_at,updated_at)
     VALUES (?,?,?,?, 'pending', ?, ?,strftime('%s','now'),strftime('%s','now'))`,
    [req.user.id, safeTitle, "url", cleanUrl, caps, JSON.stringify(["blog", "thread", "newsletter", "transcript", "shorts"])]
  );
  res.status(201).json({ contentId: created.id, message: "URL registrada. O áudio será baixado automaticamente no processamento." });
});

module.exports = router;
