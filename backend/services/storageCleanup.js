const fs = require("fs/promises");
const path = require("path");

async function walkFiles(dir) {
  const out = [];
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (_e) {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await walkFiles(full);
      out.push(...nested);
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

async function removeOldFiles(rootDir, maxAgeMs) {
  const now = Date.now();
  const files = await walkFiles(rootDir);
  let removed = 0;
  for (const filePath of files) {
    try {
      const st = await fs.stat(filePath);
      if (now - st.mtimeMs > maxAgeMs) {
        await fs.unlink(filePath);
        removed += 1;
      }
    } catch (_e) {}
  }
  return removed;
}

function startStorageCleanup(baseUploadsDir) {
  const enabled = String(process.env.ENABLE_STORAGE_CLEANUP || "1") !== "0";
  if (!enabled) return;

  const run = async () => {
    try {
      const urlImports = path.join(baseUploadsDir, "url-imports");
      const tempDir = path.join(baseUploadsDir, "temp");
      const removedImports = await removeOldFiles(urlImports, 24 * 60 * 60 * 1000);
      const removedTemp = await removeOldFiles(tempDir, 12 * 60 * 60 * 1000);
      if (removedImports || removedTemp) {
        console.log(`[STORAGE_CLEANUP] removed url-imports=${removedImports} temp=${removedTemp}`);
      }
    } catch (e) {
      console.error("[STORAGE_CLEANUP]", e.message);
    }
  };

  run();
  setInterval(run, 60 * 60 * 1000).unref();
}

module.exports = { startStorageCleanup };
