/* ════════════════════════════════════════════════════════════════
   OptiCore — main.js (v2)
   Lógica de la interfaz:
   · Modos colegio/universidad + pantalla de cuenta (account.js)
   · Datos REALES del servidor local cuando está disponible;
     si no lo está, simulación automática (fallback).
   · Recomendaciones inteligentes con "✅ ya la hice" persistente
     y lista de procesos que se pueden cerrar sin miedo.
   · Historial por perfil (servidor) o local del navegador.
   ════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const O = window.OptiCore;
  const S = O.system;
  const R = O.recommendations;
  const A = O.account;
  const api = O.api;

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  /* ─────────────────────────── Estado ─────────────────────────── */
  let mode = null;                 // 'colegio' | 'universidad'
  let snapshot = null;             // última lectura (real o simulada)
  let procSort = { key: 'cpu', dir: -1 };
  let tickCount = 0;
  let ticking = false;
  const AUTO_SNAPSHOT_TICKS = 30;  // cada 30 ticks (~1 min con tick de 2 s)

  let online = false;              // ¿hay agente local (datos reales)?
  /* ¿Hay servidor de cuentas? Con nube configurada (MySQL) depende de ella
     —también en móvil—; sin nube, depende del agente local. */
  const accountsOn = () => api.accountsAvailable(online);
  let wasOnline = false;           // para detectar caídas a mitad de sesión
  let serverInfo = null;           // { platform, osType, osRelease, host, cores, ramTotalMB }
  let appliedMap = {};             // recomendaciones aplicadas { id: fechaMs }
  let historyItems = [];          // historial (perfil del servidor o local)
  let liveSeries = [];            // serie en vivo para la gráfica superior
  let authAsked = false;          // ¿ya ofrecimos iniciar sesión?
  let lastRecReal = null;         // para re-renderizar al llegar datos reales

  /* En Android/iOS no existe agente local: el navegador no puede leer
     los procesos ni la CPU reales. Mostramos datos estimados, llamamos
     «SoC» al medidor principal y ocultamos la sección Procesos. */
  const isMobile = S.os === 'android' || S.os === 'ios';
  const cpuLabel = () => (isMobile ? 'SoC' : 'CPU');

  const CLOSE_LIGHT = { safe: '🟢', caution: '🟡', never: '🔴' };
  const CLOSE_TEXT = {
    safe: '✅ Se puede cerrar',
    caution: '⚠️ Con cuidado',
    never: '🚫 ¡No lo cierres!'
  };
  const CLOSE_TIP = {
    safe: 'Puedes finalizar este proceso sin miedo.',
    caution: 'Ciérralo solo si sabes qué hace.',
    never: 'Proceso crítico del sistema: nunca lo finalices.'
  };

  /* ───────────────────── Utilidades de formato ───────────────────── */
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function fmtGB(mb) {
    return mb >= 1024 ? (mb / 1024).toFixed(1) + ' GB' : Math.round(mb) + ' MB';
  }

  function fmtUptime(ms) {
    const h = Math.floor(ms / 3600e3);
    const m = Math.floor((ms % 3600e3) / 60e3);
    if (h >= 24) return Math.floor(h / 24) + ' d ' + (h % 24) + ' h';
    if (h > 0) return h + ' h ' + m + ' min';
    return m + ' min';
  }

  function fmtDate(ts) {
    return new Date(ts).toLocaleString('es-ES', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    });
  }

  function levelClass(pct) {
    return pct >= 80 ? 'crit' : pct >= 60 ? 'warn' : '';
  }

  /* ─────────────────────────── Toast ─────────────────────────── */
  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  /* ════════════════════ ARRANQUE: agente + sesión ════════════════════ */
  async function boot() {
    // En móvil no se busca agente: no puede existir un agente local que
    // lea procesos del teléfono desde el navegador. El servidor de cuentas
    // (nube) sí se consulta en todos los dispositivos, y en paralelo.
    const agentP = isMobile ? Promise.resolve(null) : api.detect().catch(() => null);
    const cloudP = api.detectCloud().catch(() => false);
    const [st] = await Promise.all([agentP, cloudP]);
    if (st) { serverInfo = st; online = true; wasOnline = true; }
    else { online = false; serverInfo = null; }
    A.init(accountsOn());
    if (accountsOn()) await A.tryRestoreSession();
    appliedMap = await A.loadApplied();
    historyItems = await A.loadHistoryItems();
    applyPlatformUI();
    renderServerDot();
    renderUserChip();
    renderAgentBanner();
    renderHistory();
  }
  const bootPromise = boot();

  /* Ajustes de interfaz según plataforma: SoC en móvil y sin Procesos */
  function applyPlatformUI() {
    document.body.classList.toggle('is-mobile', isMobile);
    $('#cpu-card-title').textContent = cpuLabel();
    $('#legend-cpu').textContent = cpuLabel();
    const tab = $('#tab-procesos');
    if (tab) tab.hidden = isMobile;
    $('#panel-procesos').hidden = isMobile;
    if (isMobile) {
      // Si por algún motivo estaba activa, volver a Resumen
      $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === 'resumen'));
      $$('.panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-resumen'));
    }
  }

  function renderServerDot() {
    const dot = $('#server-dot');
    dot.classList.toggle('on', online);
    dot.classList.toggle('off', !online);
    dot.textContent = '●';
    dot.title = online
      ? 'Agente local conectado: CPU, RAM y procesos REALES de tu equipo'
      : (isMobile
        ? 'Móvil: datos estimados (el navegador no puede leer la CPU ni los procesos reales)'
        : 'Sin agente local: los datos se estiman');
  }

  /* Aviso bajo las pestañas: cómo activar los datos reales o por qué
     en móvil se muestran valores estimados. */
  function renderAgentBanner() {
    const el = $('#agent-banner');
    if (!el) return;

    if (online) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;

    if (isMobile) {
      el.className = 'agent-banner agent-banner-mobile';
      el.innerHTML = `📱 <b>Estás en un dispositivo móvil.</b> El navegador no puede leer los
        procesos ni la CPU reales, así que mostramos un <b>uso estimado del SoC y la RAM</b>.
        Las recomendaciones sí están adaptadas a tu sistema.`;
      return;
    }

    el.className = 'agent-banner';
    const metaVal = (name) => {
      const m = document.querySelector('meta[name="' + name + '"]');
      return ((m && m.content) || '').trim().replace(/\/+$/, '');
    };
    const release = metaVal('opticore-agent-release');   // carpeta con los ejecutables
    const legacy = metaVal('opticore-agent-download');   // ZIP único (modo antiguo)

    // Ejecutable del agente según el sistema operativo del visitante
    const FILES = {
      windows: [{ label: 'Windows (.exe)', file: 'opticore-agent-windows-x64.exe' }],
      linux:   [{ label: 'Linux', file: 'opticore-agent-linux-x64' }],
      mac:     [{ label: 'macOS (Apple M1/M2/M3…)', file: 'opticore-agent-macos-arm64' },
                { label: 'macOS (Intel)', file: 'opticore-agent-macos-x64' }]
    };
    const STEPS = {
      windows: `<li>Descarga el archivo y <b>haz doble clic</b>. Se abrirá una ventana negra: déjala abierta.</li>
                <li>Si Windows muestra «SmartScreen», pulsa <b>Más información → Ejecutar de todas formas</b> (el programa aún no está firmado).</li>`,
      linux:   `<li>Descarga el archivo, abre una terminal en esa carpeta y ejecuta:<br><code>chmod +x opticore-agent-linux-x64 &amp;&amp; ./opticore-agent-linux-x64</code></li>`,
      mac:     `<li>Descarga el archivo, abre la Terminal en esa carpeta y ejecuta:<br><code>chmod +x opticore-agent-macos-* &amp;&amp; xattr -d com.apple.quarantine opticore-agent-macos-* ; ./opticore-agent-macos-arm64</code><br>
                (usa <code>./opticore-agent-macos-x64</code> en un Mac Intel)</li>`
    };

    let downloadHtml = '';
    let stepsHtml = '';
    if (release && FILES[S.os]) {
      downloadHtml = FILES[S.os].map((f) =>
        `<a class="agent-download" href="${release}/${f.file}" target="_blank" rel="noopener">⬇️ Descargar para ${f.label}</a>`
      ).join(' ');
      stepsHtml = STEPS[S.os];
    } else if (legacy) {
      downloadHtml = `<a class="agent-download" href="${legacy}" target="_blank" rel="noopener">⬇️ Descargar agente</a>`;
      stepsHtml = `<li>Descomprime el archivo e instala <a href="https://nodejs.org" target="_blank" rel="noopener">Node.js</a> si aún no lo tienes.</li>
                   <li>Ejecuta <code>node server.js</code> dentro de esa carpeta.</li>`;
    } else {
      stepsHtml = `<li>Instala <a href="https://nodejs.org" target="_blank" rel="noopener">Node.js</a> y ejecuta <code>node server.js</code> en la carpeta del agente.</li>`;
    }

    el.innerHTML = `
      <div class="agent-banner-text">
        <b>💻 Estás viendo datos estimados.</b> Para ver la CPU, la RAM y los procesos
        <b>reales</b> de este equipo, descarga y ejecuta el <b>agente de OptiCore</b>.
        <details class="agent-help">
          <summary>¿Cómo activarlo?</summary>
          <ol>
            ${stepsHtml}
            <li>Vuelve aquí y pulsa <b>Reintentar</b>: el punto de la cabecera se pondrá verde.</li>
          </ol>
          ${downloadHtml}
        </details>
      </div>
      <button type="button" class="btn-ghost" id="agent-retry">🔄 Reintentar</button>`;
  }

  /* Vuelve a buscar el agente sin recargar la página. */
  async function connectAgent() {
    if (isMobile) return false;
    const st = await api.detect();
    if (!st) return false;
    online = true;
    wasOnline = true;
    failStreak = 0;
    serverInfo = st;
    A.init(accountsOn());
    if (accountsOn() && !A.currentUser()) await A.tryRestoreSession();
    appliedMap = await A.loadApplied();
    historyItems = await A.loadHistoryItems();
    renderServerDot();
    renderUserChip();
    renderStatic();
    renderHistory();
    renderAgentBanner();
    refreshUI();
    toast('🔌 ¡Agente conectado! Datos reales activados');
    return true;
  }

  $('#agent-banner').addEventListener('click', async (e) => {
    const btn = e.target.closest('#agent-retry');
    if (!btn) return;
    btn.disabled = true;
    btn.textContent = '⏳ Buscando…';
    const ok = await connectAgent();
    if (!ok) {
      renderAgentBanner();
      toast('🔌 No encontramos el agente. Comprueba que esté ejecutándose.');
    }
  });

  function renderUserChip() {
    const chip = $('#user-chip');
    if (!accountsOn()) { chip.hidden = true; return; }
    chip.hidden = false;
    const u = A.currentUser();
    $('#btn-logout').hidden = !u;
    $('#btn-login').hidden = !!u;   // invitado → puede iniciar sesión cuando quiera
    if (u) {
      $('#user-avatar').textContent = '🙂';
      $('#user-name').textContent = u.username;
    } else {
      $('#user-avatar').textContent = '👤';
      $('#user-name').textContent = 'Invitado';
    }
  }

  $('#btn-logout').addEventListener('click', async () => {
    try { await A.logout(); } catch (e) { /* el servidor ya no responde */ }
    window.location.reload();
  });

  /* Invitado que decide iniciar sesión más tarde (botón 🔑 Entrar):
     abre la pantalla de cuenta sobre la app y, al conectarse, une los
     datos logrados como invitado (historial + recomendaciones aplicadas)
     a la cuenta del servidor. La ✖ permite cerrar sin iniciar sesión. */
  $('#btn-login').addEventListener('click', async () => {
    if (!accountsOn()) {
      // La API gratuita puede estar "dormida": se intenta despertarla una vez
      toast('⏳ Conectando con el servidor de cuentas…');
      await api.detectCloud();
      A.init(accountsOn());
      renderUserChip();
      if (!accountsOn()) { toast('⚠️ El servidor de cuentas no responde. Inténtalo en unos segundos.'); return; }
    }
    A.showAuth({
      mode,
      closable: true,
      onDone: async () => {
        const u = A.currentUser();
        if (!u) return;   // cerró la pantalla sin iniciar sesión: sigue invitado
        const merged = await A.mergeGuestIntoAccount();
        appliedMap = await A.loadApplied();
        historyItems = await A.loadHistoryItems();
        renderUserChip();
        renderHistory();
        refreshUI();
        toast(merged && (merged.recs || merged.hist)
          ? '🔑 ¡Hola, ' + u.username + '! Tus datos de invitado se unieron a tu cuenta'
          : '🔑 ¡Hola, ' + u.username + '! Sesión iniciada');
      }
    });
  });

  /* ════════════════════ SPLASH, CUENTA Y MODOS ════════════════════ */
  const splash = $('#splash');
  const app = $('#app');

  function startApp(m) {
    mode = m;
    localStorage.setItem('opticore-mode', m);
    document.body.classList.remove('on-splash', 'on-auth', 'theme-colegio', 'theme-universidad');
    document.body.classList.add('theme-' + m);
    $('#auth-screen').hidden = true;
    splash.hidden = true;
    app.hidden = false;
    // Al entrar a un modo, empezar siempre en Resumen
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === 'resumen'));
    $$('.panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-resumen'));
    window.scrollTo(0, 0);
    applyPlatformUI();
    renderStatic();
    refreshUI();
    renderHistory();
    renderAgentBanner();
    const u = A.currentUser();
    toast(m === 'colegio'
      ? (u ? '🏫 ¡Hola, ' + u.username + '! Modo Colegio' : '🏫 ¡Bienvenido al modo Colegio!')
      : (u ? '🎓 ¡Hola, ' + u.username + '! Modo Universidad' : '🎓 ¡Bienvenido al modo Universidad!'));
  }

  function showSplash() {
    A.hideAuth();
    document.body.classList.remove('theme-colegio', 'theme-universidad', 'on-auth');
    document.body.classList.add('on-splash');
    splash.hidden = false;
    app.hidden = true;
    $('#btn-colegio').classList.toggle('current', mode === 'colegio');
    $('#btn-universidad').classList.toggle('current', mode === 'universidad');
  }

  async function chooseMode(m) {
    await bootPromise;   // primero saber si hay servidor y sesión
    if (accountsOn() && !A.currentUser() && !authAsked) {
      authAsked = true;   // no insistir si elige invitado
      A.showAuth({
        mode: m,
        onDone: async () => {
          // La sesión acaba de iniciarse o crearse: si antes se usó como
          // invitado en este navegador, unir esos datos al perfil
          await A.mergeGuestIntoAccount();
          appliedMap = await A.loadApplied();
          historyItems = await A.loadHistoryItems();
          renderUserChip();
          renderHistory();
          startApp(m);
        }
      });
    } else {
      startApp(m);
    }
  }

  $('#btn-colegio').addEventListener('click', () => chooseMode('colegio'));
  $('#btn-universidad').addEventListener('click', () => chooseMode('universidad'));
  $('#btn-change-mode').addEventListener('click', showSplash);

  /* ───────── Tema claro/oscuro ───────── */
  $('#btn-scheme').addEventListener('click', () => {
    const next = window.OptiCoreScheme ? window.OptiCoreScheme.cycle() : 'auto';
    toast(next === 'auto'
      ? '🖥️ Tema automático: sigo el modo claro/oscuro del navegador'
      : (next === 'dark' ? '🌙 Tema oscuro activado' : '☀️ Tema claro activado'));
  });
  window.addEventListener('opticore:schemechange', () => {
    /* Las gráficas se dibujan en canvas: hay que repintarlas al cambiar de esquema */
    drawLiveChart();
    drawHistoryChart(historyItems);
  });

  /* ════════════════════ PESTAÑAS ════════════════════ */
  $$('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      $$('.tab').forEach((t) => t.classList.toggle('active', t === tab));
      $$('.panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-' + tab.dataset.tab));
      refreshUI(); // redibujar gráficas al mostrarlas
    });
  });

  function activeTab() {
    const t = $('.tab.active');
    return t ? t.dataset.tab : 'resumen';
  }

  /* ════════════════════ RENDER ESTÁTICO (SO) ════════════════════ */
  /* Con servidor, la información del sistema REAL manda sobre la
     que deduce el navegador por su User-Agent.                    */
  function renderStatic() {
    let icon = S.osIcon, name = S.osName, version = S.osVersion,
        device = S.osDevice, cores = S.cores, ram = S.totalRamGB + ' GB';

    if (online && serverInfo) {
      const MAP = {
        win32: { icon: '💻', name: 'Windows' },
        linux: { icon: '🐧', name: 'Linux' },
        darwin: { icon: '🍎', name: 'macOS' }
      };
      const m = MAP[serverInfo.platform] || { icon: '🖥️', name: serverInfo.osType };
      icon = m.icon;
      name = m.name;
      version = serverInfo.osRelease || version;
      device = serverInfo.host || device;
      cores = serverInfo.cores || cores;
      ram = serverInfo.ramTotalMB >= 1024
        ? (serverInfo.ramTotalMB / 1024).toFixed(1) + ' GB'
        : serverInfo.ramTotalMB + ' MB';
    }

    $('#os-icon').textContent = icon;
    $('#os-name').textContent = name;
    $('#os-badge').title = 'Sistema detectado: ' + name + ' ' + version;

    $('#os-card-icon').textContent = icon;
    $('#os-card-icon-big').textContent = icon;
    $('#os-card-name').textContent = name;
    $('#os-card-version').textContent = version || '—';
    $('#os-card-device').textContent = device;
    $('#cpu-card-title').textContent = cpuLabel();
    $('#legend-cpu').textContent = cpuLabel();
    $('#cpu-cores').textContent = cores + ' núcleos';
    $('#ram-total').textContent = ram;
    $('#psimple-os').textContent = name.toLowerCase();
  }

  /* ════════════════════ MEDIDORES ════════════════════ */
  const CIRC = 2 * Math.PI * 60; // circunferencia del gauge (r=60)

  function setGauge(circleId, numId, pct) {
    const circle = $(circleId);
    const offset = CIRC * (1 - pct / 100);
    circle.style.strokeDashoffset = offset;
    circle.classList.remove('warn', 'crit');
    const lvl = levelClass(pct);
    if (lvl) circle.classList.add(lvl);
    $(numId).textContent = Math.round(pct);
  }

  function renderMetrics(snap) {
    setGauge('#gauge-cpu', '#cpu-value', snap.cpu);
    setGauge('#gauge-ram', '#ram-value', snap.ramPct);

    $('#cpu-freq').textContent = snap.freq + ' GHz';
    $('#cpu-temp').textContent = Math.round(snap.temp) + ' °C';

    $('#ram-used').textContent = fmtGB(snap.ramUsedMB);
    $('#ram-free').textContent = fmtGB(Math.max(0, snap.ramTotalMB - snap.ramUsedMB));

    $('#os-card-uptime').textContent = fmtUptime(snap.uptimeMs);
    $('#os-card-procs').textContent = snap.processCount;

    // Salud (incluye bonus por recomendaciones aplicadas)
    const score = snap.health;
    $('#health-score').textContent = score;
    $('#health-fill').style.width = score + '%';
    const face = score >= 80 ? '😀' : score >= 60 ? '🙂' : score >= 40 ? '😐' : '😟';
    $('#health-face').textContent = face;
    $('#health-text').textContent =
      score >= 80 ? '¡Excelente! Tu dispositivo está en gran forma. Sigue así 👌' :
      score >= 60 ? 'Todo bien, aunque hay margen para mejorar. Mira las recomendaciones 💡' :
      score >= 40 ? 'Tu dispositivo está algo cargado. Te conviene aplicar varias recomendaciones ⚠️' :
      '¡Alerta! Tu dispositivo necesita cariño urgente. Revisa las recomendaciones 🚨';
  }

  /* ════════════════════ PROCESOS ════════════════════ */
  function renderProcesses(snap) {
    if (mode === 'colegio') renderProcessesKids(snap);
    else renderProcessesFull(snap);
  }

  /* Vista COLEGIO: solo los que de verdad están trabajando,
     con semáforo de si se pueden cerrar */
  function renderProcessesKids(snap) {
    $('#psimple-count').textContent = snap.processCount;
    const grid = $('#psimple-grid');
    const meaningful = snap.processes.filter((p) => p.cpu >= 0.5 || p.mem >= 100);
    const top = (meaningful.length ? meaningful : snap.processes).slice(0, 6);

    grid.innerHTML = top.map((p) => {
      const pct = clamp(p.cpu * 4, 3, 100); // escala amigable para la barrita
      const lvl = levelClass(pct);
      return `
        <div class="pkit-card">
          <span class="pkit-light" title="${CLOSE_TIP[p.closable]}">${CLOSE_LIGHT[p.closable]}</span>
          <span class="pkit-emoji">${p.emoji}</span>
          <h4 class="pkit-name">${p.friendly}</h4>
          <div class="pkit-bar"><div class="pkit-fill ${lvl}" style="width:${Math.round(pct)}%"></div></div>
          <span class="pkit-pct">${p.cpu.toFixed(1)}% de trabajo</span>
          <span class="pkit-mem">💾 ${fmtGB(p.mem)}</span>
          <details class="pkit-info">
            <summary>¿Qué es? 👀</summary>
            <p>${p.desc}</p>
            <p class="pkit-close">${CLOSE_LIGHT[p.closable]} ${CLOSE_TIP[p.closable]}</p>
          </details>
        </div>`;
    }).join('');
  }

  /* Vista UNIVERSIDAD: tabla completa con búsqueda, orden y columna
     "¿Puedo cerrarlo?" con el semáforo ✅⚠️🚫 */
  function renderProcessesFull(snap) {
    const tbody = $('#proc-table-body');
    const query = ($('#process-search').value || '').toLowerCase();

    let rows = snap.processes.slice();
    if (query) {
      rows = rows.filter((p) =>
        p.name.toLowerCase().includes(query) ||
        p.friendly.toLowerCase().includes(query) ||
        p.category.toLowerCase().includes(query) ||
        p.desc.toLowerCase().includes(query));
    }

    const key = procSort.key;
    const dir = procSort.dir;
    rows.sort((a, b) => {
      let va, vb;
      if (key === 'name' || key === 'category') { va = a[key].toLowerCase(); vb = b[key].toLowerCase(); }
      else { va = a[key]; vb = b[key]; }
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });

    // Marcar la columna ordenada
    $$('.proc-table thead th').forEach((th) => {
      th.classList.toggle('sorted', th.dataset.sort === key);
    });

    tbody.innerHTML = rows.map((p) => {
      const cpuLvl = levelClass(p.cpu * 5);
      const tip = String(p.closeTip || CLOSE_TIP[p.closable] || '').replace(/"/g, '&quot;');
      return `
        <tr>
          <td class="pid">${p.pid}</td>
          <td class="pname"><span class="pemoji">${p.emoji}</span>${p.name}</td>
          <td class="td-cat">${p.category}</td>
          <td class="td-num">
            <span class="cellbar">
              <span class="track"><span class="fill ${cpuLvl}" style="width:${clamp(p.cpu * 2.4, 2, 100)}%"></span></span>
              ${p.cpu.toFixed(1)}%
            </span>
          </td>
          <td class="td-num">${fmtGB(p.mem)}</td>
          <td class="pdesc">${p.desc}</td>
          <td class="td-close"><span class="badge-close badge-close-${p.closable}" title="${tip}">${CLOSE_TEXT[p.closable]}</span></td>
        </tr>`;
    }).join('');
  }

  $('#process-search').addEventListener('input', () => {
    if (snapshot) renderProcessesFull(snapshot);
  });

  $('#process-sort').addEventListener('change', (e) => {
    const key = e.target.value;
    if (procSort.key === key) procSort.dir *= -1; else { procSort.key = key; procSort.dir = key === 'name' ? 1 : -1; }
    if (snapshot) renderProcessesFull(snapshot);
  });

  $$('.proc-table thead th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (procSort.key === key) procSort.dir *= -1; else { procSort.key = key; procSort.dir = key === 'name' || key === 'category' ? 1 : -1; }
      if (snapshot) renderProcessesFull(snapshot);
    });
  });

  /* ════════════════════ RECOMENDACIONES ════════════════════ */
  /* Batería (si el navegador la expone) para recomendaciones de energía */
  const batteryPromise = ('getBattery' in navigator)
    ? navigator.getBattery().catch(() => null)
    : Promise.resolve(null);

  async function envInfo() {
    const b = await batteryPromise;
    return b ? { battery: { level: b.level, charging: b.charging } } : {};
  }

  /* En móvil cambiamos «CPU» por «SoC» también en los textos de las
     recomendaciones (los datos internos se siguen llamando cpu). */
  function adaptRecText(rec) {
    if (!isMobile) return rec;
    const fix = (t) => (typeof t === 'string' ? t.replace(/\bCPU\b/g, 'SoC') : t);
    return Object.assign({}, rec, {
      title: fix(rec.title),
      simple: fix(rec.simple),
      whyText: fix(rec.whyText),
      steps: (rec.steps || []).map(fix)
    });
  }

  async function renderRecommendations(snap) {
    if (!snap) return;
    const env = await envInfo();
    const built = R.build(snap, mode, appliedMap, historyItems, env);
    const active = built.active.map(adaptRecText);
    const done = built.done.map(adaptRecText);

    const osNames = { windows: 'Windows', linux: 'Linux', mac: 'tu Mac', android: 'tu teléfono Android', ios: 'tu iPhone' };
    $('#rec-intro').innerHTML = mode === 'colegio'
      ? `🏃‍♂️ <b>¡Misión: hacer volar ${osNames[snap.os] || 'tu dispositivo'}!</b><br>
         Tienes <b>${active.length} misiones</b> pendientes y ya completaste <b>${done.length}</b>.
         ¡Pide ayuda a un adulto si no estás seguro! 🙋`
      : `🧭 <b>${active.length} recomendaciones activas</b> para <b>${osNames[snap.os] || 'tu dispositivo'}</b> según el
         ${snap.real ? 'análisis <b>real</b> de tu sistema' : (isMobile ? 'uso <b>estimado</b>' : 'uso simulado')}:
         ${cpuLabel()} <b>${Math.round(snap.cpu)}%</b> ·
         RAM <b>${Math.round(snap.ramPct)}%</b> · salud <b>${snap.health}/100</b>. Las de mayor impacto van primero.`;

    const impactLabel = { high: '🔥 Alto impacto', mid: '⚡ Medio impacto', low: '🌱 Mantenimiento' };

    const card = (rec, isDone) => {
      const steps = rec.steps.map((st, i) =>
        `<li><span class="step-n">${i + 1}</span><span>${st}</span></li>`).join('');

      const simpleBlock = mode === 'colegio' && rec.simple
        ? `<div class="rec-simple">💡 ${rec.simple}</div>` : '';

      const whyBlock = mode === 'universidad' && rec.whyText
        ? `<div class="rec-why"><b>¿Por qué ayuda?</b> ${rec.whyText}</div>` : '';

      const dateChip = isDone
        ? `<span class="rec-done-date" title="Marca el momento en que la aplicaste">✅ ${fmtDate(rec.appliedAt)}</span>` : '';

      const btn = isDone
        ? `<button type="button" class="btn-apply applied" data-rec-toggle="${rec.id}">↩️ Desmarcar</button>`
        : `<button type="button" class="btn-apply" data-rec-toggle="${rec.id}">${mode === 'colegio' ? '✅ ¡Ya la hice!' : 'Marcar como aplicada'}</button>`;

      return `
        <article class="rec-card${isDone ? ' rec-card-done' : ''}">
          <div class="rec-top">
            <span class="rec-icon">${rec.icon}</span>
            <h4 class="rec-title">${rec.title}</h4>
          </div>
          <div class="rec-badges">
            <span class="badge badge-${rec.impact}">${impactLabel[rec.impact]}</span>
            ${dateChip}
          </div>
          ${simpleBlock}
          <ol class="rec-steps">${steps}</ol>
          ${whyBlock}
          ${btn}
        </article>`;
    };

    $('#rec-grid').innerHTML = active.map((rec) => card(rec, false)).join('');

    const wrap = $('#rec-done-wrap');
    if (done.length) {
      wrap.hidden = false;
      $('#rec-done-count').textContent = done.length;
      $('#rec-done-grid').innerHTML = done.map((rec) => card(rec, true)).join('');
    } else {
      wrap.hidden = true;
      $('#rec-done-grid').innerHTML = '';
    }
  }

  /* Marcar / desmarcar recomendaciones (delegación de eventos) */
  async function onRecToggle(e) {
    const btn = e.target.closest('[data-rec-toggle]');
    if (!btn) return;
    const id = btn.getAttribute('data-rec-toggle');
    const wasApplied = !!appliedMap[id];
    btn.disabled = true;
    try {
      appliedMap = await A.toggleApplied(id);
    } catch (err) {
      toast('⚠️ No se pudo guardar: ' + err.message);
      btn.disabled = false;
      return;
    }
    toast(wasApplied ? '↩️ Recomendación desmarcada' : '🎉 ¡Recomendación aplicada! Tu salud sube un poquito ⬆️');
    if (snapshot) {
      snapshot.health = S.healthScore(snapshot, Object.keys(appliedMap).length);
      renderMetrics(snapshot);
    }
    renderRecommendations(snapshot);
  }

  $('#rec-grid').addEventListener('click', onRecToggle);
  $('#rec-done-grid').addEventListener('click', onRecToggle);

  /* ════════════════════ HISTORIAL ════════════════════ */
  async function addSnapshot(auto) {
    if (!snapshot) return;
    const item = {
      t: Date.now(),
      mode,
      os: snapshot.os,
      cpu: Math.round(snapshot.cpu),
      ram: Math.round(snapshot.ramPct),
      procs: snapshot.processCount,
      health: snapshot.health
    };
    try {
      const enServidor = await A.addHistoryItem(item); // true = perfil, false = navegador
      historyItems = await A.loadHistoryItems();
      renderHistory();
      if (!auto) {
        toast(enServidor === false
          ? '📸 Guardada en este navegador (sin conexión al perfil)'
          : '📸 ¡Instantánea guardada en tu perfil!');
      }
    } catch (e) {
      if (!auto) toast('⚠️ No se pudo guardar la instantánea');
    }
  }

  const arrow = (d) => (d >= 3 ? '📈' : d <= -3 ? '📉' : '➡️');
  const signed = (d) => (d > 0 ? '+' + d : String(d));

  function renderHistory() {
    const h = historyItems;
    const listEl = $('#hist-list');

    // Origen de los datos del historial
    const u = A.currentUser();
    const cloud = api.cloudConfigured;
    $('#hist-source').innerHTML = accountsOn()
      ? (u
        ? (cloud
          ? `☁️ Historial guardado en tu cuenta <b>${u.username}</b> (base de datos en la nube): inicia sesión desde cualquier dispositivo y lo verás aquí.`
          : `☁️ Historial guardado por el agente local, dentro del perfil <b>${u.username}</b>: te sigue en cualquier navegador de este equipo.`)
        : `💾 Sesión de invitado: el historial se guarda solo en <b>este navegador</b>.
           Pulsa «🔑 Entrar» y crea una cuenta para guardarlo en tu perfil.`)
      : (isMobile
        ? '💾 En móvil el historial se guarda solo en este navegador y usa datos estimados.'
        : (cloud
          ? '💾 No se pudo conectar con el servidor de cuentas: el historial se guarda solo en este navegador.'
          : '💾 Sin agente local: el historial se guarda solo en este navegador.'));

    // Perfil (solo con sesión): quién eres, desde cuándo y cuánto llevas
    const prof = $('#hist-profile');
    if (prof) {
      if (u) {
        const since = u.createdAt
          ? new Date(Number(u.createdAt)).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })
          : '—';
        prof.hidden = false;
        prof.innerHTML = `
          <span class="hist-profile-avatar">🙂</span>
          <div class="hist-profile-info">
            <b>${u.username}</b>
            <span>Miembro desde ${since} · ${Object.keys(appliedMap).length} recomendaciones aplicadas · ${h.length} instantáneas guardadas</span>
          </div>`;
      } else {
        prof.hidden = true;
        prof.innerHTML = '';
      }
    }

    if (!h.length) {
      listEl.innerHTML = `
        <div class="hist-empty">
          <span class="big">📭</span>
          Todavía no hay instantáneas guardadas.<br>
          Pulsa <b>📸 Guardar ahora</b> para empezar tu historial.
        </div>`;
    } else {
      listEl.innerHTML = h.slice().reverse().map((item, i, arr) => {
        const face = item.health >= 80 ? '😀' : item.health >= 60 ? '🙂' : item.health >= 40 ? '😐' : '😟';
        const modeTag = item.mode === 'colegio' ? '🏫 Colegio' : '🎓 Universidad';
        const prev = arr[i + 1]; // el anterior en el tiempo (lista invertida)
        const trendChip = prev
          ? `<div class="hist-trend">${arrow(item.cpu - prev.cpu)} ${cpuLabel()} ${signed(item.cpu - prev.cpu)}% · ${arrow(item.ram - prev.ram)} RAM ${signed(item.ram - prev.ram)}%</div>`
          : '<div class="hist-trend">➡️ Primer punto registrado</div>';
        return `
          <div class="hist-item">
            <div class="hist-face">${face}</div>
            <div class="hist-main">
              <div class="hist-date">${fmtDate(item.t)}</div>
              <div class="hist-meta">${modeTag} · ${item.procs} procesos</div>
              ${trendChip}
            </div>
            <div class="hist-bars">
              <div class="minibar cpu"><span>${cpuLabel()}</span><span class="track"><span class="fill" style="width:${item.cpu}%"></span></span><span>${item.cpu}%</span></div>
              <div class="minibar ram"><span>RAM</span><span class="track"><span class="fill" style="width:${item.ram}%"></span></span><span>${item.ram}%</span></div>
            </div>
            <div class="hist-health">${item.health}/100</div>
          </div>`;
      }).join('');
    }

    drawHistoryChart(h);
  }

  $('#btn-snapshot').addEventListener('click', () => addSnapshot(false));
  $('#btn-clear-history').addEventListener('click', async () => {
    if (!confirm('¿Seguro que quieres borrar todo el historial? Esta acción no se puede deshacer.')) return;
    try { await A.clearHistoryItems(); } catch (e) { /* sin almacenamiento */ }
    historyItems = await A.loadHistoryItems();
    renderHistory();
    toast('🗑️ Historial borrado');
  });

  /* ════════════════════ GRÁFICAS (canvas) ════════════════════ */
  function setupCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || canvas.parentElement.clientWidth;
    const cssH = parseInt(canvas.getAttribute('height'), 10) || 180;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    canvas.style.height = cssH + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w: cssW, h: cssH };
  }

  function chartColors() {
    /* Los colores dependen del esquema claro/oscuro y del modo */
    const dark = document.documentElement.dataset.scheme === 'dark';
    const kid = mode === 'colegio';
    if (dark) {
      return {
        grid: kid ? 'rgba(255,255,255,.09)' : 'rgba(255,255,255,.07)',
        label: kid ? '#bdaadd' : '#9aa3c3',
        cpu: kid ? '#4fc3f7' : '#22d3ee',
        ram: kid ? '#b78cff' : '#818cf8'
      };
    }
    return {
      grid: kid ? 'rgba(74,59,120,.12)' : 'rgba(35,42,68,.08)',
      label: kid ? '#8a7ab8' : '#68738f',
      cpu: '#0891b2',
      ram: kid ? '#9b5de5' : '#6366f1'
    };
  }

  function drawLineSeries(ctx, w, h, values, color) {
    const padL = 34, padR = 12, padT = 14, padB = 22;
    const iw = w - padL - padR, ih = h - padT - padB;

    ctx.beginPath();
    values.forEach((v, i) => {
      const x = padL + (i / (values.length - 1 || 1)) * iw;
      const y = padT + (1 - v / 100) * ih;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.4;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    // relleno bajo la línea
    const lastX = padL + iw;
    ctx.lineTo(lastX, padT + ih);
    ctx.lineTo(padL, padT + ih);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, padT, 0, padT + ih);
    grad.addColorStop(0, color + '44');
    grad.addColorStop(1, color + '05');
    ctx.fillStyle = grad;
    ctx.fill();
  }

  function drawGrid(ctx, w, h, colors) {
    const padL = 34, padR = 12, padT = 14, padB = 22;
    ctx.font = '11px Inter, sans-serif';
    ctx.fillStyle = colors.label;
    ctx.textAlign = 'right';
    [0, 25, 50, 75, 100].forEach((v) => {
      const y = padT + (1 - v / 100) * (h - padT - padB);
      ctx.strokeStyle = colors.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();
      ctx.fillText(v + '%', padL - 8, y + 4);
    });
  }

  function drawLiveChart() {
    const canvas = $('#live-chart');
    if (!canvas || canvas.offsetParent === null) return;
    if (liveSeries.length < 2) return;

    const { ctx, w, h } = setupCanvas(canvas);
    const colors = chartColors();
    ctx.clearRect(0, 0, w, h);
    drawGrid(ctx, w, h, colors);
    drawLineSeries(ctx, w, h, liveSeries.map((p) => p.cpu), colors.cpu);
    drawLineSeries(ctx, w, h, liveSeries.map((p) => p.ram), colors.ram);
  }

  function drawHistoryChart(h) {
    const canvas = $('#history-chart');
    if (!canvas || canvas.offsetParent === null) return;
    const data = (h || []).slice(-24); // últimos 24 puntos
    const { ctx, w } = setupCanvas(canvas);
    const h2 = parseInt(canvas.getAttribute('height'), 10) || 200;
    const colors = chartColors();
    ctx.clearRect(0, 0, w, h2);

    const padL = 36, padR = 12, padT = 16, padB = 26;
    const ih = h2 - padT - padB;
    const slot = (w - padL - padR) / Math.max(data.length, 1);
    const barW = Math.max(Math.min(slot * 0.32, 16), 4);

    // fondo y líneas
    ctx.font = '11px Inter, sans-serif';
    ctx.fillStyle = colors.label;
    ctx.textAlign = 'right';
    [0, 50, 100].forEach((v) => {
      const y = padT + (1 - v / 100) * ih;
      ctx.strokeStyle = colors.grid;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();
      ctx.fillText(v + '%', padL - 8, y + 4);
    });

    if (!data.length) {
      ctx.textAlign = 'center';
      ctx.fillStyle = colors.label;
      ctx.fillText('Aún no hay datos en el historial', w / 2, h2 / 2);
      return;
    }

    // barras CPU y RAM por instantánea
    data.forEach((d, i) => {
      const cx = padL + slot * i + slot / 2;

      const cpuH = (d.cpu / 100) * ih;
      const ramH = (d.ram / 100) * ih;

      ctx.fillStyle = colors.cpu;
      roundedBar(ctx, cx - barW - 1, padT + ih - cpuH, barW, cpuH, 3);
      ctx.fillStyle = colors.ram;
      roundedBar(ctx, cx + 1, padT + ih - ramH, barW, ramH, 3);
    });

    // línea de salud
    ctx.beginPath();
    data.forEach((d, i) => {
      const x = padL + slot * i + slot / 2;
      const y = padT + (1 - d.health / 100) * ih;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = mode === 'colegio' ? '#ff6b35' : '#34d399';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function roundedBar(ctx, x, y, w, h, r) {
    if (h < 2) { ctx.fillRect(x, y, w, 2); return; }
    r = Math.min(r, h / 2, w / 2);
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
    ctx.fill();
  }

  /* ─────────────────────── BUCLE PRINCIPAL ─────────────────────── */
  /* Obtiene el snapshot: REAL si hay servidor, simulado si no.
     · Un fallo puntual NO tumba el modo real: se necesitan 3 fallos
       consecutivos para pasar a simulación.
     · Si estamos en simulación, se reintenta el servidor cada 30
       ticks (~1 min) por si vuelve.
     El % de salud se recalcula siempre con el bonus de aplicadas. */
  let failStreak = 0;   // fallos consecutivos al pedir /api/snapshot

  async function updateSnapshot() {
    if (online) {
      try {
        const raw = await api.snapshot();
        failStreak = 0;
        snapshot = O.buildRealSnapshot(raw);
      } catch (e) {
        failStreak++;
        if (failStreak < 3) return;   // fallo puntual: mantener el último dato real
        // El agente lleva sin responder: pasar a estimación
        if (wasOnline) {
          toast('🔌 Agente desconectado: seguimos con datos estimados');
          wasOnline = false;
        }
        online = false;
        A.init(accountsOn());   // con nube, la sesión no depende del agente
        serverInfo = null;
        renderServerDot();
        renderUserChip();
        renderStatic();
        renderHistory();
        renderAgentBanner();
        snapshot = S.tick();
      }
    } else {
      // Sin agente: reintentar conexión cada 30 ticks (~1 min)
      if (!isMobile && tickCount % 30 === 0) {
        try {
          const st = await api.detect();
          if (st && st.ok) {
            online = true;
            wasOnline = true;
            failStreak = 0;
            serverInfo = st;
            A.init(accountsOn());
            if (accountsOn() && !A.currentUser()) await A.tryRestoreSession();
            appliedMap = await A.loadApplied();
            historyItems = await A.loadHistoryItems();
            renderServerDot();
            renderUserChip();
            renderStatic();
            renderHistory();
            renderAgentBanner();
            toast('🔌 ¡Agente reconectado! Volvemos a los datos reales');
          }
        } catch (e2) { /* sigue sin agente */ }
      }
      snapshot = S.tick();
    }
    snapshot.health = S.healthScore(snapshot, Object.keys(appliedMap).length);
  }

  async function mainTick() {
    if (ticking) return;   // no solapar peticiones lentas
    ticking = true;
    try {
      await bootPromise.catch(() => { });  // el primer tick espera al arranque
      tickCount++;
      await updateSnapshot();

      liveSeries.push({ cpu: snapshot.cpu, ram: snapshot.ramPct });
      if (liveSeries.length > 60) liveSeries.shift();

      if (!mode) return;   // aún en el splash: seguir muestreando en silencio

      renderMetrics(snapshot);

      const tab = activeTab();
      if (tab === 'procesos') renderProcesses(snapshot);
      // Recomendaciones: cada 10 ticks, o en cuanto llegan los primeros
      // datos REALES (para corregir textos que digan "simulado")
      if (tab === 'recomendaciones' &&
          (tickCount % 10 === 0 || snapshot.real !== lastRecReal)) {
        lastRecReal = snapshot.real;
        renderRecommendations(snapshot);
      }

      drawLiveChart();

      // Instantánea automática cada ~1 minuto (solo con la pestaña visible)
      if (tickCount % AUTO_SNAPSHOT_TICKS === 0 && !document.hidden) {
        addSnapshot(true);
      }
    } finally {
      ticking = false;
    }
  }

  function refreshUI() {
    if (!snapshot) return;
    const tab = activeTab();

    renderMetrics(snapshot);

    if (tab === 'procesos') renderProcesses(snapshot);
    else if (tab === 'recomendaciones') renderRecommendations(snapshot);
    else if (tab === 'historial') { drawHistoryChart(historyItems); }
    drawLiveChart();
  }

  window.addEventListener('resize', () => {
    drawLiveChart();
    drawHistoryChart(historyItems);
  });

  /* Arranque: muestrear ya para que la primera vista tenga datos */
  snapshot = S.tick();
  snapshot.health = S.healthScore(snapshot, 0);
  liveSeries.push({ cpu: snapshot.cpu, ram: snapshot.ramPct });
  mainTick();
  setInterval(mainTick, 2000);

})(window);
