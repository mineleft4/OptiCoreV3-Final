/* ════════════════════════════════════════════════════════════════
   OptiCore — account.js
   Pantalla de cuenta (iniciar sesión / crear cuenta / invitado) y
   adaptadores de almacenamiento:
     · Con sesión iniciada → los datos van al servidor (por perfil).
     · Como invitado       → localStorage del navegador.
   La interfaz no distingue: siempre llama a estos adaptadores.
   ════════════════════════════════════════════════════════════════ */
window.OptiCore = window.OptiCore || {};

(function (ns) {
  'use strict';

  const $ = (sel) => document.querySelector(sel);

  const LS_APPLIED = 'opticore-applied';
  const LS_HISTORY = 'opticore-history';
  const LS_HISTORY_MAX = 400;

  let online = false;        // ¿se detectó el servidor local?
  let user = null;           // { username } | null (invitado)
  let authTab = 'login';
  let onAuthDone = null;

  /* ───────────────── Estado de sesión ───────────────── */
  /* `isOnline` = ¿hay servidor de cuentas? (la nube con MySQL o, si no
     hay nube configurada, el agente local). Si sigue disponible no se
     descarta la sesión: perder el agente no debe cerrar tu cuenta. */
  function init(isOnline) {
    online = !!isOnline;
    if (!online) user = null;
  }

  async function tryRestoreSession() {
    if (!online) return null;
    try {
      const me = await ns.api.me();
      if (!me || !me.username) { user = null; return null; }
      user = { username: me.username, createdAt: me.createdAt, appliedCount: me.appliedCount || 0 };
      return user;
    } catch (e) {
      user = null;
      return null;
    }
  }

  const currentUser = () => user;
  const isOnline = () => online;

  async function logout() {
    if (online) {
      try { await ns.api.logout(); } catch (e) { /* el servidor ya no está */ }
    }
    user = null;
  }

  /* ───────────────── Pantalla de cuenta ───────────────── */
  let authClosable = false;   // ¿se abrió desde la app (botón 🔑 Entrar)?

  function setTab(tab) {
    authTab = tab;
    $('#auth-tab-login').classList.toggle('active', tab === 'login');
    $('#auth-tab-register').classList.toggle('active', tab === 'register');
    $('#auth-submit').textContent = tab === 'login' ? '🔓 Entrar' : '✨ Crear mi cuenta';
    $('#auth-title').textContent = tab === 'login' ? '¡Hola otra vez!' : '¡Encantado de conocerte!';
    $('#auth-sub').textContent = authClosable
      ? (tab === 'login'
          ? 'Inicia sesión: lo que hiciste como invitado se unirá automáticamente a tu cuenta.'
          : 'Crea tu cuenta: lo que hiciste como invitado se unirá automáticamente a tu perfil.')
      : (tab === 'login'
          ? 'Inicia sesión para recuperar tu historial y tus recomendaciones aplicadas.'
          : 'Crea tu cuenta: tu historial y tus logros se guardarán en tu perfil.');
    hideError();
  }

  function showError(msg) {
    const el = $('#auth-error');
    el.textContent = '⚠️ ' + msg;
    el.hidden = false;
  }
  function hideError() {
    const el = $('#auth-error');
    el.hidden = true;
    el.textContent = '';
  }

  function showAuth(opts) {
    authTab = 'login';
    onAuthDone = (opts && opts.onDone) || null;
    const mode = (opts && opts.mode) || 'universidad';
    authClosable = !!(opts && opts.closable);   // se puede cerrar sin iniciar sesión
    document.body.classList.remove('on-splash');
    document.body.classList.add('on-auth', 'theme-' + mode);

    $('#auth-username').value = '';
    $('#auth-password').value = '';
    setTab('login');
    $('#auth-close').hidden = !authClosable;
    $('#auth-screen').hidden = false;
    setTimeout(() => $('#auth-username').focus(), 60);
  }

  function hideAuth() {
    $('#auth-screen').hidden = true;
    document.body.classList.remove('on-auth');
  }

  function finish() {
    hideError();
    hideAuth();
    const cb = onAuthDone;
    onAuthDone = null;
    if (cb) cb();
  }

  async function onSubmit(e) {
    e.preventDefault();
    const username = $('#auth-username').value.trim();
    const password = $('#auth-password').value;

    if (!online) {
      return showError(ns.api && ns.api.cloudConfigured
        ? 'El servidor de cuentas no responde ahora mismo. Inténtalo en unos segundos o entra como invitado.'
        : 'No hay conexión con el agente local. Entra como invitado.');
    }
    if (!username || !password) return showError('Escribe tu usuario y tu contraseña.');
    if (authTab === 'register' && password.length < 4) {
      return showError('La contraseña necesita al menos 4 caracteres.');
    }

    const btn = $('#auth-submit');
    btn.disabled = true;
    btn.textContent = '⏳ Un momento…';
    try {
      const res = authTab === 'register'
        ? await ns.api.register(username, password)
        : await ns.api.login(username, password);
      user = { username: res.username, createdAt: res.createdAt };
      finish();
    } catch (err) {
      showError(err.message || 'No se pudo completar la operación.');
    } finally {
      btn.disabled = false;
      setTab(authTab);
    }
  }

  /* Cableado (los elementos existen en index.html) */
  $('#auth-tab-login').addEventListener('click', () => setTab('login'));
  $('#auth-tab-register').addEventListener('click', () => setTab('register'));
  $('#auth-form').addEventListener('submit', onSubmit);
  $('#auth-guest').addEventListener('click', () => {
    user = null;
    finish();
  });
  $('#auth-close').addEventListener('click', () => {
    /* Cerrar sin iniciar sesión (la ✖ solo se muestra cuando la pantalla
       se abrió desde la app con el botón 🔑 Entrar) */
    onAuthDone = null;
    hideAuth();
  });

  /* ───────────────── Adaptadores de almacenamiento ───────────────── */

  /* Recomendaciones aplicadas: { idRec: fechaMs } */
  async function loadApplied() {
    if (online && user) {
      try { return (await ns.api.getApplied()).applied || {}; } catch (e) { return {}; }
    }
    try { return JSON.parse(localStorage.getItem(LS_APPLIED) || '{}'); } catch (e) { return {}; }
  }

  async function toggleApplied(id) {
    if (online && user) {
      const r = await ns.api.toggleApplied(id);   // lanza si falla: lo gestiona main.js
      return r.applied || {};
    }
    let map = {};
    try { map = JSON.parse(localStorage.getItem(LS_APPLIED) || '{}'); } catch (e) { /* vacío */ }
    if (map[id]) delete map[id];
    else map[id] = Date.now();
    try { localStorage.setItem(LS_APPLIED, JSON.stringify(map)); } catch (e) { /* lleno */ }
    return map;
  }

  /* Historial: [{ t, cpu, ram, procs, health }] */
  async function loadHistoryItems() {
    if (online && user) {
      try { return (await ns.api.getHistory()).items || []; } catch (e) { return []; }
    }
    try { return JSON.parse(localStorage.getItem(LS_HISTORY) || '[]'); } catch (e) { return []; }
  }

  async function addHistoryItem(item) {
    if (online && user) {
      try { await ns.api.addHistory(item); return true; } catch (e) { /* cae a local */ }
    }
    let arr = [];
    try { arr = JSON.parse(localStorage.getItem(LS_HISTORY) || '[]'); } catch (e) { /* vacío */ }
    arr.push(item);
    if (arr.length > LS_HISTORY_MAX) arr = arr.slice(-LS_HISTORY_MAX);
    try { localStorage.setItem(LS_HISTORY, JSON.stringify(arr)); } catch (e) { /* lleno */ }
    return false;
  }

  async function clearHistoryItems() {
    if (online && user) {
      try { await ns.api.clearHistory(); return true; } catch (e) { /* cae a local */ }
    }
    try { localStorage.removeItem(LS_HISTORY); } catch (e) { /* sin permiso */ }
    return false;
  }

  /* ───────────────── Unir datos de invitado a la cuenta ───────────────── */
  /* Al iniciar sesión después de haber usado la app como invitado, el
     historial y las recomendaciones aplicadas guardadas en el navegador
     se añaden al perfil del servidor (sin duplicados) y se limpian
     del localStorage, porque ya viven en la cuenta.                  */
  async function mergeGuestIntoAccount() {
    if (!online || !user) return { merged: false, recs: 0, hist: 0 };

    let localApplied = {};
    let localHistory = [];
    try { localApplied = JSON.parse(localStorage.getItem(LS_APPLIED) || '{}'); } catch (e) { /* corrupto */ }
    try { localHistory = JSON.parse(localStorage.getItem(LS_HISTORY) || '[]'); } catch (e) { /* corrupto */ }
    if (!Object.keys(localApplied).length && !localHistory.length) {
      return { merged: false, recs: 0, hist: 0 };
    }

    /* Recomendaciones aplicadas como invitado que la cuenta aún no tiene */
    let serverApplied = {};
    try { serverApplied = (await ns.api.getApplied()).applied || {}; }
    catch (e) { return { merged: false, recs: 0, hist: 0 }; }
    let recs = 0;
    for (const id of Object.keys(localApplied)) {
      if (!serverApplied[id]) {
        try { const r = await ns.api.toggleApplied(id); serverApplied = r.applied || serverApplied; recs++; }
        catch (e) { /* seguimos con el resto */ }
      }
    }

    /* Instantáneas de historial que no existan ya en el perfil */
    let serverItems = [];
    try { serverItems = (await ns.api.getHistory()).items || []; } catch (e) { /* vacío */ }
    const times = new Set(serverItems.map((h) => h.t));
    let hist = 0;
    for (const item of localHistory) {
      if (!times.has(item.t)) {
        try { await ns.api.addHistory(item); hist++; }
        catch (e) { /* seguimos con el resto */ }
      }
    }

    /* Ya viven en la cuenta: limpiar la copia local de invitado */
    try { localStorage.removeItem(LS_APPLIED); localStorage.removeItem(LS_HISTORY); } catch (e) { /* sin permiso */ }

    return { merged: true, recs: recs, hist: hist };
  }

  ns.account = {
    init,
    tryRestoreSession,
    currentUser,
    isOnline,
    logout,
    showAuth,
    hideAuth,
    mergeGuestIntoAccount,
    loadApplied,
    toggleApplied,
    loadHistoryItems,
    addHistoryItem,
    clearHistoryItems
  };

})(window.OptiCore);
