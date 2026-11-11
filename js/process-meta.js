/* ════════════════════════════════════════════════════════════════
   OptiCore — process-meta.js
   Catálogo de procesos conocidos: nombre amigable, emoji, categoría,
   descripción y si se puede cerrar con seguridad:
     'safe'    → puedes cerrarlo sin miedo
     'caution' → ciérralo solo si sabes qué es
     'never'   → ¡no lo cierres! es crítico del sistema
   Usado tanto por la simulación como por los procesos reales del
   servidor (data.js decorate()).
   ════════════════════════════════════════════════════════════════ */
window.OptiCore = window.OptiCore || {};

(function (ns) {
  'use strict';

  const DEFAULT_TIP = 'Si no estás seguro de qué es este proceso, mejor déjalo abierto.';

  const META = {
    /* ── Windows: sistema ── */
    'system': { friendly: 'Núcleo de Windows', emoji: '⚙️', category: 'Sistema', closable: 'never', desc: 'El corazón de Windows: gestiona memoria, procesos y hardware.' },
    'registry': { friendly: 'Registro de Windows', emoji: '📚', category: 'Sistema', closable: 'never', desc: 'Guarda la configuración del sistema. Jamás lo cierres.' },
    'smss': { friendly: 'Gestor de sesiones', emoji: '🔐', category: 'Sistema', closable: 'never', desc: 'Prepara tu sesión de usuario al encender.' },
    'csrss': { friendly: 'Subsistema cliente/servidor', emoji: '⚙️', category: 'Sistema', closable: 'never', desc: 'Componente esencial de la interfaz de Windows.' },
    'wininit': { friendly: 'Arranque de Windows', emoji: '🚀', category: 'Sistema', closable: 'never', desc: 'Inicia los servicios del sistema durante el arranque.' },
    'services': { friendly: 'Servicios de Windows', emoji: '🔧', category: 'Sistema', closable: 'never', desc: 'Controla los servicios en segundo plano del sistema.' },
    'lsass': { friendly: 'Autoridad de seguridad local', emoji: '🛡️', category: 'Seguridad', closable: 'never', desc: 'Gestiona inicios de sesión y políticas de seguridad.' },
    'winlogon': { friendly: 'Inicio de sesión', emoji: '🔑', category: 'Sistema', closable: 'never', desc: 'Gestiona el proceso de inicio de sesión de Windows.' },
    'svchost': { friendly: 'Servicios del sistema', emoji: '🔧', category: 'Servicios', closable: 'never', desc: 'Agrupa servicios del sistema: red, audio, actualizaciones…' },
    'dwm': { friendly: 'Efectos visuales', emoji: '🎨', category: 'Sistema', closable: 'never', desc: 'Composición de ventanas: transparencias y animaciones.' },
    'fontdrvhost': { friendly: 'Fuentes del sistema', emoji: '🔤', category: 'Sistema', closable: 'never', desc: 'Carga las fuentes tipográficas de Windows.' },
    'sihost': { friendly: 'Shell de interfaz', emoji: '🖥️', category: 'Sistema', closable: 'never', desc: 'Soporta elementos de la interfaz de usuario.' },
    'taskhostw': { friendly: 'Tareas automáticas', emoji: '🗓️', category: 'Sistema', closable: 'never', desc: 'Ejecuta tareas programadas de mantenimiento.' },
    'audiodg': { friendly: 'Audio de Windows', emoji: '🔊', category: 'Servicios', closable: 'never', desc: 'Procesa el audio de todas las aplicaciones.' },
    'searchindexer': { friendly: 'Buscador de archivos', emoji: '🔍', category: 'Servicios', closable: 'caution', desc: 'Indexa archivos para búsquedas rápidas. Puede dar picos de CPU.', closeTip: 'No lo cierres directamente: pausa la indexación en Configuración → Buscar → Buscar en Windows.' },
    'searchprotocolhost': { friendly: 'Indexación de búsqueda', emoji: '🔍', category: 'Servicios', closable: 'caution', desc: 'Ayuda al indexador a rastrear archivos nuevos.' },
    'msmpeng': { friendly: 'Antivirus Defender', emoji: '🛡️', category: 'Seguridad', closable: 'never', desc: 'Windows Defender: te protege en tiempo real contra amenazas.' },
    'nissrv': { friendly: 'Red de inspección Defender', emoji: '🛡️', category: 'Seguridad', closable: 'never', desc: 'Análisis de tráfico de red del antivirus.' },
    'securityhealthservice': { friendly: 'Seguridad del sistema', emoji: '🩺', category: 'Seguridad', closable: 'never', desc: 'Estado de seguridad y antivirus en la barra de tareas.' },
    'securityhealth': { friendly: 'Icono de seguridad', emoji: '🩺', category: 'Seguridad', closable: 'never', desc: 'Muestra el estado de seguridad en la barra de tareas.' },
    'startmenuexperiencehost': { friendly: 'Menú Inicio', emoji: '🪟', category: 'Sistema', closable: 'never', desc: 'Gestiona el menú Inicio de Windows 11.' },
    'searchapp': { friendly: 'Búsqueda de Windows', emoji: '🔍', category: 'Sistema', closable: 'never', desc: 'Interfaz de búsqueda del sistema.' },
    'spoolsv': { friendly: 'Cola de impresión', emoji: '🖨️', category: 'Servicios', closable: 'caution', desc: 'Gestiona trabajos de impresión pendientes.', closeTip: 'Ciérralo solo si la impresora se quedó colgada; se reinicia sola.' },
    'conhost': { friendly: 'Consola de comandos', emoji: '⌨️', category: 'Sistema', closable: 'caution', desc: 'Dibuja ventanas de terminal antiguas.' },
    'dllhost': { friendly: 'Host de COM', emoji: '🔗', category: 'Sistema', closable: 'caution', desc: 'Ejecuta componentes del sistema en procesos aislados.' },
    'runtimebroker': { friendly: 'Gestor de permisos', emoji: '🔐', category: 'Sistema', closable: 'caution', desc: 'Controla los permisos de las apps de la Tienda.' },
    'ctfmon': { friendly: 'Teclado y escritura', emoji: '⌨️', category: 'Sistema', closable: 'caution', desc: 'Texto, idiomas, dictado y entrada de voz.' },
    'explorer': { friendly: 'Explorador de Windows', emoji: '📁', category: 'Sistema', closable: 'caution', desc: 'Tu escritorio, barra de tareas y ventanas de archivos.', closeTip: 'Si lo cierras desaparece la barra de tareas. Se recupera con Ctrl+Mayús+Esc → Archivo → Ejecutar nueva tarea → "explorer.exe".' },

    /* ── Windows: apps comunes ── */
    'onedrive': { friendly: 'OneDrive (nube)', emoji: '☁️', category: 'Servicios', closable: 'safe', desc: 'Sincroniza tus archivos con la nube de Microsoft.', closeTip: 'Puedes cerrarlo sin miedo: tus archivos locales siguen ahí. Para que no arranque: Configuración de OneDrive → desvincular.' },
    'widgets': { friendly: 'Widgets del escritorio', emoji: '🧩', category: 'Aplicación', closable: 'safe', desc: 'Panel de noticias, clima y tráfico.', closeTip: 'Se puede cerrar o desactivar en Configuración → Personalización → Barra de tareas.' },
    'widgetservice': { friendly: 'Servicio de widgets', emoji: '🧩', category: 'Aplicación', closable: 'safe', desc: 'Soporte de los widgets del escritorio.' },
    'backgroundtaskhost': { friendly: 'Apps en segundo plano', emoji: '👻', category: 'Servicios', closable: 'caution', desc: 'Ejecuta tareas de apps cerradas (notificaciones).' },

    /* ── Navegadores y apps multiplataforma ── */
    'chrome': { friendly: 'Navegador Chrome', emoji: '🌐', category: 'Aplicación', closable: 'safe', desc: 'Navegador web de Google. Cada pestaña abierta consume memoria.', closeTip: 'Ciérralo con normalidad; si no responde, finalízalo desde el Administrador de tareas.' },
    'msedge': { friendly: 'Navegador Edge', emoji: '🧭', category: 'Aplicación', closable: 'safe', desc: 'Navegador web de Microsoft.' },
    'firefox': { friendly: 'Navegador Firefox', emoji: '🦊', category: 'Aplicación', closable: 'safe', desc: 'Navegador web libre y de código abierto.' },
    'brave': { friendly: 'Navegador Brave', emoji: '🦁', category: 'Aplicación', closable: 'safe', desc: 'Navegador web centrado en privacidad.' },
    'opera': { friendly: 'Navegador Opera', emoji: '🎭', category: 'Aplicación', closable: 'safe', desc: 'Navegador web con funciones integradas.' },
    'safari': { friendly: 'Navegador Safari', emoji: '🧭', category: 'Aplicación', closable: 'safe', desc: 'Navegador web de Apple.' },
    'com.apple.mobilesafari': { friendly: 'Navegador Safari', emoji: '🧭', category: 'Aplicación', closable: 'safe', desc: 'Navegador web de Apple en iPhone/iPad.' },
    'code': { friendly: 'VS Code (editor)', emoji: '🛠️', category: 'Aplicación', closable: 'safe', desc: 'Editor de código de Microsoft.' },
    'steam': { friendly: 'Steam (juegos)', emoji: '🎮', category: 'Aplicación', closable: 'safe', desc: 'Plataforma de videojuegos de Valve.' },
    'steamwebhelper': { friendly: 'Interfaz de Steam', emoji: '🎮', category: 'Aplicación', closable: 'safe', desc: 'Dibuja la tienda y la interfaz de Steam.' },
    'discord': { friendly: 'Discord', emoji: '💬', category: 'Aplicación', closable: 'safe', desc: 'Chat de voz y texto para comunidades.' },
    'whatsapp': { friendly: 'WhatsApp', emoji: '💌', category: 'Aplicación', closable: 'safe', desc: 'Mensajería instantánea.' },
    'com.whatsapp': { friendly: 'WhatsApp', emoji: '💌', category: 'Aplicación', closable: 'safe', desc: 'Mensajería instantánea: chats, llamadas y multimedia.' },
    'telegram': { friendly: 'Telegram', emoji: '✈️', category: 'Aplicación', closable: 'safe', desc: 'Mensajería con canales y grupos.' },
    'spotify': { friendly: 'Spotify', emoji: '🎵', category: 'Aplicación', closable: 'safe', desc: 'Reproductor de música en streaming.' },
    'com.spotify.music': { friendly: 'Spotify', emoji: '🎵', category: 'Aplicación', closable: 'safe', desc: 'Reproductor de música en streaming.' },
    'zoom': { friendly: 'Zoom', emoji: '📹', category: 'Aplicación', closable: 'safe', desc: 'Videollamadas y reuniones.' },
    'teams': { friendly: 'Microsoft Teams', emoji: '👥', category: 'Aplicación', closable: 'safe', desc: 'Chat y videollamadas de oficina.' },
    'outlook': { friendly: 'Outlook', emoji: '✉️', category: 'Aplicación', closable: 'safe', desc: 'Cliente de correo de Microsoft.' },
    'com.google.android.gm': { friendly: 'Gmail', emoji: '✉️', category: 'Aplicación', closable: 'safe', desc: 'Correo electrónico de Google.' },
    'instagram': { friendly: 'Instagram', emoji: '📷', category: 'Aplicación', closable: 'safe', desc: 'Red social de fotos y videos.' },
    'com.instagram': { friendly: 'Instagram', emoji: '📷', category: 'Aplicación', closable: 'safe', desc: 'Red social de fotos y videos.' },
    'com.google.android.youtube': { friendly: 'YouTube', emoji: '▶️', category: 'Aplicación', closable: 'safe', desc: 'Plataforma de videos de Google.' },
    'com.android.chrome': { friendly: 'Chrome', emoji: '🌐', category: 'Aplicación', closable: 'safe', desc: 'Navegador web de Google en el teléfono.' },
    'javaw': { friendly: 'Aplicación Java', emoji: '☕', category: 'Aplicación', closable: 'caution', desc: 'Programa que usa Java (a veces Minecraft u otros juegos).' },
    'docker': { friendly: 'Docker (contenedores)', emoji: '🐳', category: 'Aplicación', closable: 'caution', desc: 'Ejecuta contenedores: mini-máquinas para programas.', closeTip: 'Ciérralo solo si no estás usando contenedores; detiene los que estén corriendo.' },
    'dockerd': { friendly: 'Docker (contenedores)', emoji: '🐳', category: 'Aplicación', closable: 'caution', desc: 'Motor de contenedores Docker.' },
    'com.docker.backend': { friendly: 'Docker Desktop', emoji: '🐳', category: 'Aplicación', closable: 'caution', desc: 'Servicios del escritorio de Docker.' },

    /* ── Linux: sistema ── */
    'systemd': { friendly: 'Director del sistema', emoji: '⚙️', category: 'Sistema', closable: 'never', desc: 'El primer proceso de Linux: arranca y supervisa todos los servicios.' },
    'init': { friendly: 'Init del sistema', emoji: '⚙️', category: 'Sistema', closable: 'never', desc: 'Proceso ancestro del sistema.' },
    'gnome-shell': { friendly: 'Interfaz GNOME', emoji: '🐚', category: 'Sistema', closable: 'never', desc: 'Tu escritorio: panel, ventanas, actividades y animaciones.' },
    'kwin_wayland': { friendly: 'Interfaz KDE', emoji: '🐚', category: 'Sistema', closable: 'never', desc: 'El escritorio KDE Plasma.' },
    'kwin_x11': { friendly: 'Interfaz KDE', emoji: '🐚', category: 'Sistema', closable: 'never', desc: 'El escritorio KDE Plasma.' },
    'plasmashell': { friendly: 'Escritorio Plasma', emoji: '🐚', category: 'Sistema', closable: 'never', desc: 'El escritorio KDE Plasma.' },
    'xorg': { friendly: 'Motor gráfico', emoji: '🖥️', category: 'Sistema', closable: 'never', desc: 'Servidor gráfico que dibuja todo lo que ves en pantalla.' },
    'xorg.bin': { friendly: 'Motor gráfico', emoji: '🖥️', category: 'Sistema', closable: 'never', desc: 'Servidor gráfico que dibuja la pantalla.' },
    'xwayland': { friendly: 'Capa de compatibilidad X11', emoji: '🪄', category: 'Sistema', closable: 'never', desc: 'Ejecuta apps antiguas dentro de sesiones Wayland.' },
    'pipewire': { friendly: 'Audio del sistema', emoji: '🔊', category: 'Servicios', closable: 'never', desc: 'Servidor de audio y video en tiempo real.' },
    'pipewire-pulse': { friendly: 'Audio ( PulseAudio)', emoji: '🔊', category: 'Servicios', closable: 'never', desc: 'Compatibilidad de audio para apps antiguas.' },
    'wireplumber': { friendly: 'Gestor de audio', emoji: '🎛️', category: 'Servicios', closable: 'never', desc: 'Configura rutas y dispositivos de audio.' },
    'pulseaudio': { friendly: 'Audio del sistema', emoji: '🔊', category: 'Servicios', closable: 'never', desc: 'Servidor de audio clásico de Linux.' },
    'networkmanager': { friendly: 'Conexiones de red', emoji: '📶', category: 'Servicios', closable: 'never', desc: 'Gestiona Wi-Fi, Ethernet y VPN.' },
    'packagekitd': { friendly: 'Actualizaciones', emoji: '⬆️', category: 'Servicios', closable: 'caution', desc: 'Descarga e instala actualizaciones de software.' },
    'packagekit': { friendly: 'Actualizaciones', emoji: '⬆️', category: 'Servicios', closable: 'caution', desc: 'Descarga e instala actualizaciones de software.' },
    'tracker-miner-fs': { friendly: 'Indexador de archivos', emoji: '🔍', category: 'Servicios', closable: 'caution', desc: 'Indexa archivos para búsquedas rápidas en GNOME.', closeTip: 'Puedes limitarlo en Configuración → Buscar, o cerrarlo: se relanza solo.' },
    'tracker-miner': { friendly: 'Indexador de archivos', emoji: '🔍', category: 'Servicios', closable: 'caution', desc: 'Indexa archivos para búsquedas.' },
    'snapd': { friendly: 'Tienda de apps (Snap)', emoji: '📦', category: 'Servicios', closable: 'caution', desc: 'Gestiona paquetes Snap y sus actualizaciones.' },
    'upowerd': { friendly: 'Batería y energía', emoji: '🔋', category: 'Servicios', closable: 'never', desc: 'Informa el nivel de batería y eventos de energía.' },
    'bluetoothd': { friendly: 'Bluetooth', emoji: '📡', category: 'Servicios', closable: 'caution', desc: 'Gestiona las conexiones Bluetooth.' },
    'cupsd': { friendly: 'Impresión', emoji: '🖨️', category: 'Servicios', closable: 'caution', desc: 'Servidor de impresión (CUPS).' },
    'sshd': { friendly: 'Servidor SSH', emoji: '🔐', category: 'Servicios', closable: 'caution', desc: 'Permite conexiones remotas seguras.' },
    'systemd-journald': { friendly: 'Diario de eventos', emoji: '📜', category: 'Sistema', closable: 'never', desc: 'Registra lo que pasa en el sistema (logs).' },
    'systemd-resolved': { friendly: 'Resolución DNS', emoji: '🌐', category: 'Servicios', closable: 'never', desc: 'Traduce nombres de dominio a direcciones IP.' },
    'systemd-logind': { friendly: 'Sesiones de usuario', emoji: '🪪', category: 'Sistema', closable: 'never', desc: 'Gestiona inicios de sesión y sesiones.' },
    'systemd-udevd': { friendly: 'Dispositivos', emoji: '🔌', category: 'Sistema', closable: 'never', desc: 'Detecta y configura hardware conectado.' },
    'xdg-desktop-portal': { friendly: 'Puente de escritorio', emoji: '🌉', category: 'Sistema', closable: 'caution', desc: 'Permite que las apps modernas abran archivos y ventanas.' },
    'nautilus': { friendly: 'Archivos', emoji: '📁', category: 'Aplicación', closable: 'safe', desc: 'El gestor de archivos de GNOME.' },
    'gnome-terminal': { friendly: 'Terminal', emoji: '💻', category: 'Aplicación', closable: 'safe', desc: 'Ventana de línea de comandos.' },
    'gnome-terminal-server': { friendly: 'Terminal', emoji: '💻', category: 'Aplicación', closable: 'safe', desc: 'Ventana de línea de comandos.' },
    'update-notifier': { friendly: 'Avisos de actualización', emoji: '🔔', category: 'Sistema', closable: 'safe', desc: 'Te avisa cuando hay actualizaciones.' },
    'node': { friendly: 'Node.js', emoji: '🟩', category: 'Aplicación', closable: 'caution', desc: 'Ejecuta JavaScript fuera del navegador (¡quizá sea el propio OptiCore!).', closeTip: 'Si es OptiCore, ciérralo con Ctrl+C en la terminal donde corre el servidor.' },
    'python3': { friendly: 'Python 3', emoji: '🐍', category: 'Aplicación', closable: 'caution', desc: 'Programa escrito en Python. Puede ser un servicio importante.' },
    'python': { friendly: 'Python', emoji: '🐍', category: 'Aplicación', closable: 'caution', desc: 'Programa escrito en Python.' },
    'bash': { friendly: 'Terminal bash', emoji: '🐚', category: 'Aplicación', closable: 'safe', desc: 'Intérprete de comandos.' },
    'sh': { friendly: 'Shell del sistema', emoji: '🐚', category: 'Aplicación', closable: 'caution', desc: 'Intérprete de comandos de un script en ejecución.' },
    'mysqld': { friendly: 'Base de datos MySQL/MariaDB', emoji: '🗄️', category: 'Servicios', closable: 'caution', desc: 'Servidor de base de datos: puede estar dando servicio a otras apps.', closeTip: 'Ciérralo solo si ninguna aplicación tuya usa esta base de datos.' },
    'postgres': { friendly: 'PostgreSQL', emoji: '🐘', category: 'Servicios', closable: 'caution', desc: 'Servidor de base de datos PostgreSQL.', closeTip: 'Ciérralo solo si ninguna aplicación tuya usa esta base de datos.' },
    'java': { friendly: 'Aplicación Java', emoji: '☕', category: 'Aplicación', closable: 'caution', desc: 'Programa que usa Java (servicios, juegos, IDEs…).' },
    'ollama': { friendly: 'Ollama (IA local)', emoji: '🦙', category: 'Aplicación', closable: 'caution', desc: 'Ejecuta modelos de IA en local. Consume mucha RAM.', closeTip: 'Ciérralo si no estás usando modelos de IA ahora mismo.' },

    /* ── macOS: sistema ── */
    'kernel_task': { friendly: 'Núcleo de macOS', emoji: '⚙️', category: 'Sistema', closable: 'never', desc: 'El corazón de macOS: memoria, procesos y hardware.' },
    'windowserver': { friendly: 'Motor de ventanas', emoji: '🪟', category: 'Sistema', closable: 'never', desc: 'Dibuja todo lo que ves en pantalla.' },
    'launchd': { friendly: 'Director de arranque', emoji: '🚀', category: 'Sistema', closable: 'never', desc: 'El primer proceso: lanza servicios y apps al encender.' },
    'finder': { friendly: 'Finder', emoji: '📁', category: 'Sistema', closable: 'caution', desc: 'El explorador de archivos de la Mac.', closeTip: 'Si lo cierras, se reinicia solo al volver a abrir una carpeta.' },
    'dock': { friendly: 'Barra Dock', emoji: '🚢', category: 'Sistema', closable: 'caution', desc: 'La barra de accesos directos de abajo.', closeTip: 'Se relanza sola tras unos segundos.' },
    'coreaudiod': { friendly: 'Audio de la Mac', emoji: '🔊', category: 'Servicios', closable: 'never', desc: 'Procesa todo el audio del sistema.' },
    'hidd': { friendly: 'Teclado y ratón', emoji: '🖱️', category: 'Servicios', closable: 'never', desc: 'Gestiona dispositivos de entrada.' },
    'bluetoothd': { friendly: 'Bluetooth', emoji: '📡', category: 'Servicios', closable: 'never', desc: 'Conexiones Bluetooth de la Mac.' },
    'configd': { friendly: 'Configuración de red', emoji: '🌐', category: 'Servicios', closable: 'never', desc: 'Ajusta las conexiones de red automáticamente.' },
    'powerd': { friendly: 'Energía', emoji: '🔋', category: 'Sistema', closable: 'never', desc: 'Administra batería, carga y rendimiento.' },
    'coreservicesd': { friendly: 'Servicios del sistema', emoji: '🧩', category: 'Sistema', closable: 'never', desc: 'Coordina servicios centrales de macOS.' },
    'securityd': { friendly: 'Seguridad y llaves', emoji: '🔐', category: 'Seguridad', closable: 'never', desc: 'Gestiona llaves, cifrado y Face ID.' },
    'sandboxd': { friendly: 'Aislamiento de apps', emoji: '📦', category: 'Sistema', closable: 'never', desc: 'Mantiene las apps dentro de su espacio.' },
    'loginwindow': { friendly: 'Pantalla de acceso', emoji: '🚪', category: 'Sistema', closable: 'never', desc: 'Gestiona la pantalla de inicio de sesión.' },
    'mds_stores': { friendly: 'Indexador Spotlight', emoji: '🔍', category: 'Servicios', closable: 'caution', desc: 'Indexa archivos para la búsqueda Spotlight.' },
    'mdworker': { friendly: 'Indexador Spotlight', emoji: '🔍', category: 'Servicios', closable: 'caution', desc: 'Ayuda a indexar archivos por tipo.' },
    'mds': { friendly: 'Metadatos Spotlight', emoji: '🔍', category: 'Servicios', closable: 'caution', desc: 'Coordina la indexación del sistema.' },
    'backupd': { friendly: 'Time Machine', emoji: '💾', category: 'Servicios', closable: 'caution', desc: 'Copias de seguridad automáticas.' },
    'photolibraryd': { friendly: 'Fotos de Apple', emoji: '🖼️', category: 'Aplicación', closable: 'caution', desc: 'Gestiona la biblioteca de Fotos y su sincronización.' },
    'imagentd': { friendly: 'iMessage', emoji: '💬', category: 'Aplicación', closable: 'safe', desc: 'Servicio de mensajería de Apple.' },
    'systemuiserver': { friendly: 'Barra de menús', emoji: '📊', category: 'Sistema', closable: 'caution', desc: 'Iconos de la barra superior derecha.' },
    'controlcenter': { friendly: 'Centro de control', emoji: '🎛️', category: 'Sistema', closable: 'caution', desc: 'Paneles de Wi-Fi, sonido y brillo.' },

    /* ── Android ── */
    'com.android.systemui': { friendly: 'Interfaz del sistema', emoji: '📱', category: 'Sistema', closable: 'never', desc: 'Barra de estado, notificaciones y navegación.' },
    'com.google.android.gms': { friendly: 'Servicios de Google', emoji: '🤖', category: 'Servicios', closable: 'never', desc: 'Base de Google Play: ubicación, cuentas y notificaciones push.' },
    'zygote': { friendly: 'Arranque de apps', emoji: '🐣', category: 'Sistema', closable: 'never', desc: 'Plantilla que crea y lanza todas las aplicaciones.' },
    'surfaceflinger': { friendly: 'Motor gráfico', emoji: '🖼️', category: 'Sistema', closable: 'never', desc: 'Dibuja en pantalla todo lo que ves.' },
    'com.android.launcher3': { friendly: 'Pantalla de inicio', emoji: '🏠', category: 'Sistema', closable: 'never', desc: 'Tu escritorio con iconos y widgets.' },
    'com.android.phone': { friendly: 'Teléfono', emoji: '☎️', category: 'Sistema', closable: 'never', desc: 'Gestiona llamadas y datos móviles.' },
    'com.android.settings': { friendly: 'Ajustes', emoji: '⚙️', category: 'Sistema', closable: 'caution', desc: 'La app de configuración del teléfono.' },
    'com.google.android.tts': { friendly: 'Voz del teléfono', emoji: '🗣️', category: 'Servicios', closable: 'caution', desc: 'Convierte texto en voz.' },
    'com.android.providers.media': { friendly: 'Multimedia', emoji: '🎬', category: 'Sistema', closable: 'never', desc: 'Escanea y organiza fotos, videos y música.' },
    'com.android.vending': { friendly: 'Play Store', emoji: '🛒', category: 'Aplicación', closable: 'caution', desc: 'Tienda de aplicaciones de Android.' },

    /* ── iOS ── */
    'springboard': { friendly: 'Pantalla de inicio', emoji: '🏠', category: 'Sistema', closable: 'never', desc: 'Tu pantalla de inicio, iconos y carpetas.' },
    'backboardd': { friendly: 'Tareas en segundo plano', emoji: '⚙️', category: 'Sistema', closable: 'never', desc: 'Gestiona gestos, multitarea y eventos de pantalla.' },
    'mediaserverd': { friendly: 'Multimedia', emoji: '🎵', category: 'Servicios', closable: 'never', desc: 'Reproduce música, video y sonido del sistema.' },
    'locationd': { friendly: 'Ubicación', emoji: '📍', category: 'Servicios', closable: 'never', desc: 'Gestiona GPS y ubicación de las apps.' },
    'wifid': { friendly: 'Wi-Fi', emoji: '📶', category: 'Servicios', closable: 'never', desc: 'Conexión a redes Wi-Fi.' },
    'cloudphotod': { friendly: 'Fotos de iCloud', emoji: '☁️', category: 'Aplicación', closable: 'caution', desc: 'Sincroniza tu biblioteca de fotos con iCloud.' },
    'appstored': { friendly: 'App Store', emoji: '📦', category: 'Aplicación', closable: 'caution', desc: 'Descarga y actualiza aplicaciones.' }
  };

  /* Reglas por prefijo (procesos del núcleo con nombres variables) */
  const RULES = [
    { test: /^\d+-/, meta: { friendly: 'Hilo de interrupción', emoji: '⚙️', category: 'Sistema', closable: 'never', desc: 'Hilo del núcleo que atiende una señal de hardware (red, wifi…).' } },
    { test: /^kworker/, meta: { friendly: 'Tarea del núcleo', emoji: '⚙️', category: 'Sistema', closable: 'never', desc: 'Trabajo interno del kernel de Linux.' } },
    { test: /^rcu_/, meta: { friendly: 'Sincronización del núcleo', emoji: '⚙️', category: 'Sistema', closable: 'never', desc: 'Mantiene coherentes los datos del kernel.' } },
    { test: /^migration/, meta: { friendly: 'Planificador de CPU', emoji: '⚙️', category: 'Sistema', closable: 'never', desc: 'Reparte trabajo entre núcleos.' } },
    { test: /^watchdog/, meta: { friendly: 'Vigilante del sistema', emoji: '🐕', category: 'Sistema', closable: 'never', desc: 'Detecta cuelgues del sistema.' } },
    { test: /^systemd/, meta: { friendly: 'Servicio del sistema', emoji: '⚙️', category: 'Sistema', closable: 'never', desc: 'Servicio gestionado por systemd.' } },
    { test: /^gnome-/, meta: { friendly: 'Componente GNOME', emoji: '🐚', category: 'Sistema', closable: 'caution', desc: 'Pieza del escritorio GNOME.' } },
    { test: /^com\.apple\./, meta: { friendly: 'Servicio de Apple', emoji: '🍎', category: 'Servicios', closable: 'caution', desc: 'Servicio interno de Apple.' } },
    { test: /^com\.google\.android/, meta: { friendly: 'Servicio de Google', emoji: '🤖', category: 'Servicios', closable: 'caution', desc: 'Servicio de Google en tu dispositivo.' } },
    { test: /^com\.android/, meta: { friendly: 'Servicio de Android', emoji: '🤖', category: 'Sistema', closable: 'caution', desc: 'Servicio del sistema Android.' } }
  ];

  function prettify(name) {
    const clean = String(name || 'Proceso').replace(/\.exe$/i, '').replace(/[_-]+/g, ' ').trim();
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  }

  function lookup(name) {
    const key = String(name || '').toLowerCase().replace(/\.exe$/i, '').replace(/\.bin$/i, '').trim();
    if (META[key]) return META[key];
    for (const rule of RULES) if (rule.test.test(key)) return rule.meta;
    return null;
  }

  /* Añade metadatos amigables a un proceso (manteniendo lo que ya tenga) */
  function decorate(p) {
    const m = lookup(p.name) || {};
    return {
      ...p,
      friendly: p.friendly || m.friendly || prettify(p.name),
      emoji: p.emoji || m.emoji || '🧩',
      category: p.category || m.category || (m.closable === 'never' ? 'Sistema' : 'Aplicación'),
      desc: p.desc || m.desc || 'Proceso en ejecución de tu dispositivo.',
      closable: m.closable || 'caution',
      closeTip: m.closeTip || DEFAULT_TIP
    };
  }

  ns.processMeta = { decorate, lookup, prettify };

})(window.OptiCore);
