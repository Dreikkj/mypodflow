const router = require("express").Router();
const path = require("path");
const { get, run, all } = require("../config/database");
const { authMiddleware } = require("../middleware/auth");
const { transcribeAudio, generateStructuredContent } = require("../services/openai");
const { generateShortClip } = require("../services/ffmpeg");
const { resolveContentAudio } = require("../services/sourceResolver");

async function saveOutputs(contentId, userId, generated, transcript) {
  const outputs = [
    ["blog", generated.blog || ""],
    ["thread", Array.isArray(generated.thread) ? generated.thread.join("\n\n") : String(generated.thread || "")],
    ["newsletter", generated.newsletter || ""],
    ["resumo", generated.resumo || ""],
    ["titulos", JSON.stringify(generated.titulos || [])],
    ["hooks", JSON.stringify(generated.hooks || [])],
    ["cortes", JSON.stringify(generated.cortes || [])],
    ["transcript", transcript || ""],
  ];

  for (const [type, content] of outputs) {
    await run(
      "INSERT INTO outputs (content_id,user_id,type,content,word_count,created_at) VALUES (?,?,?,?,?,strftime('%s','now'))",
      [contentId, userId, type, content, String(content).split(/\s+/).filter(Boolean).length]
    );
  }
}

async function generateShorts(content, cuts, transcriptSegments = [], generateCaptions = true) {
  if (!Array.isArray(cuts) || cuts.length === 0) return [];
  const shortsDir = path.join(__dirname, "../uploads/shorts", String(content.id));
  const created = [];

  for (let i = 0; i < Math.min(cuts.length, 10); i += 1) {
    const cut = cuts[i];
    const start = Number(cut.start_seconds);
    const end = Number(cut.end_seconds);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;

    const clip = await generateShortClip({
      inputPath: content.file_path,
      outputDir: shortsDir,
      titlePrefix: `short-${content.id}`,
      startSeconds: start,
      endSeconds: end,
      index: i + 1,
      burnCaption: cut.hook || cut.titulo || "",
      transcriptSegments,
      generateCaptions,
    });

    const relativePath = clip.outputPath.split("/uploads/")[1] ? `/uploads/${clip.outputPath.split("/uploads/")[1]}` : clip.outputPath;
    await run(
      `INSERT INTO shorts (content_id,user_id,title,hook_text,start_time,end_time,description,caption,screen_text,file_path,duration_seconds,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,strftime('%s','now'))`,
      [
        content.id,
        content.user_id,
        cut.titulo || `Short ${i + 1}`,
        cut.hook || "",
        clip.startTime,
        clip.endTime,
        cut.motivo || "",
        cut.legenda || "",
        cut.legenda || "",
        relativePath,
        clip.durationSeconds,
      ]
    );

    created.push({
      title: cut.titulo || `Short ${i + 1}`,
      hook: cut.hook || "",
      reason: cut.motivo || "",
      file_path: relativePath,
      public_url: relativePath,
      video_url: relativePath,
      start_time: clip.startTime,
      end_time: clip.endTime,
      caption: cut.legenda || "",
    });
  }
  return created;
}

async function processContent(content) {
  await run(
    "UPDATE contents SET status='processing', progress=10, status_message='Transcrevendo episódio...', updated_at=strftime('%s','now') WHERE id=?",
    [content.id]
  );

  if (!content.file_path && content.source_type === "url") {
    await run(
      "UPDATE contents SET progress=18, status_message='Baixando áudio da URL...', updated_at=strftime('%s','now') WHERE id=?",
      [content.id]
    );
    const resolvedPath = await resolveContentAudio(content);
    await run(
      "UPDATE contents SET file_path=?, updated_at=strftime('%s','now') WHERE id=?",
      [resolvedPath, content.id]
    );
    content.file_path = resolvedPath;
  }

  if (!content.file_path) {
    throw new Error("Nenhum arquivo de áudio disponível para processamento.");
  }

  let transcriptData;
  try {
    transcriptData = await transcribeAudio(content.file_path);
  } catch (error) {
    throw new Error(`Falha na transcrição OpenAI: ${error.message}`);
  }
  const transcript = transcriptData.text;
  await run(
    "INSERT INTO transcriptions (content_id,raw_text,cleaned_text,language,created_at) VALUES (?,?,?,?,strftime('%s','now'))",
    [content.id, transcript, transcript, "pt-BR"]
  );

  await run(
    "UPDATE contents SET progress=55, status_message='Gerando conteúdos com IA...', updated_at=strftime('%s','now') WHERE id=?",
    [content.id]
  );

  let generated;
  try {
    generated = await generateStructuredContent(transcript, content.title, transcriptData.segments);
  } catch (error) {
    throw new Error(`Falha ao gerar conteúdos com IA: ${error.message}`);
  }
  await saveOutputs(content.id, content.user_id, generated, transcript);
  await run(
    "UPDATE contents SET progress=78, status_message='Gerando shorts automáticos...', updated_at=strftime('%s','now') WHERE id=?",
    [content.id]
  );
  let shortsWarning = "";
  try {
    await generateShorts(content, generated.cortes, transcriptData.segments, Number(content.generate_captions ?? 1) === 1);
  } catch (error) {
    if (error.code === "NO_VIDEO_STREAM") {
      shortsWarning = "Shorts em vídeo não disponíveis para arquivos sem vídeo.";
    } else {
      throw new Error(`Falha ao gerar shorts no FFmpeg: ${error.message}`);
    }
  }

  if (shortsWarning) {
    await run(
      "UPDATE contents SET status='done', progress=100, status_message=?, error_message=?, updated_at=strftime('%s','now') WHERE id=?",
      ["Concluído com observação nos shorts", shortsWarning, content.id]
    );
  } else {
    await run(
      "UPDATE contents SET status='done', progress=100, status_message='Concluído', updated_at=strftime('%s','now') WHERE id=?",
      [content.id]
    );
  }
}

router.post("/start/:id", authMiddleware, async (req, res) => {
  try {
    const content = await get("SELECT * FROM contents WHERE id=? AND user_id=?", [req.params.id, req.user.id]);
    if (!content) return res.status(404).json({ error: "Conteúdo não encontrado." });
    if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: "OPENAI_API_KEY não configurada no servidor." });
    const inFlight = await get(
      "SELECT COUNT(*) AS n FROM contents WHERE user_id=? AND status='processing'",
      [req.user.id]
    );
    if (Number(inFlight?.n || 0) >= 2) {
      return res.status(429).json({ error: "Você já possui 2 processamentos em andamento. Aguarde concluir para iniciar novos." });
    }
    if (typeof req.body?.generate_captions !== "undefined") {
      const caps = String(req.body.generate_captions).toLowerCase();
      const parsed = caps === "false" || caps === "0" ? 0 : 1;
      await run("UPDATE contents SET generate_captions=?, updated_at=strftime('%s','now') WHERE id=?", [parsed, content.id]);
      content.generate_captions = parsed;
    }

    processContent(content).catch(async (error) => {
      console.error("[PROCESS_CONTENT]", error);
      await run(
        "UPDATE contents SET status='error', error_message=?, status_message='Erro no processamento', updated_at=strftime('%s','now') WHERE id=?",
        [error.message, content.id]
      );
    });

    res.json({ message: "Processamento iniciado." });
  } catch (error) {
    console.error("[PROCESS_START]", error);
    res.status(500).json({ error: "Erro ao iniciar processamento." });
  }
});

router.get("/status/:id", authMiddleware, async (req, res) => {
  const content = await get(
    "SELECT id,title,status,progress,status_message,error_message,created_at,updated_at FROM contents WHERE id=? AND user_id=?",
    [req.params.id, req.user.id]
  );
  if (!content) return res.status(404).json({ error: "Conteúdo não encontrado." });
  res.json({ content });
});

router.get("/result/:id", authMiddleware, async (req, res) => {
  const content = await get("SELECT * FROM contents WHERE id=? AND user_id=?", [req.params.id, req.user.id]);
  if (!content) return res.status(404).json({ error: "Conteúdo não encontrado." });
  const outputs = await all("SELECT type,content,word_count FROM outputs WHERE content_id=?", [content.id]);
  const outputMap = {};
  outputs.forEach((item) => {
    outputMap[item.type] = item;
  });
  const transcription = await get("SELECT raw_text,cleaned_text FROM transcriptions WHERE content_id=?", [content.id]);
  const shorts = await all(
    "SELECT id,title,hook_text,start_time,end_time,description,caption,file_path,duration_seconds FROM shorts WHERE content_id=? ORDER BY id ASC",
    [content.id]
  );
  const normalizedShorts = shorts.map((s) => ({
    ...s,
    public_url: s.file_path || null,
    video_url: s.file_path || null,
  }));
  res.json({ content, outputs: outputMap, transcription, shorts: normalizedShorts });
});

router.get("/history", authMiddleware, async (req, res) => {
  const contents = await all(
    "SELECT id,title,source_type,status,progress,status_message,error_message,created_at FROM contents WHERE user_id=? ORDER BY created_at DESC LIMIT 100",
    [req.user.id]
  );
  res.json({ contents });
});

module.exports = router;
