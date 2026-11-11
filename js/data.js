/* ════════════════════════════════════════════════════════════════
   OptiCore — data.js
   Detección del sistema operativo + simulación realista de
   CPU, RAM y listado de procesos para cada plataforma.
   ════════════════════════════════════════════════════════════════ */
window.OptiCore = window.OptiCore || {};

(function (ns) {
  'use strict';

  /* ───────────────────────── Utilidades ───────────────────────── */
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const rand = (min, max) => min + Math.random() * (max - min);
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ──────────────────── Detección del sistema ──────────────────── */
  function detectOS() {
    // Vista previa para desarrollo: ?os=android|ios|windows|linux|mac
    try {
      const forced = new URLSearchParams(location.search).get('os');
      if (['windows', 'linux', 'mac', 'android', 'ios'].includes(forced)) return forced;
    } catch (e) { /* sin URLSearchParams */ }

    const ua = navigator.userAgent || '';
    const platform = navigator.platform || '';
    // iPad moderno se reporta como MacIntel con pantalla táctil
    const isIOS = /iPhone|iPad|iPod/i.test(ua) ||
      (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isIOS) return 'ios';
    if (/Android/i.test(ua)) return 'android';
    if (/Windows|Win32|Win64/i.test(ua + ' ' + platform)) return 'windows';
    if (/Macintosh|Mac OS X/i.test(ua)) return 'mac';
    if (/Linux|X11|CrOS/i.test(ua + ' ' + platform)) return 'linux';
    return 'windows'; // valor por defecto
  }

  const OS = detectOS();

  function osVersion() {
    const ua = navigator.userAgent || '';
    let m;
    if (OS === 'windows') return /NT 10/.test(ua) ? 'Windows 11 / 10' : 'Windows';
    if (OS === 'android' && (m = ua.match(/Android\s+([\d.]+)/i))) return 'Android ' + m[1];
    if (OS === 'ios' && (m = ua.match(/OS\s+(\d+)[_\d]*/i))) return 'iOS ' + m[1];
    if (OS === 'mac') return /Ventura|Sonoma|Sequoia/i.test(ua) ? 'macOS reciente' : 'macOS';
    if (OS === 'linux') return 'Distribución GNU/Linux';
    return '';
  }

  const OS_DATA = {
    windows: { name: 'Windows',        icon: '🪟', device: 'Computadora', totalRamGB: 16, defaultCores: 8 },
    linux:   { name: 'Linux',           icon: '🐧', device: 'Computadora', totalRamGB: 8,  defaultCores: 6 },
    mac:     { name: 'macOS',           icon: '🍎', device: 'Mac',         totalRamGB: 8,  defaultCores: 8 },
    android: { name: 'Android',         icon: '🤖', device: 'Teléfono / Tablet', totalRamGB: 6, defaultCores: 8 },
    ios:     { name: 'iOS / iPadOS',    icon: '📱', device: 'iPhone / iPad', totalRamGB: 4,  defaultCores: 6 }
  };

  /* ─────────────── Plantillas de procesos por sistema ───────────────
     baseCpu (% relativo) y baseMem (MB relativo) se escalan al inicio
     para que los totales arranquen en valores realistas.               */
  const PROCESS_TEMPLATES = {
    windows: [
      { name: 'System',              friendly: 'El corazón de Windows',     emoji: '⚙️', category: 'Sistema',    baseCpu: 1.4, baseMem: 140, desc: 'Núcleo del sistema operativo: gestiona memoria, procesos y controladores.' },
      { name: 'explorer.exe',        friendly: 'Explorador de archivos',   emoji: '📁', category: 'Sistema',    baseCpu: 1.8, baseMem: 190, desc: 'Dibuja el escritorio, la barra de tareas y las ventanas de archivos.' },
      { name: 'dwm.exe',            friendly: 'Efectos visuales',         emoji: '🎨', category: 'Sistema',    baseCpu: 2.4, baseMem: 100, desc: 'Composición de ventanas: transparencias, animaciones y sombras.' },
      { name: 'svchost.exe',         friendly: 'Servicios de Windows',     emoji: '🔧', category: 'Servicios',  baseCpu: 2.0, baseMem: 150, desc: 'Agrupa servicios del sistema: red, audio, actualizaciones y más.' },
      { name: 'MsMpEng.exe',         friendly: 'Antivirus Defender',      emoji: '🛡️', category: 'Seguridad',  baseCpu: 3.2, baseMem: 220, desc: 'Windows Defender: te protege en tiempo real contra virus y amenazas.' },
      { name: 'SearchIndexer.exe',   friendly: 'Buscador de archivos',    emoji: '🔍', category: 'Servicios',  baseCpu: 1.6, baseMem: 115, desc: 'Indexa tus archivos para que la búsqueda sea instantánea.', spiky: true },
      { name: 'chrome.exe',          friendly: 'Navegador Chrome',        emoji: '🌐', category: 'Aplicación', baseCpu: 9.0, baseMem: 950, desc: 'Navegador web de Google. Cada pestaña abierta consume memoria extra.', heavy: true },
      { name: 'msedge.exe',          friendly: 'Navegador Edge',          emoji: '🧭', category: 'Aplicación', baseCpu: 3.8, baseMem: 430, desc: 'Navegador web de Microsoft, integrado en Windows.' },
      { name: 'OneDrive.exe',        friendly: 'OneDrive (nube)',          emoji: '☁️', category: 'Servicios',  baseCpu: 1.0, baseMem: 135, desc: 'Sincroniza tus archivos con la nube de Microsoft.' },
      { name: 'RuntimeBroker.exe',   friendly: 'Gestor de permisos',       emoji: '🔐', category: 'Sistema',    baseCpu: 0.8, baseMem: 75,  desc: 'Controla los permisos que piden las aplicaciones de la Tienda.' },
      { name: 'audiodg.exe',         friendly: 'Audio de Windows',        emoji: '🔊', category: 'Servicios',  baseCpu: 1.0, baseMem: 45,  desc: 'Procesa y mezcla el audio de todas las aplicaciones.' },
      { name: 'taskhostw.exe',       friendly: 'Tareas automáticas',       emoji: '🗓️', category: 'Sistema',    baseCpu: 0.6, baseMem: 50,  desc: 'Ejecuta tareas programadas de mantenimiento del sistema.' },
      { name: 'Widgets.exe',         friendly: 'Widgets del escritorio',  emoji: '🧩', category: 'Aplicación', baseCpu: 0.9, baseMem: 160, desc: 'Panel de noticias, clima y tráfico del escritorio.' },
      { name: 'spoolsv.exe',         friendly: 'Cola de impresión',        emoji: '🖨️', category: 'Servicios',  baseCpu: 0.4, baseMem: 35,  desc: 'Gestiona los trabajos de impresión pendientes.' },
      { name: 'ctfmon.exe',          friendly: 'Teclado y escritura',     emoji: '⌨️', category: 'Sistema',    baseCpu: 0.5, baseMem: 40,  desc: 'Servicios de texto, idiomas, dictado y entrada de voz.' },
      { name: 'steam.exe',           friendly: 'Steam (juegos)',           emoji: '🎮', category: 'Aplicación', baseCpu: 2.2, baseMem: 330, desc: 'Plataforma de videojuegos de Valve.' },
      { name: 'Discord.exe',         friendly: 'Discord',                 emoji: '💬', category: 'Aplicación', baseCpu: 1.6, baseMem: 270, desc: 'Chat de voz y texto para comunidades y jugadores.' },
      { name: 'WhatsApp.exe',        friendly: 'WhatsApp',                emoji: '💌', category: 'Aplicación', baseCpu: 0.8, baseMem: 190, desc: 'Mensajería instantánea de escritorio.' },
      { name: 'SecurityHealth.exe',  friendly: 'Seguridad del sistema',   emoji: '🩺', category: 'Seguridad',  baseCpu: 0.7, baseMem: 60,  desc: 'Muestra el estado de seguridad y antivirus en la barra de tareas.' },
      { name: 'backgroundTaskHost.exe', friendly: 'Apps en segundo plano', emoji: '👻', category: 'Servicios', baseCpu: 0.7, baseMem: 65, desc: 'Ejecuta tareas de aplicaciones cerradas, como notificaciones.' }
    ],

    linux: [
      { name: 'systemd',             friendly: 'Director del sistema',    emoji: '⚙️', category: 'Sistema',    baseCpu: 1.2, baseMem: 120, desc: 'El primer proceso de Linux: arranca y supervisa todos los servicios.' },
      { name: 'gnome-shell',         friendly: 'Interfaz GNOME',          emoji: '🐚', category: 'Sistema',    baseCpu: 4.5, baseMem: 420, desc: 'Tu escritorio: panel, ventanas, actividades y animaciones.', heavy: true },
      { name: 'Xorg',                friendly: 'Motor gráfico',           emoji: '🖥️', category: 'Sistema',    baseCpu: 2.6, baseMem: 180, desc: 'Servidor gráfico que dibuja todo lo que ves en pantalla.' },
      { name: 'pipewire',            friendly: 'Audio del sistema',      emoji: '🔊', category: 'Servicios',  baseCpu: 1.0, baseMem: 55,  desc: 'Servidor de audio y video en tiempo real.' },
      { name: 'NetworkManager',      friendly: 'Conexiones de red',      emoji: '📶', category: 'Servicios',  baseCpu: 0.8, baseMem: 45,  desc: 'Gestiona Wi-Fi, Ethernet y VPN.' },
      { name: 'firefox',             friendly: 'Navegador Firefox',      emoji: '🦊', category: 'Aplicación', baseCpu: 8.5, baseMem: 900, desc: 'Navegador web libre y de código abierto.', heavy: true },
      { name: 'code',                friendly: 'VS Code (editor)',       emoji: '🛠️', category: 'Aplicación', baseCpu: 3.0, baseMem: 380, desc: 'Editor de código de Microsoft, muy popular entre programadores.' },
      { name: 'snapd',               friendly: 'Tienda de apps (Snap)',   emoji: '📦', category: 'Servicios',  baseCpu: 0.9, baseMem: 90,  desc: 'Gestiona paquetes Snap y sus actualizaciones.' },
      { name: 'systemd-journald',    friendly: 'Diario de eventos',      emoji: '📜', category: 'Sistema',    baseCpu: 0.7, baseMem: 60,  desc: 'Registra lo que pasa en el sistema (logs).' },
      { name: 'tracker-miner-fs',    friendly: 'Indexador de archivos',  emoji: '🔍', category: 'Servicios',  baseCpu: 1.2, baseMem: 70,  desc: 'Indexa archivos para búsquedas rápidas en GNOME.', spiky: true },
      { name: 'packagekitd',         friendly: 'Actualizaciones',         emoji: '⬆️', category: 'Servicios',  baseCpu: 0.8, baseMem: 65,  desc: 'Descarga e instala actualizaciones de software.' },
      { name: 'nautilus',            friendly: 'Archivos',               emoji: '📁', category: 'Aplicación', baseCpu: 1.0, baseMem: 150, desc: 'El gestor de archivos de GNOME.' },
      { name: 'gnome-terminal-server', friendly: 'Terminal',             emoji: '💻', category: 'Aplicación', baseCpu: 0.6, baseMem: 80,  desc: 'Ventana de línea de comandos.' },
      { name: 'update-notifier',     friendly: 'Avisos de actualización', emoji: '🔔', category: 'Sistema',    baseCpu: 0.4, baseMem: 40,  desc: 'Te avisa cuando hay actualizaciones disponibles.' },
      { name: 'upowerd',             friendly: 'Batería y energía',       emoji: '🔋', category: 'Servicios',  baseCpu: 0.4, baseMem: 35,  desc: 'Informa el nivel de batería y eventos de energía.' },
      { name: 'bluetoothd',          friendly: 'Bluetooth',              emoji: '📡', category: 'Servicios',  baseCpu: 0.4, baseMem: 30,  desc: 'Gestiona las conexiones Bluetooth.' },
      { name: 'cupsd',               friendly: 'Impresión',              emoji: '🖨️', category: 'Servicios',  baseCpu: 0.3, baseMem: 25,  desc: 'Servidor de impresión (CUPS).' },
      { name: 'dockerd',             friendly: 'Docker (contenedores)',  emoji: '🐳', category: 'Aplicación', baseCpu: 2.0, baseMem: 200, desc: 'Ejecuta contenedores: mini-máquinas para programas.' }
    ],

    mac: [
      { name: 'kernel_task',        friendly: 'Núcleo de macOS',         emoji: '⚙️', category: 'Sistema',    baseCpu: 2.0, baseMem: 160, desc: 'El corazón de macOS: gestiona memoria, procesos y hardware.' },
      { name: 'WindowServer',        friendly: 'Motor de ventanas',      emoji: '🪟', category: 'Sistema',    baseCpu: 3.4, baseMem: 210, desc: 'Composición de pantalla: dibuja ventanas y animaciones fluidas.', heavy: true },
      { name: 'Finder',             friendly: 'Finder',                  emoji: '📁', category: 'Sistema',    baseCpu: 1.2, baseMem: 130, desc: 'El explorador de archivos de la Mac.' },
      { name: 'Dock',                friendly: 'Barra Dock',              emoji: '🚢', category: 'Sistema',    baseCpu: 0.9, baseMem: 90,  desc: 'La barra de accesos directos de abajo.' },
      { name: 'launchd',             friendly: 'Director de arranque',   emoji: '🚀', category: 'Sistema',    baseCpu: 0.6, baseMem: 45,  desc: 'El primer proceso: lanza servicios y apps al encender.' },
      { name: 'mds_stores',          friendly: 'Indexador Spotlight',    emoji: '🔍', category: 'Servicios',  baseCpu: 1.4, baseMem: 80,  desc: 'Indexa archivos para la búsqueda Spotlight.', spiky: true },
      { name: 'Safari',              friendly: 'Navegador Safari',       emoji: '🧭', category: 'Aplicación', baseCpu: 7.5, baseMem: 780, desc: 'Navegador web de Apple, optimizado para la Mac.', heavy: true },
      { name: 'coreaudiod',          friendly: 'Audio de la Mac',         emoji: '🔊', category: 'Servicios',  baseCpu: 0.8, baseMem: 40,  desc: 'Procesa todo el audio del sistema.' },
      { name: 'hidd',                friendly: 'Teclado y ratón',        emoji: '🖱️', category: 'Servicios',  baseCpu: 0.5, baseMem: 30,  desc: 'Gestiona dispositivos de entrada (teclado, ratón, trackpad).' },
      { name: 'bluetoothd',          friendly: 'Bluetooth',              emoji: '📡', category: 'Servicios',  baseCpu: 0.4, baseMem: 28,  desc: 'Conexiones Bluetooth de la Mac.' },
      { name: 'backupd',             friendly: 'Time Machine',           emoji: '💾', category: 'Servicios',  baseCpu: 1.0, baseMem: 120, desc: 'Copias de seguridad automáticas.', spiky: true },
      { name: 'photolibraryd',       friendly: 'Fotos de Apple',          emoji: '🖼️', category: 'Aplicación', baseCpu: 1.0, baseMem: 140, desc: 'Gestiona la biblioteca de Fotos y su sincronización.' },
      { name: 'configd',             friendly: 'Configuración de red',    emoji: '🌐', category: 'Servicios',  baseCpu: 0.5, baseMem: 35,  desc: 'Ajusta las conexiones de red automáticamente.' },
      { name: 'powerd',              friendly: 'Energía',                emoji: '🔋', category: 'Sistema',    baseCpu: 0.4, baseMem: 25,  desc: 'Administra batería, carga y rendimiento.' },
      { name: 'coreservicesd',       friendly: 'Servicios del sistema',  emoji: '🧩', category: 'Sistema',    baseCpu: 0.6, baseMem: 50,  desc: 'Coordina servicios centrales de macOS.' },
      { name: 'Messages',            friendly: 'Mensajes (iMessage)',    emoji: '💬', category: 'Aplicación', baseCpu: 0.8, baseMem: 160, desc: 'La app de mensajes de Apple.' }
    ],

    android: [
      { name: 'com.android.systemui',   friendly: 'Interfaz del sistema', emoji: '📱', category: 'Sistema',    baseCpu: 2.2, baseMem: 320, desc: 'Barra de estado, notificaciones y navegación del teléfono.' },
      { name: 'com.google.android.gms', friendly: 'Servicios de Google',  emoji: '🤖', category: 'Servicios',  baseCpu: 3.0, baseMem: 420, desc: 'Base de Google Play: ubicación, cuentas y notificaciones push.', spiky: true },
      { name: 'zygote',                friendly: 'Arranque de apps',     emoji: '🐣', category: 'Sistema',    baseCpu: 1.0, baseMem: 150, desc: 'Plantilla que crea y lanza todas las aplicaciones.' },
      { name: 'surfaceflinger',         friendly: 'Motor gráfico',       emoji: '🖼️', category: 'Sistema',    baseCpu: 2.5, baseMem: 180, desc: 'Dibuja en pantalla todo lo que ves y sus animaciones.' },
      { name: 'com.android.launcher3',  friendly: 'Pantalla de inicio',  emoji: '🏠', category: 'Sistema',    baseCpu: 1.2, baseMem: 210, desc: 'Tu escritorio con iconos y widgets.' },
      { name: 'com.android.chrome',     friendly: 'Chrome',              emoji: '🌐', category: 'Aplicación', baseCpu: 6.0, baseMem: 620, desc: 'Navegador web de Google en el teléfono.', heavy: true },
      { name: 'com.whatsapp',           friendly: 'WhatsApp',            emoji: '💬', category: 'Aplicación', baseCpu: 2.0, baseMem: 380, desc: 'Mensajería instantánea: chats, llamadas y multimedia.', heavy: true },
      { name: 'com.instagram',          friendly: 'Instagram',           emoji: '📷', category: 'Aplicación', baseCpu: 1.6, baseMem: 340, desc: 'Red social de fotos y videos.' },
      { name: 'com.spotify.music',       friendly: 'Spotify',             emoji: '🎵', category: 'Aplicación', baseCpu: 1.4, baseMem: 290, desc: 'Reproductor de música en streaming.' },
      { name: 'com.google.android.youtube', friendly: 'YouTube',         emoji: '▶️', category: 'Aplicación', baseCpu: 1.8, baseMem: 310, desc: 'Plataforma de videos de Google.' },
      { name: 'com.android.phone',      friendly: 'Teléfono',            emoji: '☎️', category: 'Sistema',    baseCpu: 0.8, baseMem: 95,  desc: 'Gestiona llamadas y datos móviles.' },
      { name: 'com.android.settings',   friendly: 'Ajustes',             emoji: '⚙️', category: 'Sistema',    baseCpu: 0.6, baseMem: 85,  desc: 'La app de configuración del teléfono.' },
      { name: 'com.google.android.tts', friendly: 'Voz del teléfono',    emoji: '🗣️', category: 'Servicios',  baseCpu: 0.7, baseMem: 70,  desc: 'Convierte texto en voz (accesibilidad, navegación).' },
      { name: 'com.android.providers.media', friendly: 'Multimedia',    emoji: '🎬', category: 'Sistema',    baseCpu: 0.9, baseMem: 110, desc: 'Escanea y organiza fotos, videos y música.', spiky: true },
      { name: 'com.google.android.gm',  friendly: 'Gmail',               emoji: '✉️', category: 'Aplicación', baseCpu: 0.8, baseMem: 160, desc: 'Correo electrónico de Google.' },
      { name: 'com.android.vending',    friendly: 'Play Store',          emoji: '🛒', category: 'Aplicación', baseCpu: 0.7, baseMem: 120, desc: 'Tienda de aplicaciones de Android.' }
    ],

    ios: [
      { name: 'SpringBoard',              friendly: 'Pantalla de inicio', emoji: '🏠', category: 'Sistema',    baseCpu: 2.0, baseMem: 210, desc: 'Tu pantalla de inicio, iconos y carpetas.' },
      { name: 'backboardd',               friendly: 'Tareas en segundo plano', emoji: '⚙️', category: 'Sistema', baseCpu: 1.4, baseMem: 90,  desc: 'Gestiona gestos, multitarea y eventos de pantalla.' },
      { name: 'mediaserverd',             friendly: 'Multimedia',        emoji: '🎵', category: 'Servicios',  baseCpu: 1.2, baseMem: 75,  desc: 'Reproduce música, video y sonido del sistema.' },
      { name: 'com.apple.mobilesafari',   friendly: 'Safari',             emoji: '🧭', category: 'Aplicación', baseCpu: 5.5, baseMem: 480, desc: 'Navegador web de Apple.', heavy: true },
      { name: 'imagentd',                 friendly: 'iMessage',           emoji: '💬', category: 'Aplicación', baseCpu: 1.0, baseMem: 130, desc: 'Servicio de mensajería de Apple.' },
      { name: 'locationd',                friendly: 'Ubicación',          emoji: '📍', category: 'Servicios',  baseCpu: 1.0, baseMem: 60,  desc: 'Gestiona GPS y ubicación de las apps.', spiky: true },
      { name: 'wifid',                    friendly: 'Wi-Fi',             emoji: '📶', category: 'Servicios',  baseCpu: 0.7, baseMem: 45,  desc: 'Conexión a redes Wi-Fi.' },
      { name: 'bluetoothd',               friendly: 'Bluetooth',          emoji: '📡', category: 'Servicios',  baseCpu: 0.5, baseMem: 38,  desc: 'Conexiones Bluetooth del dispositivo.' },
      { name: 'cloudphotod',              friendly: 'Fotos de iCloud',   emoji: '☁️', category: 'Aplicación', baseCpu: 1.2, baseMem: 160, desc: 'Sincroniza tu biblioteca de fotos con iCloud.', spiky: true },
      { name: 'powerd',                   friendly: 'Energía',            emoji: '🔋', category: 'Sistema',    baseCpu: 0.5, baseMem: 30,  desc: 'Administra batería y carga optimizada.' },
      { name: 'securityd',               friendly: 'Seguridad',          emoji: '🔐', category: 'Seguridad',  baseCpu: 0.6, baseMem: 42,  desc: 'Gestiona llaves, cifrado y Face ID.' },
      { name: 'appstored',                friendly: 'App Store',          emoji: '📦', category: 'Aplicación', baseCpu: 0.7, baseMem: 95,  desc: 'Descarga y actualiza aplicaciones.' }
    ]
  };

  /* ─────────────────── Constructor del simulador ─────────────────── */
  const osData = OS_DATA[OS];
  const cores = navigator.hardwareConcurrency || osData.defaultCores;
  // navigator.deviceMemory da la RAM aproximada (solo en algunos navegadores)
  const totalRamGB = navigator.deviceMemory || osData.totalRamGB;
  const totalRamMB = totalRamGB * 1024;

  // Tiempo encendido (simulado): entre 10 minutos y 3 días
  const uptimeMs = rand(10 * 60e3, 72 * 3600e3);

  // Instanciar procesos con PID y escalado realista
  const templates = PROCESS_TEMPLATES[OS];
  const targetCpuStart = rand(22, 38);          // % de CPU al arrancar
  const targetRamStartPct = rand(45, 62);       // % de RAM al arrancar
  const sumBaseCpu = templates.reduce((s, t) => s + t.baseCpu, 0);
  const sumBaseMem = templates.reduce((s, t) => s + t.baseMem, 0);
  const cpuScale = (targetCpuStart - 4) / sumBaseCpu;
  const memScale = (targetRamStartPct / 100 * totalRamMB * 0.82) / sumBaseMem;

  const processes = templates.map((t) => ns.processMeta.decorate({
    ...t,
    baseCpu: t.baseCpu * cpuScale,
    baseMem: t.baseMem * memScale,
    pid: Math.floor(rand(120, 9800)),
    cpu: 0,
    mem: 0,
    spike: 0,
    phase: rand(0, Math.PI * 2)
  }));

  /* ─────────────────────── Tick de simulación ─────────────────────── */
  let t = 0;
  const series = [];   // historial corto para la gráfica en vivo
  const SERIES_MAX = 60;

  function tick() {
    t++;

    let sumCpu = 0, sumMemMB = 0;

    for (const p of processes) {
      // Caminata aleatoria suave alrededor de su base
      const osc = 0.65 + Math.sin(t / 6 + p.phase) * 0.22 + Math.random() * 0.35;
      let targetCpu = p.baseCpu * osc;

      // Picos ocasionales (indexadores, sincronización…)
      if (p.spiky && Math.random() < 0.045) p.spike = rand(6, 26);
      if (p.spike > 0.4) {
        targetCpu += p.spike;
        p.spike *= 0.62;                       // el pico se disipa
      }

      p.cpu = clamp(lerp(p.cpu, targetCpu, 0.38), 0.05, 62);
      p.mem = clamp(lerp(p.mem, p.baseMem * (0.9 + Math.random() * 0.2), 0.15), 8, totalRamMB);

      sumCpu += p.cpu;
      sumMemMB += p.mem;
    }

    const cpu = clamp(sumCpu + 2.5 + Math.random() * 3, 3, 97);          // + overhead del SO
    const ramUsedMB = sumMemMB + totalRamMB * 0.16;                       // + memoria del sistema
    const ramPct = clamp((ramUsedMB / totalRamMB) * 100, 5, 97);

    const temp = clamp(38 + cpu * 0.45 + rand(-2, 2), 32, 92);            // °C simulados
    const freq = (1.2 + (cpu / 100) * 2.4 + rand(-0.05, 0.05)).toFixed(2); // GHz simulados

    const sorted = processes.slice().sort((a, b) => b.cpu - a.cpu);

    const snapshot = {
      time: Date.now(),
      tick: t,
      os: OS,
      cpu,
      ramPct,
      ramUsedMB,
      ramTotalMB: totalRamMB,
      temp,
      freq,
      cores,
      uptimeMs,
      processes: sorted,
      processCount: processes.length
    };
    snapshot.health = healthScore(snapshot);

    series.push({ cpu, ram: ramPct });
    if (series.length > SERIES_MAX) series.shift();

    return snapshot;
  }

  function healthScore(s, bonus) {
    let score = 100;
    if (s.cpu > 50) score -= (s.cpu - 50) * 0.9;
    if (s.ramPct > 55) score -= (s.ramPct - 55) * 0.75;
    if (!s.real && s.processCount > 26) score -= (s.processCount - 26) * 1.6;
    // Bonus por recomendaciones aplicadas (máx. +15)
    score += Math.min(3 * (bonus || 0), 15);
    return Math.round(clamp(score, 4, 100));
  }

  /* ── Convierte la respuesta real del servidor en un snapshot
     con la misma forma que produce el simulador ── */
  function buildRealSnapshot(r) {
    const platformMap = { win32: 'windows', linux: 'linux', darwin: 'mac' };
    const osKey = platformMap[r.platform] || 'windows';

    let processes;
    let processCount;
    if (Array.isArray(r.processes) && r.processes.length) {
      processes = r.processes.map((p) => ns.processMeta.decorate({
        pid: p.pid,
        name: p.name,
        cpu: p.cpu || 0,
        mem: p.memMB || 0,
        user: p.user || null
      }));
      processCount = r.processCount || processes.length;
    } else {
      // El muestreo real falló → lista simulada coherente
      const sim = tick();
      processes = sim.processes;
      processCount = sim.processCount;
    }

    const cpu = typeof r.cpu === 'number' ? r.cpu : 0;
    return {
      time: r.ts || Date.now(),
      real: true,
      os: osKey,
      cpu,
      ramPct: r.ramPct || 0,
      ramUsedMB: r.ramUsedMB || 0,
      ramTotalMB: r.ramTotalMB || totalRamMB,
      // Temperatura/frecuencia no se pueden leer de forma portable: se estiman
      temp: clamp(38 + cpu * 0.45 + rand(-2, 2), 32, 92),
      freq: (1.2 + (cpu / 100) * 2.4 + rand(-0.05, 0.05)).toFixed(2),
      cores: r.cores || cores,
      uptimeMs: r.uptimeMs || 0,
      processes,
      processCount
    };
  }

  /* ───────────────────────── API pública ───────────────────────── */
  ns.system = {
    os: OS,
    osName: osData.name,
    osIcon: osData.icon,
    osDevice: osData.device,
    osVersion: osVersion(),
    cores,
    totalRamGB,
    totalRamMB,
    tick,
    healthScore,
    getSeries: () => series.slice()
  };
  ns.buildRealSnapshot = buildRealSnapshot;

})(window.OptiCore);
