/**
 * podcast.ai — Database Configuration
 * Criado por Eslem Marques
 * © 2026 podcast.ai
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../database.sqlite');
let db;

function getDB() {
  if (!db) throw new Error('Database not initialized');
  return db;
}

async function initDB() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(DB_PATH, async (err) => {
      if (err) { console.error('DB Error:', err); return reject(err); }
      console.log('✓ Database connected:', DB_PATH);
      db.run('PRAGMA journal_mode=WAL');
      db.run('PRAGMA foreign_keys=ON');
      db.run('PRAGMA synchronous=NORMAL');
      await createTables();
      resolve();
    });
  });
}

async function createTables() {
  const tables = [
    // Plans
    `CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      price_cents INTEGER NOT NULL,
      monthly_minutes INTEGER NOT NULL,
      monthly_shorts INTEGER NOT NULL,
      extra_minute_price_cents INTEGER NOT NULL DEFAULT 0,
      extra_short_price_cents INTEGER NOT NULL DEFAULT 0,
      has_instagram INTEGER DEFAULT 0,
      has_integrations TEXT DEFAULT 'none',
      support_level TEXT DEFAULT 'normal',
      is_highlighted INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    )`,

    // Users
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      plan_id TEXT DEFAULT 'free' REFERENCES plans(id),
      is_admin INTEGER DEFAULT 0,
      is_blocked INTEGER DEFAULT 0,
      free_minutes_used REAL DEFAULT 0,
      email_verified INTEGER DEFAULT 0,
      verification_token TEXT,
      reset_token TEXT,
      reset_token_expires INTEGER,
      avatar_url TEXT,
      podcast_name TEXT,
      bio TEXT,
      default_tone TEXT DEFAULT 'professional',
      default_language TEXT DEFAULT 'pt-BR',
      notify_content_ready INTEGER DEFAULT 1,
      notify_limit_warning INTEGER DEFAULT 1,
      notify_payment INTEGER DEFAULT 1,
      notify_news INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      updated_at INTEGER DEFAULT (strftime('%s','now'))
    )`,

    // Subscriptions
    `CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan_id TEXT NOT NULL REFERENCES plans(id),
      status TEXT DEFAULT 'active',
      started_at INTEGER NOT NULL,
      renews_at INTEGER,
      canceled_at INTEGER,
      payment_provider TEXT DEFAULT 'mock',
      payment_provider_id TEXT,
      last4 TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      updated_at INTEGER DEFAULT (strftime('%s','now'))
    )`,

    // Monthly usage
    `CREATE TABLE IF NOT EXISTS usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      month TEXT NOT NULL,
      minutes_used REAL DEFAULT 0,
      shorts_used INTEGER DEFAULT 0,
      extra_minutes REAL DEFAULT 0,
      extra_shorts INTEGER DEFAULT 0,
      extra_cost_cents INTEGER DEFAULT 0,
      UNIQUE(user_id, month)
    )`,

    // Contents
    `CREATE TABLE IF NOT EXISTS contents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT,
      source_type TEXT NOT NULL,
      source_url TEXT,
      file_path TEXT,
      file_name TEXT,
      duration_seconds REAL DEFAULT 0,
      language TEXT DEFAULT 'pt-BR',
      tone TEXT DEFAULT 'professional',
      status TEXT DEFAULT 'pending',
      progress INTEGER DEFAULT 0,
      status_message TEXT,
      error_message TEXT,
      generate_captions INTEGER DEFAULT 1,
      formats_requested TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      updated_at INTEGER DEFAULT (strftime('%s','now'))
    )`,

    // Transcriptions
    `CREATE TABLE IF NOT EXISTS transcriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_id INTEGER NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
      raw_text TEXT,
      cleaned_text TEXT,
      insights TEXT,
      language TEXT DEFAULT 'pt-BR',
      whisper_model TEXT DEFAULT 'whisper-1',
      created_at INTEGER DEFAULT (strftime('%s','now'))
    )`,

    // Outputs
    `CREATE TABLE IF NOT EXISTS outputs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_id INTEGER NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      word_count INTEGER DEFAULT 0,
      has_watermark INTEGER DEFAULT 0,
      copy_count INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    )`,

    // Shorts
    `CREATE TABLE IF NOT EXISTS shorts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_id INTEGER NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT,
      hook_text TEXT,
      start_time TEXT,
      end_time TEXT,
      description TEXT,
      caption TEXT,
      screen_text TEXT,
      file_path TEXT,
      duration_seconds REAL DEFAULT 0,
      has_watermark INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    )`,

    // Payments
    `CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount_cents INTEGER NOT NULL,
      type TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      provider TEXT DEFAULT 'mock',
      provider_payment_id TEXT,
      description TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    )`,

    // Logs
    `CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      ip TEXT,
      user_agent TEXT,
      metadata TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    )`,

    // Support
    `CREATE TABLE IF NOT EXISTS support_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      subject TEXT,
      message TEXT NOT NULL,
      status TEXT DEFAULT 'open',
      created_at INTEGER DEFAULT (strftime('%s','now'))
    )`,
  ];

  for (const sql of tables) {
    await run(sql);
  }
  await run("ALTER TABLE shorts ADD COLUMN file_path TEXT").catch(() => {});
  await run("ALTER TABLE shorts ADD COLUMN duration_seconds REAL DEFAULT 0").catch(() => {});
  await run("ALTER TABLE shorts ADD COLUMN hook_text TEXT").catch(() => {});
  await run("ALTER TABLE contents ADD COLUMN generate_captions INTEGER DEFAULT 1").catch(() => {});
  // Users: plan lifecycle & PIX manual approval (safe ALTER — ignores duplicate column)
  await run("ALTER TABLE users ADD COLUMN plan_status TEXT DEFAULT 'free'").catch(() => {});
  await run("ALTER TABLE users ADD COLUMN plan_updated_at INTEGER").catch(() => {});
  await run("ALTER TABLE users ADD COLUMN pix_approved_at INTEGER").catch(() => {});
  await run("ALTER TABLE users ADD COLUMN pix_approved_by INTEGER").catch(() => {});
  await run("ALTER TABLE users ADD COLUMN plan_previous_id TEXT").catch(() => {});
  await run("ALTER TABLE users ADD COLUMN plan_started_at INTEGER").catch(() => {});
  await run("ALTER TABLE users ADD COLUMN plan_expires_at INTEGER").catch(() => {});
  await run("ALTER TABLE payments ADD COLUMN approved_at INTEGER").catch(() => {});
  await run("ALTER TABLE payments ADD COLUMN approved_by_admin_id INTEGER").catch(() => {});
  console.log('✓ Database tables ready');
}

// Helpers
function run(sql, params = []) {
  return new Promise((res, rej) => getDB().run(sql, params, function(err) { err ? rej(err) : res({ id: this.lastID, changes: this.changes }); }));
}
function get(sql, params = []) {
  return new Promise((res, rej) => getDB().get(sql, params, (err, row) => err ? rej(err) : res(row)));
}
function all(sql, params = []) {
  return new Promise((res, rej) => getDB().all(sql, params, (err, rows) => err ? rej(err) : res(rows)));
}

module.exports = { initDB, getDB, run, get, all };
