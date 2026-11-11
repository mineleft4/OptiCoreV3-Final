/* ════════════════════════════════════════════════════════════════
   OptiCore — backend público (Node + MySQL)
   · Cuentas de usuario con contraseñas scrypt + sal
   · Sesiones con token Bearer (solo se guarda el hash del token)
   · Historial por perfil y recomendaciones aplicadas
   · CORS con lista blanca de orígenes (la web de Netlify)
   Las tablas se crean solas al arrancar.
   ════════════════════════════════════════════════════════════════ */
'use strict';

const http = require('http');
const crypto = require('crypto');
const mysql = require('mysql2/promise');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
const MAX_HISTORY = 400;
const BODY_LIMIT = 64 * 1024;
const MAX_ATTEMPTS = 10;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

const ALLOWED_ORIGINS = new Set(
  String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean)
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
const clampNum = (v, min, max, def = 0) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.round(n)));
};

/* ─────────────────────────── MySQL ─────────────────────────── */
function dbConfig() {
  const url = process.env.MYSQL_URL || process.env.DATABASE_URL;
  let cfg;
  if (url) {
    const u = new URL(url);
    cfg = {
      host: u.hostname,
      port: Number(u.port) || 3306,
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: decodeURIComponent(u.pathname.replace(/^\//, '')) || 'opticore'
    };
  } else {
    cfg = {
      host: process.env.MYSQLHOST || process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.MYSQLPORT || process.env.DB_PORT) || 3306,
      user: process.env.MYSQLUSER || process.env.DB_USER || 'root',
      password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || '',
      database: process.env.MYSQLDATABASE || process.env.DB_NAME || 'opticore'
    };
  }
  if (String(process.env.DB_SSL || '').toLowerCase() === 'true') {
    cfg.ssl = { rejectUnauthorized: false };
  }
  return Object.assign(cfg, {
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4',
    supportBigNumbers: true,
    bigNumberStrings: false,
    connectTimeout: 10000
  });
}

let pool = null;

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      username VARCHAR(24) NOT NULL,
      salt CHAR(32) NOT NULL,
      password_hash CHAR(128) NOT NULL,
      created_at BIGINT NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_users_username (username)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash CHAR(64) NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      created_at BIGINT NOT NULL,
      expires_at BIGINT NOT NULL,
      PRIMARY KEY (token_hash),
      KEY idx_sessions_user (user_id),
      KEY idx_sessions_exp (expires_at),
      CONSTRAINT fk_sessions_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS history (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      t BIGINT NOT NULL,
      cpu TINYINT UNSIGNED NOT NULL,
      ram TINYINT UNSIGNED NOT NULL,
      procs INT UNSIGNED NOT NULL,
      health TINYINT UNSIGNED NOT NULL,
      PRIMARY KEY (id),
      KEY idx_history_user_t (user_id, t),
      CONSTRAINT fk_history_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS applied (
      user_id BIGINT UNSIGNED NOT NULL,
      rec_id VARCHAR(120) NOT NULL,
      applied_at BIGINT NOT NULL,
      PRIMARY KEY (user_id, rec_id),
      CONSTRAINT fk_applied_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

/* ─────────────────────── Utilidades HTTP ────────────────────── */
const isLoopbackHost = (h) =>
  h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]';

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (origin === 'null') return true; // abrir la web desde file://
  const norm = String(origin).replace(/\/+$/, '');
  if (ALLOWED_ORIGINS.has(norm)) return true;
  try {
    return isLoopbackHost(new URL(norm).hostname);
  } catch {
    return false;
  }
}

function applyCors(req, res) {
  res.setHeader('Vary', 'Origin');
  const origin = req.headers.origin;
  if (!origin || !isAllowedOrigin(origin)) return;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '600');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
}

function sendJSON(res, code, obj) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        reject(new Error('too-large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve(null);
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        resolve(null);
      }
    });
    req.on('error', reject);
  });
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0].trim();
  return req.socket.remoteAddress || '?';
}

/* ───────────────────── Seguridad y sesiones ────────────────── */
const attempts = new Map();

function tooManyAttempts(ip) {
  const a = attempts.get(ip);
  if (!a) return false;
  if (Date.now() > a.reset) {
    attempts.delete(ip);
    return false;
  }
  return a.count >= MAX_ATTEMPTS;
}

function registerFailedAttempt(ip) {
  const now = Date.now();
  const a = attempts.get(ip) || { count: 0, reset: now + ATTEMPT_WINDOW_MS };
  a.count++;
  attempts.set(ip, a);
}

const clearAttempts = (ip) => attempts.delete(ip);

const validUsername = (v) => typeof v === 'string' && /^[A-Za-z0-9_.-]{3,24}$/.test(v);
const validPassword = (v) => typeof v === 'string' && v.length >= 4 && v.length <= 128;

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function safeEqualHex(a, b) {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function bearerToken(req) {
  const auth = req.headers.authorization || '';
  const m = auth.match(/^Bearer\s+([a-f0-9]{64})$/i);
  return m ? m[1] : null;
}

async function createSession(userId) {
  const raw = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  await pool.query(
    'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    [sha256(raw), userId, now, now + SESSION_MS]
  );
  return raw;
}

async function userFromRequest(req) {
  const token = bearerToken(req);
  if (!token) return null;
  const [rows] = await pool.query(
    `SELECT u.id, u.username, u.created_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?
      LIMIT 1`,
    [sha256(token), Date.now()]
  );
  return rows[0] || null;
}

async function cleanupSessions() {
  try {
    await pool.query('DELETE FROM sessions WHERE expires_at < ?', [Date.now()]);
  } catch { /* no es crítico */ }
}

async function appliedMap(userId) {
  const [rows] = await pool.query(
    'SELECT rec_id, applied_at FROM applied WHERE user_id = ?',
    [userId]
  );
  const map = {};
  for (const r of rows) map[r.rec_id] = Number(r.applied_at);
  return map;
}

/* ─────────────────────────── Rutas ─────────────────────────── */
async function handleApi(req, res, pathname) {
  let body = null;
  try {
    body = await readBody(req);
  } catch {
    return sendJSON(res, 413, { error: 'La petición es demasiado grande' });
  }
  const ip = clientIp(req);

  if (pathname === '/api/health' && req.method === 'GET') {
    try {
      await pool.query('SELECT 1');
      return sendJSON(res, 200, { ok: true, db: true, service: 'opticore-cloud' });
    } catch {
      return sendJSON(res, 503, { ok: false, db: false });
    }
  }

  if (pathname === '/api/register' && req.method === 'POST') {
    const username = body && typeof body.username === 'string' ? body.username.trim() : '';
    const password = body ? body.password : '';

    if (!validUsername(username) || !validPassword(password)) {
      return sendJSON(res, 400, {
        error: 'Usuario de 3-24 caracteres (letras, números, _ . -) y contraseña de al menos 4 caracteres.'
      });
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const now = Date.now();
    try {
      const [result] = await pool.query(
        'INSERT INTO users (username, salt, password_hash, created_at) VALUES (?, ?, ?, ?)',
        [username, salt, hashPassword(password, salt), now]
      );
      const token = await createSession(result.insertId);
      clearAttempts(ip);
      if (Math.random() < 0.05) cleanupSessions();
      return sendJSON(res, 200, { username, token, createdAt: now });
    } catch (err) {
      if (err && err.code === 'ER_DUP_ENTRY') {
        return sendJSON(res, 409, { error: 'Ese usuario ya existe. Prueba iniciar sesión.' });
      }
      throw err;
    }
  }

  if (pathname === '/api/login' && req.method === 'POST') {
    if (tooManyAttempts(ip)) {
      return sendJSON(res, 429, { error: 'Demasiados intentos. Espera unos minutos.' });
    }
    const username = body && typeof body.username === 'string' ? body.username.trim() : '';
    const password = body ? body.password : '';

    let ok = false;
    let row = null;
    if (validUsername(username) && validPassword(password)) {
      const [rows] = await pool.query(
        'SELECT id, username, salt, password_hash, created_at FROM users WHERE username = ? LIMIT 1',
        [username]
      );
      row = rows[0] || null;
      ok = !!row && safeEqualHex(hashPassword(password, row.salt), row.password_hash);
    }

    if (!ok) {
      registerFailedAttempt(ip);
      return sendJSON(res, 401, { error: 'Usuario o contraseña incorrectos.' });
    }

    const token = await createSession(row.id);
    clearAttempts(ip);
    if (Math.random() < 0.05) cleanupSessions();
    return sendJSON(res, 200, {
      username: row.username,
      token,
      createdAt: Number(row.created_at)
    });
  }

  if (pathname === '/api/logout' && req.method === 'POST') {
    const token = bearerToken(req);
    if (token) await pool.query('DELETE FROM sessions WHERE token_hash = ?', [sha256(token)]);
    return sendJSON(res, 200, { ok: true });
  }

  if (pathname === '/api/me' && req.method === 'GET') {
    const user = await userFromRequest(req);
    if (!user) return sendJSON(res, 200, { authenticated: false });
    const [rows] = await pool.query(
      'SELECT COUNT(*) AS n FROM applied WHERE user_id = ?',
      [user.id]
    );
    return sendJSON(res, 200, {
      username: user.username,
      createdAt: Number(user.created_at),
      appliedCount: Number(rows[0].n) || 0
    });
  }

  if (pathname === '/api/history') {
    const user = await userFromRequest(req);
    if (!user) return sendJSON(res, 401, { error: 'No autenticado' });

    if (req.method === 'GET') {
      const [rows] = await pool.query(
        'SELECT t, cpu, ram, procs, health FROM history WHERE user_id = ? ORDER BY t ASC, id ASC',
        [user.id]
      );
      const items = rows.map((r) => ({
        t: Number(r.t),
        cpu: Number(r.cpu),
        ram: Number(r.ram),
        procs: Number(r.procs),
        health: Number(r.health)
      }));
      return sendJSON(res, 200, { items });
    }

    if (req.method === 'POST') {
      if (!body || typeof body !== 'object') {
        return sendJSON(res, 400, { error: 'Datos inválidos' });
      }
      const item = {
        t: Math.round(clampNum(body.t, 0, Number.MAX_SAFE_INTEGER, Date.now())) || Date.now(),
        cpu: clampNum(body.cpu, 0, 100),
        ram: clampNum(body.ram, 0, 100),
        procs: clampNum(body.procs, 0, 100000),
        health: clampNum(body.health, 0, 100)
      };
      await pool.query(
        'INSERT INTO history (user_id, t, cpu, ram, procs, health) VALUES (?, ?, ?, ?, ?, ?)',
        [user.id, item.t, item.cpu, item.ram, item.procs, item.health]
      );

      const [cut] = await pool.query(
        'SELECT id FROM history WHERE user_id = ? ORDER BY id DESC LIMIT 1 OFFSET ?',
        [user.id, MAX_HISTORY - 1]
      );
      if (cut.length) {
        await pool.query('DELETE FROM history WHERE user_id = ? AND id < ?', [user.id, cut[0].id]);
      }

      const [count] = await pool.query(
        'SELECT COUNT(*) AS n FROM history WHERE user_id = ?',
        [user.id]
      );
      return sendJSON(res, 200, { ok: true, count: Number(count[0].n) || 0 });
    }

    if (req.method === 'DELETE') {
      await pool.query('DELETE FROM history WHERE user_id = ?', [user.id]);
      return sendJSON(res, 200, { ok: true });
    }
  }

  if (pathname === '/api/applied') {
    const user = await userFromRequest(req);
    if (!user) return sendJSON(res, 401, { error: 'No autenticado' });

    if (req.method === 'GET') {
      return sendJSON(res, 200, { applied: await appliedMap(user.id) });
    }

    if (req.method === 'POST') {
      const id = body && typeof body.id === 'string' ? body.id.slice(0, 120) : '';
      if (!id) return sendJSON(res, 400, { error: 'id inválido' });

      const [rows] = await pool.query(
        'SELECT 1 FROM applied WHERE user_id = ? AND rec_id = ? LIMIT 1',
        [user.id, id]
      );
      if (rows.length) {
        await pool.query('DELETE FROM applied WHERE user_id = ? AND rec_id = ?', [user.id, id]);
      } else {
        await pool.query(
          'INSERT INTO applied (user_id, rec_id, applied_at) VALUES (?, ?, ?)',
          [user.id, id, Date.now()]
        );
      }
      return sendJSON(res, 200, { applied: await appliedMap(user.id) });
    }
  }

  return sendJSON(res, 404, { error: 'Ruta no encontrada' });
}

/* ─────────────────────────── Servidor ──────────────────────── */
const server = http.createServer(async (req, res) => {
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    const origin = req.headers.origin;
    res.writeHead(!origin || isAllowedOrigin(origin) ? 204 : 403);
    return res.end();
  }

  let pathname = '/';
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch { /* usar '/' */ }

  if (!pathname.startsWith('/api/')) {
    return sendJSON(res, 200, {
      ok: true,
      service: 'opticore-cloud',
      message: 'Backend de OptiCore. Usa /api/health para comprobar el estado.'
    });
  }

  const origin = req.headers.origin;
  if (origin && !isAllowedOrigin(origin)) {
    return sendJSON(res, 403, { error: 'Origen no autorizado' });
  }

  try {
    return await handleApi(req, res, pathname);
  } catch (err) {
    console.error('✖ Error:', err && err.message ? err.message : err);
    try {
      sendJSON(res, 500, { error: 'Error interno del servidor' });
    } catch { /* respuesta ya cerrada */ }
  }
});

async function main() {
  pool = mysql.createPool(dbConfig());

  let connected = false;
  for (let i = 1; i <= 20; i++) {
    try {
      await pool.query('SELECT 1');
      await ensureSchema();
      connected = true;
      break;
    } catch (err) {
      if (i === 20) {
        console.error('✖ No se pudo conectar con MySQL:', err.message);
        process.exit(1);
      }
      console.log(`⏳ MySQL aún no responde (intento ${i}/20): ${err.code || err.message}`);
      await sleep(2000);
    }
  }

  if (!connected) process.exit(1);

  server.listen(PORT, HOST, () => {
    console.log('');
    console.log('  ☁️  OptiCore — backend público');
    console.log('  ─────────────────────────────────────────');
    console.log('  → Escuchando en ' + HOST + ':' + PORT);
    console.log('  → MySQL conectado y tablas listas');
    console.log('  → Orígenes web autorizados: ' +
      (ALLOWED_ORIGINS.size ? Array.from(ALLOWED_ORIGINS).join(', ') : '(solo localhost)'));
    console.log('  → Detén el backend con Ctrl + C');
    console.log('');
  });

  setInterval(cleanupSessions, 60 * 60 * 1000).unref();

  const shutdown = () => {
    server.close(async () => {
      try { await pool.end(); } catch { /* ya cerrado */ }
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('✖ Error fatal:', err && err.message ? err.message : err);
  process.exit(1);
});
