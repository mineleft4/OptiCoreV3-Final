/* ════════════════════════════════════════════════════════════════
   OptiCore — api.js
   Cliente HTTP con DOS destinos distintos:

   1) AGENTE LOCAL (server.js / ejecutable) en http://127.0.0.1:8137
      → datos REALES del equipo: /api/status y /api/snapshot.

   2) API EN LA NUBE (backend/server.js + MySQL), indicada en
      <meta name="opticore-cloud" content="https://tu-api.onrender.com">
      → cuentas, perfil, historial y recomendaciones aplicadas.
      Así el usuario ve su perfil e historial desde cualquier equipo.

   Si NO hay meta "opticore-cloud" (o está vacía), las cuentas siguen
   funcionando como antes, contra el agente local.
   ════════════════════════════════════════════════════════════════ */
window.OptiCore = window.OptiCore || {};

(function (ns) {
  'use strict';

  const TOKEN_KEY_AGENT = 'opticore-token';
  const TOKEN_KEY_CLOUD = 'opticore-cloud-token';
  const DEFAULT_AGENT = 'http://127.0.0.1:8137';
  const PROBE_TIMEOUT = 1400;    // ms para detectar el agente sin colgar la página
  const CLOUD_PROBE_TIMEOUT = 9000; // la API gratuita puede tardar en "despertar"
  const REQUEST_TIMEOUT = 6000;  // ms para peticiones normales
  const CLOUD_REQUEST_TIMEOUT = 12000;

  let base = '';                 // '' = mismo origen; si no, URL del agente
  let agentMode = false;

  const normalize = (u) => String(u || '').trim().replace(/\/+$/, '');

  /* ───────────── Configuración de la nube ───────────── */
  const cloudMeta = document.querySelector('meta[name="opticore-cloud"]');
  const cloudBase = normalize(cloudMeta && cloudMeta.content);
  const cloudConfigured = !!cloudBase;
  let cloudOk = false;           // ¿responde ahora mismo la API en la nube?

  /* ¿Las cuentas van a la nube o al agente local? */
  const accountsTarget = () => (cloudConfigured ? 'cloud' : 'agent');

  /* ───────────── Tokens de sesión (uno por destino) ───────────── */
  function tokenKey(target) { return target === 'cloud' ? TOKEN_KEY_CLOUD : TOKEN_KEY_AGENT; }
  function getToken(target) {
    try { return localStorage.getItem(tokenKey(target)) || null; } catch (e) { return null; }
  }
  function setToken(target, token) {
    try {
      if (token) localStorage.setItem(tokenKey(target), token);
      else localStorage.removeItem(tokenKey(target));
    } catch (e) { /* almacenamiento bloqueado */ }
  }

  function fetchTimeout(url, opts, ms) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms);
    return fetch(url, Object.assign({}, opts, { signal: ctl.signal }))
      .finally(() => clearTimeout(timer));
  }

  /* target: 'agent' (por defecto) o 'cloud' */
  async function request(method, path, body, opts) {
    const target = (opts && opts.target) || 'agent';
    const isCloud = target === 'cloud';
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken(target);
    if (token) headers.Authorization = 'Bearer ' + token;

    const options = {
      method,
      headers,
      cache: 'no-store',
      // El token viaja en la cabecera; no se envían cookies entre dominios
      credentials: isCloud ? 'omit' : (agentMode ? 'omit' : 'same-origin')
    };
    if (body !== undefined) options.body = JSON.stringify(body);

    const url = (isCloud ? cloudBase : base) + path;
    const timeout = (opts && opts.timeout) || (isCloud ? CLOUD_REQUEST_TIMEOUT : REQUEST_TIMEOUT);

    let res;
    try {
      res = await fetchTimeout(url, options, timeout);
    } catch (e) {
      throw new Error(isCloud
        ? 'No se pudo conectar con el servidor de cuentas. Inténtalo de nuevo en unos segundos.'
        : 'Sin conexión con el agente local');
    }

    let data = null;
    try { data = await res.json(); } catch (e) { /* respuesta sin JSON */ }
    if (!res.ok) {
      // Token caducado o inválido: se descarta para volver a invitar a entrar
      if (res.status === 401 && token) setToken(target, null);
      throw new Error((data && data.error) || ('Error ' + res.status));
    }
    return data;
  }

  /* Peticiones de cuenta: van al destino que toque (nube o agente) */
  const acct = (method, path, body) => request(method, path, body, { target: accountsTarget() });

  /* ¿La página se sirve desde este mismo equipo? Sirve para no probar
     /api/status en el origen propio cuando la web está publicada. */
  function isLoopbackPage() {
    const h = location.hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]';
  }

  /* Direcciones del agente a probar, en orden de preferencia. */
  function agentCandidates() {
    const list = [];
    const meta = document.querySelector('meta[name="opticore-agent"]');
    const configured = meta && meta.content ? meta.content.split(',') : [];
    configured.concat([DEFAULT_AGENT]).forEach((u) => {
      const n = normalize(u);
      if (n && !list.includes(n)) list.push(n);
    });
    // Mismo origen: útil si el agente sirve la página en otro puerto.
    if (isLoopbackPage()) list.push('');
    return list;
  }

  /* Consulta /api/status en una dirección concreta (sin tocar `base`). */
  async function statusAt(candidate) {
    const headers = {};
    const token = getToken('agent');
    if (token) headers.Authorization = 'Bearer ' + token;
    const res = await fetchTimeout(candidate + '/api/status', {
      method: 'GET',
      headers,
      cache: 'no-store',
      credentials: candidate ? 'omit' : 'same-origin'
    }, PROBE_TIMEOUT);
    if (!res.ok) throw new Error('sin agente');
    const data = await res.json();
    if (!data || !data.ok) throw new Error('sin agente');
    return data;
  }

  /* Prueba todas las direcciones a la vez (máx. PROBE_TIMEOUT) y se
     queda con la primera de la lista que responda. Devuelve su
     /api/status o null si no hay agente. */
  async function detect(opts) {
    if (opts && opts.skip) { base = ''; agentMode = false; return null; }
    const candidates = agentCandidates();
    const results = await Promise.allSettled(candidates.map(statusAt));
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'fulfilled') {
        base = candidates[i];
        agentMode = !!candidates[i];
        return results[i].value;
      }
    }
    base = '';
    agentMode = false;
    return null;
  }

  /* ¿Responde la API en la nube? (también sirve para "despertarla") */
  async function detectCloud() {
    if (!cloudConfigured) { cloudOk = false; return false; }
    try {
      const res = await fetchTimeout(cloudBase + '/api/health', {
        method: 'GET', cache: 'no-store', credentials: 'omit'
      }, CLOUD_PROBE_TIMEOUT);
      const data = await res.json().catch(() => null);
      cloudOk = !!(res.ok && data && data.ok);
    } catch (e) {
      cloudOk = false;
    }
    return cloudOk;
  }

  const api = {
    /* ¿Hay agente local? (devuelve también la info del sistema real) */
    detect,
    status: () => request('GET', '/api/status'),

    /* Lectura en vivo: CPU, RAM y procesos REALES (siempre del agente) */
    snapshot: () => request('GET', '/api/snapshot'),

    /* ¿Hay servidor de cuentas disponible? */
    detectCloud,

    /* Cuentas (el token se guarda al entrar/registrarse) */
    register: async (username, password) => {
      const res = await acct('POST', '/api/register', { username, password });
      if (res && res.token) setToken(accountsTarget(), res.token);
      return res;
    },
    login: async (username, password) => {
      const res = await acct('POST', '/api/login', { username, password });
      if (res && res.token) setToken(accountsTarget(), res.token);
      return res;
    },
    logout: async () => {
      try { await acct('POST', '/api/logout', {}); } finally { setToken(accountsTarget(), null); }
    },
    me: () => acct('GET', '/api/me'),

    /* Historial por perfil */
    getHistory: () => acct('GET', '/api/history'),
    addHistory: (item) => acct('POST', '/api/history', item),
    clearHistory: () => acct('DELETE', '/api/history'),

    /* Recomendaciones aplicadas */
    getApplied: () => acct('GET', '/api/applied'),
    toggleApplied: (id) => acct('POST', '/api/applied', { id }),

    /* Información útil para la interfaz */
    get isAgent() { return agentMode; },
    get cloudConfigured() { return cloudConfigured; },
    get cloudOk() { return cloudOk; },
    /* ¿Se pueden usar cuentas ahora mismo? */
    accountsAvailable: (agentOnline) => (cloudConfigured ? cloudOk : !!agentOnline),
    get baseUrl() { return base || location.origin; },
    clearToken: () => setToken(accountsTarget(), null)
  };

  ns.api = api;

})(window.OptiCore);
