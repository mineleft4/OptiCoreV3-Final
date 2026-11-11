#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════
   OptiCore — server.js (agente local)
   Servidor local sin dependencias externas:
   · Sirve la página (estáticos) en http://127.0.0.1:8137
   · /api/snapshot  → CPU, RAM y PROCESOS REALES del sistema
   · /api/register|login|logout|me → cuentas de usuario (sesiones)
   · /api/history   → historial por perfil (archivo JSON)
   · /api/applied   → recomendaciones marcadas como aplicadas

   Dos formas de usarlo:
   1) Abrir la página que sirve este mismo agente (uso local clásico).
   2) Web publicada en Internet + este agente en el PC del visitante:
      la web detecta el agente en 127.0.0.1:8137 y lee sus datos reales.
      Para ello el agente permite CORS solo a los orígenes autorizados
      (localhost y los de agent.config.json / OPTICORE_ALLOWED_ORIGINS).

   Almacenamiento: carpeta ./data (users.json, sessions.json, history.json)
   ════════════════════════════════════════════════════════════════ */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');

/* ¿Se ejecuta como binario único (bun build --compile)? En ese caso los
   archivos viven en un sistema virtual de solo lectura (/$bunfs, B:\~BUN),
   así que la configuración y los datos se buscan junto al ejecutable. */
const PACKAGED = /\$bunfs|~BUN/i.test(__dirname) ||
  !/^(node|bun|nodejs)(\.exe)?$/i.test(path.basename(process.execPath));
/* Orígenes de la web autorizados, fijados al compilar el ejecutable
   (ver .github/workflows/build-agent.yml). */
const BUILD_ORIGINS = typeof __OPTICORE_ORIGINS__ !== 'undefined' ? String(__OPTICORE_ORIGINS__) : '';

const PORT = Number(process.env.PORT) || 8137;
const ROOT = PACKAGED ? path.dirname(process.execPath) : __dirname;
const DATA_DIR = path.join(ROOT, 'data');

/* ───────────────────── Configuración del agente ───────────────────
   · HOST: por defecto 127.0.0.1 (solo tu equipo). Usa 0.0.0.0 solo
     si quieres compartirlo en tu red local.
   · Orígenes permitidos para la web publicada: agent.config.json
     ({"allowedOrigins": ["https://tudominio.com"]}) o la variable
     OPTICORE_ALLOWED_ORIGINS="https://a.com,https://b.com".
     Los orígenes localhost/127.0.0.1 y file:// (null) siempre se
     permiten para poder probar en desarrollo.                        */
const AGENT_CONFIG = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'agent.config.json'), 'utf8')); }
  catch { return {}; }
})();
const HOST = process.env.HOST || '127.0.0.1';
/* Se suman: los de compilación + agent.config.json (junto al ejecutable)
   + la variable de entorno. Nunca se usa "*". */
const ALLOWED_ORIGINS = new Set(
  [
    BUILD_ORIGINS,
    process.env.OPTICORE_ALLOWED_ORIGINS || '',
    Array.isArray(AGENT_CONFIG.allowedOrigins) ? AGENT_CONFIG.allowedOrigins.join(',') : ''
  ].join(',').split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean)
);
const FILES = {
  users: path.join(DATA_DIR, 'users.json'),
  sessions: path.join(DATA_DIR, 'sessions.json'),
  history: path.join(DATA_DIR, 'history.json')
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

/* ─────────────────────────── Almacenamiento ─────────────────────── */
function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}
function writeJSON(file, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

const db = {
  users: readJSON(FILES.users, {}),
  sessions: readJSON(FILES.sessions, {}),
  history: readJSON(FILES.history, {})
};
function persist() {
  writeJSON(FILES.users, db.users);
  writeJSON(FILES.sessions, db.sessions);
  writeJSON(FILES.history, db.history);
}

/* ─────────────────────────── Utilidades ────────────────────────── */
const clampPct = (v) => Math.min(100, Math.max(0, Math.round(v * 10) / 10));
const clampNum = (v, min, max) => Math.min(max, Math.max(min, Number(v) || 0));

function sendJSON(res, code, obj) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(obj));
}

/* ─────────────────────── CORS del agente local ──────────────────
   Permite que una web publicada (otro origen) llame a la API del
   agente. Nunca se usa "*": se responde con el origen exacto para
   que un sitio no autorizado no pueda leer tus procesos.
   Chrome/Edge piden además permiso de "red privada" (PNA) al pasar
   de una web HTTPS a 127.0.0.1; se responde con la cabecera PNA.   */
function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (origin === 'null') return true;             // abrir index.html con file://
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1' ||
           hostname === '::1' || hostname === '[::1]';
  } catch { return false; }
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (!origin || !isAllowedOrigin(origin)) return;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '600');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Vary', 'Origin');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 64 * 1024) { reject(new Error('cuerpo demasiado grande')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve(null);
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { resolve(null); }
    });
    req.on('error', reject);
  });
}

/* ─────────────────────────── Sesiones y cuentas ────────────────── */
const SESSION_TTL_MS = 30 * 24 * 3600e3;

function createSession(username) {
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions[token] = { user: username, expires: Date.now() + SESSION_TTL_MS };
  persist();
  return token;
}
function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie',
    'opticore_session=' + token + '; HttpOnly; Path=/; SameSite=Lax; Max-Age=' + (SESSION_TTL_MS / 1000));
}
function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'opticore_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0');
}
function tokenFromRequest(req) {
  // 1) Token Bearer: funciona también cuando la web está publicada en
  //    otro dominio y las cookies de este agente no se enviarían.
  const auth = req.headers.authorization || '';
  const bearer = auth.match(/^Bearer\s+([a-f0-9]{64})$/i);
  if (bearer) return bearer[1];
  // 2) Cookie HttpOnly: uso local clásico (mismo origen).
  const m = (req.headers.cookie || '').match(/(?:^|;\s*)opticore_session=([a-f0-9]+)/);
  return m ? m[1] : null;
}
function userFromRequest(req) {
  const token = tokenFromRequest(req);
  if (!token) return null;
  const s = db.sessions[token];
  if (!s) return null;
  if (Date.now() > s.expires) { delete db.sessions[token]; persist(); return null; }
  return s.user;
}

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString('hex');
}
const validUsername = (u) => typeof u === 'string' && /^[A-Za-z0-9_.-]{3,24}$/.test(u);
const validPassword = (p) => typeof p === 'string' && p.length >= 4 && p.length <= 128;

/* Límite simple de intentos de login por IP */
const attempts = new Map();
function tooManyAttempts(ip) {
  const now = Date.now();
  const a = attempts.get(ip) || { count: 0, reset: now + 10 * 60e3 };
  if (now > a.reset) { a.count = 0; a.reset = now + 10 * 60e3; }
  attempts.set(ip, a);
  return a.count >= 15;
}
function registerFailedAttempt(ip) {
  const now = Date.now();
  const a = attempts.get(ip) || { count: 0, reset: now + 10 * 60e3 };
  a.count++;
  attempts.set(ip, a);
}

/* ═══════════════════════ Muestreo del sistema ═══════════════════════
   CPU total y RAM se leen con el módulo `os` (y /proc/meminfo en Linux).
   Los procesos se muestrean con `ps` (Linux/macOS) o PowerShell
   (Windows); el % de CPU por proceso se calcula con deltas entre
   muestras consecutivas → valores EN TIEMPO REAL.                     */
const PLATFORM = os.platform();           // win32 | linux | darwin
const CORES = os.cpus().length;

const execFileP = (cmd, args) => new Promise((resolve, reject) => {
  execFile(cmd, args, { timeout: 6000, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
    (err, stdout) => (err ? reject(err) : resolve(stdout)));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cpuTimes() {
  let idle = 0, total = 0;
  for (const c of os.cpus()) {
    const t = c.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  }
  return { idle, total };
}

let prevSample = null;   // { ts, cpuTimes, cpuSeconds: Map<pid,seg> }
let lastSnapshot = null; // último resultado para repetir mientras se muestrea
let sampling = false;

async function machineCpuPct() {
  let first = prevSample ? prevSample.cpuTimes : null;
  if (!first) { first = cpuTimes(); await sleep(300); }
  const now = cpuTimes();
  const dTotal = now.total - first.total;
  const dIdle = now.idle - first.idle;
  const cpu = dTotal > 0 ? clampPct((dTotal - dIdle) / dTotal * 100) : null;
  return { cpu, times: now };
}

function memoryInfo() {
  let total = os.totalmem(), free = os.freemem();
  if (PLATFORM === 'linux') {
    try {
      const info = fs.readFileSync('/proc/meminfo', 'utf8');
      const getKB = (k) => {
        const m = info.match(new RegExp('^' + k + ':\\s+(\\d+) kB', 'm'));
        return m ? Number(m[1]) * 1024 : null;
      };
      const t = getKB('MemTotal');
      const avail = getKB('MemAvailable') != null ? getKB('MemAvailable') : getKB('MemFree');
      if (t && avail != null) { total = t; free = avail; }
    } catch { /* fallback a os.* */ }
  }
  const used = Math.max(0, total - free);
  return { totalMB: total / 1048576, usedMB: used / 1048576, pct: clampPct(used / total * 100) };
}

/* "MM:SS", "HH:MM:SS" o "DD-HH:MM:SS" → segundos */
function parseTimeToSeconds(s) {
  if (!s) return 0;
  let days = 0, rest = String(s);
  const dash = rest.split('-');
  if (dash.length === 2) { days = Number(dash[0]) || 0; rest = dash[1]; }
  const hms = rest.split(':').map(Number);
  let sec = 0;
  if (hms.length === 3) sec = hms[0] * 3600 + hms[1] * 60 + hms[2];
  else if (hms.length === 2) sec = hms[0] * 60 + hms[1];
  return days * 86400 + sec || 0;
}

const basename = (p) => String(p || '').split(/[\\/]/).pop() || 'proceso';

async function sampleUnix() {
  const out = await execFileP('ps', ['-axo', 'pid,time,rss,user,comm']);
  const procs = [];
  for (const line of out.split('\n').slice(1)) {
    const t = line.trim().split(/\s+/);
    if (t.length < 5) continue;
    const pid = Number(t[0]);
    if (!Number.isFinite(pid)) continue;
    procs.push({
      pid,
      name: basename(t.slice(4).join(' ')),
      cpuSeconds: parseTimeToSeconds(t[1]),
      memMB: (Number(t[2]) || 0) / 1024,
      user: t[3]
    });
  }
  return procs;
}

async function sampleWindows() {
  try {
    const out = await execFileP('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      'Get-Process | Select-Object Id,ProcessName,CPU,WorkingSet64 | ConvertTo-Json -Compress']);
    const data = JSON.parse(out);
    const arr = Array.isArray(data) ? data : [data];
    return arr.map((p) => ({
      pid: p.Id,
      name: p.ProcessName || 'proceso',
      cpuSeconds: typeof p.CPU === 'number' ? p.CPU : null,
      memMB: (p.WorkingSet64 || 0) / 1048576,
      user: null
    }));
  } catch {
    // Plan B: tasklist (sin CPU por proceso, pero con memoria)
    const out = await execFileP('tasklist', ['/fo', 'csv', '/nh']);
    const procs = [];
    for (const line of out.split('\n')) {
      const cols = (line.match(/"([^"]*)"/g) || []).map((c) => c.slice(1, -1));
      if (cols.length < 5) continue;
      const pid = Number(cols[1]);
      if (!Number.isFinite(pid)) continue;
      procs.push({
        pid,
        name: String(cols[0]).replace(/\.exe$/i, ''),
        cpuSeconds: null,
        memMB: (Number(String(cols[4]).replace(/[^\d]/g, '')) || 0) / 1024,
        user: null
      });
    }
    return procs;
  }
}

async function buildSnapshot() {
  if (sampling) return lastSnapshot;
  sampling = true;
  try {
    const raw = await (PLATFORM === 'win32' ? sampleWindows() : sampleUnix()).catch(() => null);
    const mem = memoryInfo();
    const cpuRes = await machineCpuPct();
    const now = Date.now();

    let processes = [];
    let processCount = 0;
    if (raw && raw.length) {
      processCount = raw.length;
      const prev = prevSample;
      const wallSec = prev ? Math.max((now - prev.ts) / 1000, 0.2) : null;
      processes = raw.map((p) => {
        let cpu = 0;
        if (wallSec && prev && p.cpuSeconds != null) {
          const before = prev.cpuSeconds.get(p.pid);
          if (before != null) cpu = clampPct((p.cpuSeconds - before) / wallSec * 100 / CORES);
        }
        return { pid: p.pid, name: p.name, cpu, memMB: Math.round(p.memMB), user: p.user || null };
      }).sort((a, b) => b.cpu - a.cpu || b.memMB - a.memMB).slice(0, 80);
    }
    prevSample = {
      ts: now,
      cpuTimes: cpuRes.times,
      cpuSeconds: new Map(raw ? raw.filter((p) => p.cpuSeconds != null).map((p) => [p.pid, p.cpuSeconds]) : [])
    };
    lastSnapshot = {
      ok: true,
      platform: PLATFORM,
      osType: os.type(),
      osRelease: os.release(),
      host: os.hostname(),
      cores: CORES,
      cpu: cpuRes.cpu != null ? cpuRes.cpu : (lastSnapshot ? lastSnapshot.cpu : 0),
      ramTotalMB: Math.round(mem.totalMB),
      ramUsedMB: Math.round(mem.usedMB),
      ramPct: Math.round(mem.pct),
      uptimeMs: Math.round(os.uptime() * 1000),
      processes,
      processCount,
      ts: now
    };
    return lastSnapshot;
  } finally {
    sampling = false;
  }
}

/* ─────────────────────────── Rutas de la API ────────────────────── */
async function handleApi(req, res, pathname) {
  const body = await readBody(req).catch(() => null);
  const user = userFromRequest(req);
  const ip = req.socket.remoteAddress || '?';

  if (pathname === '/api/status') {
    return sendJSON(res, 200, {
      ok: true,
      agent: true,
      version: 2,
      platform: PLATFORM, osType: os.type(), osRelease: os.release(),
      host: os.hostname(), cores: CORES, ramTotalMB: Math.round(os.totalmem() / 1048576)
    });
  }

  if (pathname === '/api/snapshot') {
    const snap = await buildSnapshot();
    return sendJSON(res, 200, snap);
  }

  /* El ejecutable descargado solo mide el equipo: las cuentas, el perfil y
     el historial viven en la API en la nube (MySQL), no en este PC. */
  if (PACKAGED && pathname !== '/api/status' && pathname !== '/api/snapshot') {
    return sendJSON(res, 404, { error: 'Ruta no encontrada' });
  }

  if (pathname === '/api/register' && req.method === 'POST') {
    if (!body || !validUsername(body.username) || !validPassword(body.password)) {
      return sendJSON(res, 400, {
        error: 'Usuario de 3-24 caracteres (letras, números, _ . -) y contraseña de al menos 4 caracteres.'
      });
    }
    if (db.users[body.username]) {
      return sendJSON(res, 409, { error: 'Ese usuario ya existe. Prueba iniciar sesión.' });
    }
    const salt = crypto.randomBytes(16).toString('hex');
    db.users[body.username] = { salt, hash: hashPassword(body.password, salt), createdAt: Date.now(), applied: {} };
    persist();
    const token = createSession(body.username);
    setSessionCookie(res, token);
    return sendJSON(res, 200, { username: body.username, token });
  }

  if (pathname === '/api/login' && req.method === 'POST') {
    if (tooManyAttempts(ip)) return sendJSON(res, 429, { error: 'Demasiados intentos. Espera unos minutos.' });
    const u = body && validUsername(body.username) ? db.users[body.username] : null;
    const ok = u && body && validPassword(body.password) &&
      hashPassword(body.password, u.salt) === u.hash;
    if (!ok) {
      registerFailedAttempt(ip);
      return sendJSON(res, 401, { error: 'Usuario o contraseña incorrectos.' });
    }
    const token = createSession(body.username);
    setSessionCookie(res, token);
    return sendJSON(res, 200, { username: body.username, token });
  }

  if (pathname === '/api/logout' && req.method === 'POST') {
    const token = tokenFromRequest(req);
    if (token && db.sessions[token]) { delete db.sessions[token]; persist(); }
    clearSessionCookie(res);
    return sendJSON(res, 200, { ok: true });
  }

  if (pathname === '/api/me') {
    if (!user) return sendJSON(res, 200, { authenticated: false });
    const u = db.users[user];
    return sendJSON(res, 200, {
      username: user,
      createdAt: u.createdAt,
      appliedCount: Object.keys(u.applied || {}).length
    });
  }

  if (pathname === '/api/history') {
    if (!user) return sendJSON(res, 401, { error: 'No autenticado' });
    if (req.method === 'GET') return sendJSON(res, 200, { items: db.history[user] || [] });
    if (req.method === 'POST') {
      if (!body || typeof body !== 'object') return sendJSON(res, 400, { error: 'Datos inválidos' });
      const item = {
        t: Number(body.t) || Date.now(),
        cpu: Math.round(clampNum(body.cpu, 0, 100)),
        ram: Math.round(clampNum(body.ram, 0, 100)),
        procs: Math.round(clampNum(body.procs, 0, 100000)),
        health: Math.round(clampNum(body.health, 0, 100))
      };
      const arr = db.history[user] = db.history[user] || [];
      arr.push(item);
      if (arr.length > 400) arr.splice(0, arr.length - 400);
      persist();
      return sendJSON(res, 200, { ok: true, count: arr.length });
    }
    if (req.method === 'DELETE') {
      db.history[user] = [];
      persist();
      return sendJSON(res, 200, { ok: true });
    }
  }

  if (pathname === '/api/applied') {
    if (!user) return sendJSON(res, 401, { error: 'No autenticado' });
    const u = db.users[user];
    if (req.method === 'GET') return sendJSON(res, 200, { applied: u.applied || {} });
    if (req.method === 'POST') {
      const id = body && String(body.id || '').slice(0, 120);
      if (!id) return sendJSON(res, 400, { error: 'id inválido' });
      if (!u.applied) u.applied = {};
      if (u.applied[id]) delete u.applied[id];
      else u.applied[id] = Date.now();
      persist();
      return sendJSON(res, 200, { applied: u.applied });
    }
  }

  return sendJSON(res, 404, { error: 'Ruta no encontrada' });
}

/* ─────────────────────────── Archivos estáticos ────────────────── */
function serveStatic(pathname, res) {
  const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
  const file = path.normalize(path.join(ROOT, rel));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
    res.writeHead(403); return res.end('Prohibido');
  }
  // No exponer la carpeta de datos (contiene hashes de contraseñas)
  if (rel.startsWith('data/') || rel === 'data') {
    res.writeHead(403); return res.end('Prohibido');
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 — No encontrado');
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

/* ─────────────────────────── Servidor HTTP ──────────────────────── */
const server = http.createServer(async (req, res) => {
  let pathname = '/';
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch { /* usar '/' */ }

  // CORS para la web publicada + preflight (incluido el de red privada)
  applyCors(req, res);
  if (req.method === 'OPTIONS') {
    const origin = req.headers.origin;
    res.writeHead(isAllowedOrigin(origin) ? 204 : 403);
    return res.end();
  }

  try {
    if (pathname.startsWith('/api/')) {
      const origin = req.headers.origin;
      if (origin && !isAllowedOrigin(origin)) {
        return sendJSON(res, 403, { error: 'Origen no autorizado para el agente local' });
      }
      return await handleApi(req, res, pathname);
    }
    if (PACKAGED) {
      // El ejecutable no sirve la web (está en Netlify): solo responde a la API
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('OptiCore — agente local activo ✔\nVuelve a la web de OptiCore y pulsa «Reintentar».\n');
    }
    return serveStatic(pathname, res);
  } catch (err) {
    console.error('✖ Error:', err);
    try { sendJSON(res, 500, { error: 'Error interno del servidor' }); } catch { /* ya cerrada */ }
  }
});

/* Puerto ocupado = casi seguro que el agente ya está abierto */
server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.log('');
    console.log('  ✔ El agente de OptiCore ya está en marcha (el puerto ' + PORT + ' está en uso).');
    console.log('    Vuelve a la web y pulsa «Reintentar». Puedes cerrar esta ventana.');
    console.log('');
  } else {
    console.error('✖ No se pudo iniciar el agente:', err && err.message ? err.message : err);
  }
  setTimeout(() => process.exit(1), PACKAGED ? 8000 : 0);   // deja leer el mensaje
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  ⚡ OptiCore — agente local');
  console.log('  ─────────────────────────────────────────');
  if (PACKAGED) {
    console.log('  ✔ Agente activo. DEJA ESTA VENTANA ABIERTA.');
    console.log('  → Vuelve a la web de OptiCore y pulsa «Reintentar».');
  } else if (HOST === '127.0.0.1' || HOST === 'localhost') {
    console.log('  → Abre:  http://127.0.0.1:' + PORT);
  } else {
    console.log('  → Abre:  http://' + HOST + ':' + PORT);
    console.log('  ⚠ Escuchando en ' + HOST + ': visible para tu red local.');
  }
  if (!PACKAGED) console.log('  → Datos: ' + DATA_DIR);
  console.log('  → Plataforma: ' + os.type() + ' ' + os.release() + ' (' + CORES + ' núcleos)');
  console.log('     CPU, RAM y procesos se leen de tu sistema en tiempo real.');
  const extra = Array.from(ALLOWED_ORIGINS);
  if (extra.length) console.log('  → Web autorizada: ' + extra.join(', '));
  console.log('  → Detén el agente con Ctrl + C');
  console.log('');
});

// Primera muestra en caliente para que el % por proceso llegue listo
buildSnapshot().catch(() => { });
