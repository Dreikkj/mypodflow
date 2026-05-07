const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

function runCommand(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${cmd} falhou: ${stderr.slice(-500)}`));
      } else {
        resolve();
      }
    });
  });
}

function runCommandCapture(cmd, args) {
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

function secondsToTime(v) {
  const total = Math.max(0, Math.floor(Number(v || 0)));
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

async function probeInput(inputPath) {
  const { stdout } = await runCommandCapture("ffprobe", [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_streams",
    inputPath,
  ]);
  const parsed = JSON.parse(stdout || "{}");
  const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
  const video = streams.find((s) => s.codec_type === "video");
  return {
    hasVideo: Boolean(video),
    width: Number(video?.width || 0),
    height: Number(video?.height || 0),
  };
}

function escSrt(text) {
  return String(text || "")
    .replace(/-->/g, "->")
    .replace(/\r/g, " ")
    .replace(/\n+/g, " ")
    .trim();
}

function timeSrt(sec) {
  const v = Math.max(0, Number(sec || 0));
  const h = String(Math.floor(v / 3600)).padStart(2, "0");
  const m = String(Math.floor((v % 3600) / 60)).padStart(2, "0");
  const s = String(Math.floor(v % 60)).padStart(2, "0");
  const ms = String(Math.floor((v % 1) * 1000)).padStart(3, "0");
  return `${h}:${m}:${s},${ms}`;
}

function buildSrtForClip({ transcriptSegments = [], startSeconds, endSeconds }) {
  const start = Number(startSeconds || 0);
  const end = Number(endSeconds || 0);
  const lines = [];
  let idx = 1;
  for (const seg of transcriptSegments) {
    const segStart = Number(seg?.start);
    const segEnd = Number(seg?.end);
    const text = escSrt(seg?.text || "");
    if (!Number.isFinite(segStart) || !Number.isFinite(segEnd) || !text) continue;
    if (segEnd <= start || segStart >= end) continue;
    const clipStart = Math.max(0, segStart - start);
    const clipEnd = Math.max(clipStart + 0.4, Math.min(end, segEnd) - start);
    lines.push(`${idx}`);
    lines.push(`${timeSrt(clipStart)} --> ${timeSrt(clipEnd)}`);
    lines.push(text);
    lines.push("");
    idx += 1;
  }
  return lines.join("\n");
}

function buildVideoFilter({ hasVideo, width, height, subtitlePath, burnCaption, generateCaptions }) {
  if (!hasVideo) return null;
  const baseVertical = height > width;
  let chain = "";
  if (baseVertical) {
    chain =
      "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,format=yuv420p[v0]";
  } else {
    chain =
      "[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,split=2[fg][tmp];" +
      "[tmp]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=18:10[bg];" +
      "[bg][fg]overlay=(W-w)/2:(H-h)/2,format=yuv420p[v0]";
  }
  if (generateCaptions) {
    const safeSub = subtitlePath.replace(/\\/g, "/").replace(/:/g, "\\:");
    chain += `;[v0]subtitles='${safeSub}':force_style='FontName=Inter,FontSize=14,PrimaryColour=&H00FFFFFF,OutlineColour=&H00101010,BorderStyle=1,Outline=2,Shadow=0,Alignment=2,MarginV=80'[v1]`;
  } else {
    chain += ";[v0]null[v1]";
  }
  if (burnCaption) {
    const cap = String(burnCaption).replace(/[:'\\]/g, "").slice(0, 100);
    chain += `;[v1]drawtext=text='${cap}':fontcolor=white:fontsize=52:x=(w-text_w)/2:y=130:box=1:boxcolor=black@0.35:boxborderw=14[vout]`;
  } else {
    chain += ";[v1]null[vout]";
  }
  return chain;
}

async function generateShortClip({
  inputPath,
  outputDir,
  titlePrefix,
  startSeconds,
  endSeconds,
  index,
  burnCaption,
  transcriptSegments = [],
  generateCaptions = true,
}) {
  fs.mkdirSync(outputDir, { recursive: true });
  const safeIndex = String(index).padStart(2, "0");
  const outputPath = path.join(outputDir, `${titlePrefix}-${safeIndex}.mp4`);
  const duration = Math.max(1, Math.min(90, Number(endSeconds) - Number(startSeconds)));
  const endReal = Number(startSeconds) + duration;
  const probe = await probeInput(inputPath);
  if (!probe.hasVideo) {
    const err = new Error("Este conteúdo gerou cortes sugeridos, mas não foi possível criar MP4 porque o arquivo original não contém vídeo.");
    err.code = "NO_VIDEO_STREAM";
    throw err;
  }

  const srtPath = path.join(os.tmpdir(), `mpf-${titlePrefix}-${safeIndex}.srt`);
  const srt = buildSrtForClip({ transcriptSegments, startSeconds: Number(startSeconds), endSeconds: endReal });
  fs.writeFileSync(srtPath, srt || "1\n00:00:00,000 --> 00:00:01,000\n\n");

  const filterComplex = buildVideoFilter({
    hasVideo: probe.hasVideo,
    width: probe.width,
    height: probe.height,
    subtitlePath: srtPath,
    burnCaption: burnCaption || "",
    generateCaptions: Boolean(generateCaptions),
  });
  try {
    await runCommand("ffmpeg", [
      "-y",
      "-ss",
      String(startSeconds),
      "-t",
      String(duration),
      "-i",
      inputPath,
      "-filter_complex",
      filterComplex,
      "-map",
      "[vout]",
      "-map",
      "0:a?",
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "21",
      "-r",
      "30",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      outputPath,
    ]);
  } finally {
    fs.unlink(srtPath, () => {});
  }

  return {
    outputPath,
    startTime: secondsToTime(startSeconds),
    endTime: secondsToTime(endReal),
    durationSeconds: duration,
  };
}

module.exports = { generateShortClip, secondsToTime };
