const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

function runCmd(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    const timeoutMs = Math.max(30000, Number(process.env.YTDLP_TIMEOUT_MS || 300000));
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const t = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGKILL");
    }, timeoutMs);

    proc.stdout.on("data", (chunk) => {
      stdout += String(chunk || "");
    });
    proc.stderr.on("data", (chunk) => {
      stderr += String(chunk || "");
    });

    proc.on("error", (error) => {
      clearTimeout(t);
      reject(error);
    });
    proc.on("close", (code) => {
      clearTimeout(t);
      if (timedOut) {
        const err = new Error(`Timeout ao executar ${cmd}.`);
        err.stdout = stdout;
        err.stderr = stderr;
        return reject(err);
      }
      if (code === 0) return resolve({ stdout, stderr });
      const err = new Error(`Falha ao executar ${cmd} (exit ${code}).`);
      err.stdout = stdout;
      err.stderr = stderr;
      return reject(err);
    });
  });
}

async function findByPrefix(dirPath, prefix) {
  const entries = await fs.readdir(dirPath);
  const matches = entries
    .filter((name) => name.startsWith(prefix))
    .map((name) => path.join(dirPath, name));
  if (!matches.length) return null;

  const withStat = await Promise.all(
    matches.map(async (filePath) => {
      const st = await fs.stat(filePath);
      return { filePath, mtimeMs: st.mtimeMs };
    })
  );
  withStat.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return withStat[0].filePath;
}

async function resolveContentAudio(content) {
  if (content.file_path) return content.file_path;
  if (!content.source_url) {
    throw new Error("Conteúdo sem arquivo e sem URL de origem.");
  }

  const ytdlpBin = process.env.YTDLP_PATH || "yt-dlp";
  const importsDir = path.join(__dirname, "../uploads/url-imports");
  await ensureDir(importsDir);

  const baseName = `${content.user_id}-${content.id}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const outputTemplate = path.join(importsDir, `${baseName}.%(ext)s`);

  const videoArgs = [
    "--no-playlist",
    "--no-warnings",
    "--format",
    "bv*+ba/b",
    "--merge-output-format",
    "mp4",
    "--output",
    outputTemplate,
    content.source_url,
  ];

  const audioFallbackArgs = [
    "--no-playlist",
    "--no-warnings",
    "--extract-audio",
    "--audio-format",
    "mp3",
    "--audio-quality",
    "0",
    "--output",
    outputTemplate,
    content.source_url,
  ];

  try {
    await runCmd(ytdlpBin, videoArgs);
  } catch (error) {
    const stderr = String(error.stderr || "");
    if (stderr.includes("Unsupported URL")) {
      throw new Error("URL não suportada pelo downloader atual.");
    }
    if (stderr.includes("Sign in to confirm your age")) {
      throw new Error("Esse conteúdo exige autenticação/idade e não pode ser baixado automaticamente.");
    }
    if (stderr.includes("HTTP Error 403")) {
      throw new Error("A plataforma bloqueou o download (HTTP 403).");
    }
    if (error.code === "ENOENT") {
      throw new Error("yt-dlp não encontrado no servidor. Instale-o para processar URLs.");
    }

    // Fallback para áudio puro quando a plataforma não entrega stream de vídeo.
    try {
      await runCmd(ytdlpBin, audioFallbackArgs);
    } catch (fallbackError) {
      const fallbackStderr = String(fallbackError.stderr || "");
      throw new Error(`Falha ao baixar mídia da URL: ${fallbackStderr || stderr || fallbackError.message}`);
    }
  }

  const downloadedPath = await findByPrefix(importsDir, baseName);
  if (!downloadedPath) {
    throw new Error("Não foi possível localizar a mídia baixada da URL.");
  }
  return downloadedPath;
}

module.exports = { resolveContentAudio };
