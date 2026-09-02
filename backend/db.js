const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

if (!process.env.DATABASE_URL) {
  console.error('[db] DATABASE_URL is not set. Add it in your Vercel/host environment variables.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('supabase')
    ? { rejectUnauthorized: false }
    : undefined,
  max: 5,
});

// ── SQLite-shaped compatibility layer ──────────────────────────────────────
// The route files were originally written against node:sqlite's synchronous
// `db.prepare(sql).get/all/run(...)` API using `?` placeholders. Postgres is
// async and uses `$1, $2, ...` placeholders, so this shim translates one into
// the other. Every call site now needs `await`, but the SQL strings and call
// shape stay almost identical, which keeps the route files easy to follow.

function toPositional(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// INSERT statements relied on SQLite's `lastInsertRowid`. Postgres has no
// equivalent, so we auto-append `RETURNING id` to INSERT statements that
// don't already return something, and surface it as `lastInsertRowid`.
function withReturning(sql) {
  const trimmed = sql.trim();
  const isInsert = /^insert\s/i.test(trimmed);
  const hasReturning = /returning/i.test(trimmed);
  if (isInsert && !hasReturning) {
    return trimmed.replace(/;\s*$/, '') + ' RETURNING id';
  }
  return sql;
}

// Postgres' unique_violation error code is '23505' (SQLite threw a message
// containing 'UNIQUE'). Route files check `err.message.includes('UNIQUE')`;
// this normalizes Postgres errors so those checks keep working unchanged.
function normalizeErrors(err) {
  // Postgres' message already says "...violates unique constraint..." but in
  // lowercase, and route files check for the uppercase substring 'UNIQUE'
  // (matching node:sqlite's error format) — so always prefix it here rather
  // than only when the word is entirely absent.
  if (err && err.code === '23505') {
    err.message = `UNIQUE constraint failed: ${err.message}`;
  }
  throw err;
}

function prepare(sql) {
  const selectSql = toPositional(sql);
  const runSql = toPositional(withReturning(sql));

  return {
    async get(...params) {
      try {
        const { rows } = await pool.query(selectSql, params);
        return rows[0];
      } catch (err) {
        normalizeErrors(err);
      }
    },
    async all(...params) {
      try {
        const { rows } = await pool.query(selectSql, params);
        return rows;
      } catch (err) {
        normalizeErrors(err);
      }
    },
    async run(...params) {
      try {
        const result = await pool.query(runSql, params);
        return {
          lastInsertRowid: result.rows[0] ? result.rows[0].id : undefined,
          changes: result.rowCount,
        };
      } catch (err) {
        normalizeErrors(err);
      }
    },
  };
}

// ── Schema (Postgres) ───────────────────────────────────────────────────────

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer' CHECK(role IN ('admin', 'viewer')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS assets (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    manufacturer TEXT,
    model TEXT,
    serial_number TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'maintenance', 'retired')),
    location TEXT,
    ip_address TEXT,
    mac_address TEXT,
    purchased_at TEXT,
    warranty_expires TEXT,
    purchase_price REAL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS assignments (
    id SERIAL PRIMARY KEY,
    asset_id INTEGER NOT NULL REFERENCES assets(id),
    assigned_to TEXT NOT NULL,
    department TEXT,
    assigned_by INTEGER NOT NULL REFERENCES users(id),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    returned_at TIMESTAMPTZ,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER,
    details TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS audit_schedules (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    tenure TEXT NOT NULL CHECK(tenure IN ('quarterly', 'half-yearly', 'annually')),
    start_date TEXT NOT NULL,
    due_date TEXT NOT NULL,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS physical_audits (
    id SERIAL PRIMARY KEY,
    schedule_id INTEGER NOT NULL REFERENCES audit_schedules(id),
    asset_id INTEGER NOT NULL REFERENCES assets(id),
    submitted_by INTEGER REFERENCES users(id),
    submitted_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'submitted', 'approved', 'rejected')),
    notes TEXT,
    reviewed_by INTEGER REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT
  );

  CREATE TABLE IF NOT EXISTS audit_photos (
    id SERIAL PRIMARY KEY,
    physical_audit_id INTEGER NOT NULL REFERENCES physical_audits(id),
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- Employee self-service audit links: a no-login, token-based way for a
  -- named employee to upload a fixed checklist of photos for their own
  -- asset (generated in bulk by an admin from the Audit Links page).
  CREATE TABLE IF NOT EXISTS audit_links (
    id SERIAL PRIMARY KEY,
    token TEXT UNIQUE NOT NULL,
    person_name TEXT NOT NULL,
    asset_id INTEGER REFERENCES assets(id),
    condition_category TEXT CHECK(condition_category IN ('Good', 'Fair', 'Poor', 'Damaged')),
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'submitted')),
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    submitted_at TIMESTAMPTZ
  );

  CREATE TABLE IF NOT EXISTS audit_link_photos (
    id SERIAL PRIMARY KEY,
    audit_link_id INTEGER NOT NULL REFERENCES audit_links(id),
    category TEXT NOT NULL CHECK(category IN ('front_screen', 'keyboard_trackpad', 'back_panel', 'sides_ports', 'charger_cable', 'visible_damage')),
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

let initPromise = null;

// Vercel serverless functions are stateless between cold starts, so we can't
// run this once "at import time" the way the old sqlite file did — instead
// every request calls ensureInitialized(), which only actually does the work
// once per warm instance (and CREATE TABLE IF NOT EXISTS makes repeats safe
// across instances too).
async function ensureInitialized() {
  if (!initPromise) {
    initPromise = (async () => {
      await pool.query(SCHEMA_SQL);
      const existingAdmin = await prepare('SELECT id FROM users WHERE role = ?').get('admin');
      if (!existingAdmin) {
        const hash = bcrypt.hashSync('admin123', 10);
        await prepare(`
          INSERT INTO users (username, password_hash, full_name, role)
          VALUES (?, ?, ?, ?)
        `).run('admin', hash, 'System Administrator', 'admin');
        console.log('Default admin created: username=admin, password=admin123');
      }
    })().catch((err) => {
      initPromise = null; // allow retry on next request if init failed
      throw err;
    });
  }
  return initPromise;
}

module.exports = { prepare, pool, ensureInitialized };
