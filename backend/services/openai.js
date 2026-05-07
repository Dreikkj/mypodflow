const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { spawn } = require("child_process");
const OpenAI = require("openai");

const MAX_WHISPER_BYTES = 24 * 1024 * 1024;
const OPENAI_TIMEOUT_MS = Math.max(30000, Number(process.env.OPENAI_TIMEOUT_MS || 180000));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableOpenAIError(error) {
  const msg = String(error?.message || "");
  const status = Number(error?.status || error?.statusCode || 0);
  return status === 429 || status >= 500 || /timeout|temporar|overloaded|rate/i.test(msg);
}

async function withTimeout(promise, timeoutMs, label) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} excedeu timeout de ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

async function callOpenAIWithRetry(label, fn) {
  const maxAttempts = 2;
  let lastErr;
  for (let i = 1; i <= maxAttempts; i += 1) {
    try {
      return await withTimeout(fn(), OPENAI_TIMEOUT_MS, label);
    } catch (error) {
      lastErr = error;
      if (i >= maxAttempts || !isRetryableOpenAIError(error)) break;
      await sleep(700 * i);
    }
  }
  throw lastErr;
}

function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY não configurada.");
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function runCmd(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`${cmd} falhou: ${stderr.slice(-500)}`));
      return resolve({ stdout, stderr });
    });
  });
}

async function getAudioDurationSec(filePath) {
  const { stdout } = await runCmd("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);
  const v = Number(String(stdout || "").trim());
  return Number.isFinite(v) ? v : 0;
}

async function splitAudioForWhisper(filePath) {
  const st = await fsp.stat(filePath);
  if (st.size <= MAX_WHISPER_BYTES) return [{ path: filePath, offset: 0 }];

  const totalDuration = await getAudioDurationSec(filePath);
  if (!totalDuration || totalDuration < 1) {
    return [{ path: filePath, offset: 0 }];
  }

  // Estimate chunk duration to keep each part under Whisper limit.
  const bytesPerSecond = st.size / totalDuration;
  const safeBytes = MAX_WHISPER_BYTES * 0.8;
  const chunkSeconds = Math.max(120, Math.floor(safeBytes / Math.max(1, bytesPerSecond)));

  const tempDir = path.join(os.tmpdir(), `mpf-transcribe-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`);
  await fsp.mkdir(tempDir, { recursive: true });
  const pattern = path.join(tempDir, "chunk-%03d.mp3");

  await runCmd("ffmpeg", [
    "-y",
    "-i",
    filePath,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "48k",
    "-f",
    "segment",
    "-segment_time",
    String(chunkSeconds),
    "-reset_timestamps",
    "1",
    pattern,
  ]);

  const files = (await fsp.readdir(tempDir))
    .filter((n) => n.startsWith("chunk-") && n.endsWith(".mp3"))
    .sort()
    .map((n) => path.join(tempDir, n));

  return files.map((p, idx) => ({ path: p, offset: idx * chunkSeconds, tempDir }));
}

async function transcribeAudio(filePath) {
  const client = getClient();
  const parts = await splitAudioForWhisper(filePath);
  const texts = [];
  const segments = [];
  let currentOffset = 0;
  let tempDir = null;

  try {
    for (const part of parts) {
      tempDir = tempDir || part.tempDir || null;
      const file = fs.createReadStream(part.path);
      const response = await callOpenAIWithRetry("transcrição OpenAI", () =>
        client.audio.transcriptions.create({
          file,
          model: "whisper-1",
          language: "pt",
          response_format: "verbose_json",
          timestamp_granularities: ["segment"],
        })
      );
      const txt = String(response.text || "").trim();
      if (txt) texts.push(txt);

      const localSegments = Array.isArray(response.segments) ? response.segments : [];
      for (const s of localSegments) {
        const start = Number(s.start || 0) + currentOffset;
        const end = Number(s.end || 0) + currentOffset;
        segments.push({ ...s, start, end });
      }
      currentOffset = part.offset + (localSegments.length ? Number(localSegments[localSegments.length - 1].end || 0) : 0);
    }
  } finally {
    if (tempDir) fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }

  return {
    text: texts.join("\n\n").trim(),
    segments,
  };
}

function parseJsonFromModel(text) {
  const raw = String(text || "").trim();
  const cleaned = raw.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (_e) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("Resposta da IA não retornou JSON válido.");
  }
}

async function generateStructuredContent(transcript, title, segments = []) {
  const client = getClient();
  const compactSegments = segments
    .slice(0, 200)
    .map((s) => ({ start: s.start, end: s.end, text: s.text }))
    .filter((s) => s.text)
    .slice(0, 120);

  const prompt = `
Você é um estrategista de conteúdo.
Com base na transcrição abaixo, gere JSON válido com as chaves:
blog, thread, newsletter, resumo, titulos, hooks, cortes.

Regras:
- "thread" deve ser array de tweets.
- "titulos" deve ser array de 5 títulos.
- "hooks" deve ser array de 8 hooks curtos e fortes para social.
- "cortes" deve ser array de 5 a 10 objetos com:
  { titulo, hook, start_seconds, end_seconds, motivo, legenda }
- start_seconds e end_seconds devem ter base nos timestamps da transcrição.
- duração de cada corte entre 30 e 90 segundos.
- prioridade: cortes com maior potencial viral para Reels/TikTok/Shorts.
- Responda APENAS JSON válido.

Título do episódio: ${title || "Sem título"}
Transcrição:
${transcript}

Segmentos com timestamps:
${JSON.stringify(compactSegments)}
`;

  const response = await callOpenAIWithRetry("geração OpenAI", () =>
    client.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.5,
      messages: [{ role: "user", content: prompt }],
    })
  );
  const content = response.choices?.[0]?.message?.content || "";
  return parseJsonFromModel(content);
}

module.exports = { transcribeAudio, generateStructuredContent };
