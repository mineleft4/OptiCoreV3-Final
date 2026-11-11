/* ════════════════════════════════════════════════════════════════
   OptiCore — recommendations.js (v2)
   Motor de recomendaciones inteligentes:
   · Fijas específicas por sistema operativo (Windows/Linux/macOS/
     Android/iOS) con identificadores estables.
   · Dinámicas según métricas actuales, batería, tiempo encendido.
   · Dinámicas según los PROCESOS más pesados reales, indicando cuáles
     se pueden cerrar con seguridad desde el administrador de tareas.
   · Basadas en TENDENCIAS del historial (RAM/CPU suben o bajan).
   · Estado "aplicada": se guardan por perfil y bonifican la salud.
   ════════════════════════════════════════════════════════════════ */
window.OptiCore = window.OptiCore || {};

(function (ns) {
  'use strict';

  const round = (v) => Math.round(v);

  /* Cómo abrir el gestor de procesos en cada sistema */
  const TASK_MANAGER = {
    windows: 'Administrador de tareas (Ctrl + Mayús + Esc)',
    linux: 'Monitor del sistema (o "top"/"htop" en la terminal)',
    mac: 'Monitor de actividad (Cmd + Espacio y escribe "Monitor de actividad")',
    android: 'Ajustes → Aplicaciones',
    ios: 'cierra la app desde el conmutador de apps (desliza hacia arriba)'
  };

  const fmtGB = (mb) => mb >= 1024 ? (mb / 1024).toFixed(1) + ' GB' : Math.round(mb) + ' MB';

  /* ───────── Dinámicas según métricas y entorno ───────── */
  const DYNAMIC = [
    {
      id: 'dyn-cpu', icon: '🌀', title: 'Cierra lo que no estés usando', impact: 'high',
      when: (s) => s.cpu >= 70,
      simple: 'Tu cerebro digital (CPU) está muy ocupado. ¡Cierra los juegos y apps que no estés usando y verás cómo respira! 😮‍💨',
      why: 'La CPU está al {cpu}%, un nivel alto. Cada aplicación abierta consume ciclos de procesador.',
      steps: (s) => [
        `Abre el ${TASK_MANAGER[s.os]} y ordena por CPU para detectar al culpable.`,
        'Cierra las aplicaciones o pestañas que estés dejando "por si acaso".',
        'Si una app no responde, ciérrala desde ahí mismo (Finalizar tarea).'
      ]
    },
    {
      id: 'dyn-ram', icon: '🧠', title: 'Libera memoria RAM', impact: 'high',
      when: (s) => s.ramPct >= 82,
      simple: '¡Tu memoria está casi llena! Es como una mochila muy cargada. Cierra apps para aligerarla 🎒➡️🪶',
      why: 'La RAM está al {ram}% ({ramUsedGB} GB de {ramTotalGB} GB). Al llenarse, el sistema se vuelve lento.',
      steps: (s) => [
        'Cierra las aplicaciones que lleven mucho tiempo abiertas sin usar.',
        'Reinicia el navegador: libera muchísima memoria de golpe.',
        'Si sigue al límite, reinicia el dispositivo para vaciar la RAM por completo.'
      ]
    },
    {
      id: 'dyn-procs', icon: '🧩', title: 'Hay demasiados procesos activos', impact: 'mid',
      when: (s) => !s.real && s.processCount >= 26,
      simple: 'Hay muchos programitas corriendo a la vez. Cuantos menos invitados haya en la fiesta, mejor baila tu equipo 🎉',
      why: 'Hay {procs} procesos activos. Cada uno consume algo de CPU y RAM aunque no lo veas.',
      steps: (s) => [
        'Revisa en la lista de procesos qué categorías dominan.',
        'Desactiva las apps que se ejecutan al inicio del sistema.',
        'Desinstala los programas que ya no uses.'
      ]
    },
    {
      id: 'dyn-reboot', icon: '🔄', title: 'Reinicia el dispositivo', impact: 'mid',
      when: (s) => s.uptimeMs >= 48 * 3600e3,
      simple: 'Tu dispositivo lleva mucho tiempo sin dormir. ¡Un buen reinicio lo deja como nuevo! 😴➡️😃',
      why: 'Lleva encendido {uptime} horas. Reiniciar libera memoria y corrige fallos acumulados.',
      steps: (s) => [
        'Guarda tu trabajo y cierra todo.',
        'Reinicia desde el menú de apagado (no quites la energía de golpe).',
        'Al encender, abre solo lo que realmente necesites.'
      ]
    },
    {
      id: 'dyn-browser', icon: '🧹', title: 'Tu navegador está comiendo recursos', impact: 'mid',
      when: (s) => {
        const top = s.processes[0];
        return !!top && /chrome|edge|firefox|safari|brave|opera/i.test(top.name) && top.cpu > 14;
      },
      simple: '¡Tu navegador es el campeón de comer memoria! Cierra las pestañas que ya no mires 🏆🍪',
      why: '"{topProcess}" encabeza el consumo con {topCpu}% de CPU. Las pestañas abiertas suman memoria aunque estén en reposo.',
      steps: (s) => [
        'Cierra las pestañas que ya no necesites (¡sobre todo las de video!).',
        'Desactiva extensiones que no uses: suelen consumir en silencio.',
        'Reinicia el navegador sin miedo: la opción "continuar donde lo dejé" guarda tus pestañas.'
      ]
    },
    {
      id: 'dyn-battery', icon: '🔋', title: 'Tu batería está bajándose', impact: 'mid',
      when: (s, env) => env.battery && !env.battery.charging && env.battery.level < 0.25,
      simple: '¡Tu batería está por debajo del 25%! Conéctala y activa el modo ahorro 🔌',
      why: 'El nivel de batería es del {battery}%. Con poca carga, el sistema reduce su velocidad para durar más.',
      steps: (s) => [
        'Conecta el cargador si tienes uno a mano.',
        'Activa el modo ahorro de energía de tu sistema.',
        'Reduce el brillo de la pantalla: es el mayor consumidor.'
      ]
    },
    {
      id: 'dyn-ramtrend', icon: '📈', title: 'Tu RAM viene subiendo', impact: 'mid',
      when: (s, env, hist) => {
        const tr = trend(hist, 'ram');
        return !!tr && tr.delta >= 10 && tr.spanMin >= 5;
      },
      simple: 'Tu memoria ha ido llenándose poco a poco. ¡Cierra apps y frenará! 🧯',
      why: 'En los últimos {spanMin} minutos la RAM subió {delta} puntos (de {first}% a {last}%). Algo está acumulando memoria.',
      steps: (s) => [
        'Identifica en Procesos qué app ha crecido más en RAM.',
        'Ciérrala y vuelve a abrirla: muchos programas tienen fugas que solo se limpian así.',
        'Si sigue subiendo con todo cerrado, reinicia el dispositivo.'
      ]
    },
    {
      id: 'dyn-cputrend', icon: '🌡️', title: 'El trabajo de tu CPU va en aumento', impact: 'mid',
      when: (s, env, hist) => {
        const tr = trend(hist, 'cpu');
        return !!tr && tr.delta >= 15 && tr.spanMin >= 5;
      },
      simple: 'Tu CPU cada vez trabaja más seguido. ¡Mira qué app la está haciendo sudar! 💦',
      why: 'En los últimos {spanMin} minutos la CPU subió {delta} puntos (de {first}% a {last}%).',
      steps: (s) => [
        `Abre el ${TASK_MANAGER[s.os]} y ordena por CPU.`,
        'Busca el proceso que encabeza la lista y ciérralo si no lo necesitas.',
        'Los antivirus e indexadores dan picos: son normales si pasan rápido.'
      ]
    },
    {
      id: 'dyn-healthdrop', icon: '🩺', title: 'La salud de tu dispositivo bajó', impact: 'mid',
      when: (s, env, hist) => healthDrop(hist) >= 12,
      simple: 'Hace un rato tu equipo estaba mejor que ahora. ¡Averigua qué cambió! 🔍',
      why: 'La puntuación de salud cayó {drop} puntos respecto a hace unos minutos. Puede ser una app nueva o un pico sostenido.',
      steps: (s) => [
        'Compara la lista de procesos actuales con los que recuerdas haber abierto.',
        'Cierra lo que hayas abierto justo antes de notar la lentitud.',
        'Aplica alguna recomendación de alto impacto de esta lista.'
      ]
    }
  ];

  /* Tendencia de un campo del historial (últimos 30 puntos) */
  function trend(hist, key) {
    const items = (hist || []).slice(-30);
    if (items.length < 4) return null;
    const first = items[0][key];
    const last = items[items.length - 1][key];
    const spanMin = Math.max(1, Math.round((items[items.length - 1].t - items[0].t) / 60000));
    return { delta: round(last - first), first: round(first), last: round(last), spanMin };
  }

  /* ─── Recomendaciones generadas a partir de los procesos reales ─── */
  function heavyProcessRecs(s, max) {
    const recs = [];
    const heavy = s.processes
      .filter((p) => p.closable !== 'never')
      .filter((p) => p.cpu >= 12 || p.mem >= 700)
      .slice(0, max);
    for (const p of heavy) {
      // El culpable puede ser la CPU, la RAM o ambos: el texto se adapta
      const esCpu = p.cpu >= 12;
      const esRam = p.mem >= 700;
      const carga = esCpu && esRam
        ? `${round(p.cpu)}% de CPU y ${fmtGB(p.mem)} de memoria`
        : esCpu
          ? `${round(p.cpu)}% de CPU`
          : `${fmtGB(p.mem)} de memoria cogidos`;
      recs.push({
        id: 'dyn-heavy-' + String(p.name).toLowerCase().replace(/[^a-z0-9]/g, ''),
        icon: p.emoji || '🧮',
        title: `Controla "${p.friendly}"`,
        impact: (p.cpu >= 30 || p.mem >= 1500) ? 'high' : 'mid',
        simple: esCpu
          ? `"${p.friendly}" está trabajando muchísimo (${carga}). ${p.closable === 'safe' ? '¡Puedes cerrarlo sin miedo!' : 'Ciérralo solo si no lo estás usando.'}`
          : `"${p.friendly}" tiene ${carga} y no está trabajando ahora. ${p.closable === 'safe' ? '¡Puedes cerrarlo sin miedo!' : 'Ciérralo solo si no lo estás usando.'}`,
        why: `"${p.name}" (PID ${p.pid}) usa ${p.cpu.toFixed(1)}% de CPU y ${fmtGB(p.mem)} de RAM. ${p.closeTip || ''}`,
        steps: [
          `Abre el ${TASK_MANAGER[s.os]}.`,
          `Busca "${p.name}"${p.pid ? ' (PID ' + p.pid + ')' : ''} en la lista.`,
          p.closable === 'safe'
            ? 'Sélecciona el proceso y finalízalo: es seguro cerrarlo.'
            : 'Ciérralo con cuidado o mejor cierra la aplicación desde su ventana.',
          'Si lo necesitas luego, vuelve a abrirlo normalmente.'
        ]
      });
    }
    return recs;
  }

  /* "Estos procesos puedes cerrar sin miedo" */
  function closableListRec(s) {
    const safe = s.processes
      .filter((p) => p.closable === 'safe' && (p.cpu >= 1.5 || p.mem >= 150))
      .slice(0, 5);
    if (safe.length < 2) return null;
    const names = safe.map((p) => `${p.emoji} ${p.friendly}`).join(' · ');
    return {
      id: 'dyn-closable',
      icon: '🟢',
      title: 'Estos procesos puedes cerrar sin miedo',
      impact: 'mid',
      simple: `No todos los programas que corren son del sistema: estos son tuyos y puedes cerrarlos: ${names} ✋`,
      why: `Procesos seguros de cerrar en tu equipo ahora mismo: ${names}. Los del sistema (⚠️ y 🚫 en la lista) déjalos tranquilo.`,
      steps: [
        `Abre el ${TASK_MANAGER[s.os]}.`,
        'Busca cualquiera de los procesos verdes (✅) de tu lista.',
        'Sélecciona el proceso y finalízalo.',
        'Los procesos marcados con 🚫 son del sistema: nunca los cierres.'
      ]
    };
  }

  /* ───────── Recomendaciones fijas por sistema operativo ─────────
     Cada una con un id estable para que el "✅ ya la hice" se
     recuerde en tu perfil aunque cambien las métricas.           */
  const BY_OS = {
    windows: [
      {
        id: 'win-startup', icon: '🚀', title: 'Controla los programas que arrancan solos', impact: 'high',
        simple: 'Hay programas que se despiertan solos al encender el equipo. ¡Diles a los que no usas que sigan durmiendo! 😴',
        why: 'Cada programa de inicio abre procesos que consumen CPU y RAM desde el primer minuto, aunque nunca los abras.',
        steps: [
          'Abre el Administrador de tareas con Ctrl + Mayús + Esc.',
          'Ve a la pestaña "Aplicaciones de inicio".',
          'Selecciona los programas que NO necesites al encender (Spotify, Discord, ayudantes de actualización…).',
          'Pulsa "Deshabilitar": no se borran, solo dejan de despertarse solos.'
        ]
      },
      {
        id: 'win-updates', icon: '⬆️', title: 'Deja que Windows Update termine tranquilo', impact: 'mid',
        simple: 'Windows a veces instala cosas nuevas mientras haces otra cosa. Déjalo terminar cuando no estés usando el equipo 📦',
        why: 'Las actualizaciones pendientes ocupan CPU y red en segundo plano; una vez instaladas, dejan de molestar.',
        steps: [
          'Abre Configuración → Windows Update.',
          'Pulsa "Buscar actualizaciones" y deja que instale.',
          'Reinicia cuando te lo pida (o posponlo hasta la noche).',
          'Configura las "horas activas" para que no se reinicie mientras estudias.'
        ]
      },
      {
        id: 'win-storage', icon: '🧹', title: 'Activa el Sensor de almacenamiento', impact: 'mid',
        simple: '¡Windows tiene un conserje automático! Se llama Sensor de almacenamiento y barre la basura él solo 🧹',
        why: 'Un disco casi lleno ralentiza todo: el sistema necesita espacio libre para trabajar a gusto.',
        steps: [
          'Abre Configuración → Sistema → Almacenamiento.',
          'Activa el "Sensor de almacenamiento".',
          'Configúralo para limpiar los archivos temporales cada semana.',
          'Pulsa "Ejecutar ahora" para una primera limpieza.'
        ]
      },
      {
        id: 'win-unused', icon: '📦', title: 'Desinstala lo que ya no usas', impact: 'mid',
        simple: 'Los programas que ya ni abres siguen ocupando sitio. ¡Fuera del disco! 🗑️',
        why: 'Desinstalar libera disco, procesos en segundo plano y actualizadores automáticos.',
        steps: [
          'Abre Configuración → Aplicaciones → Aplicaciones instaladas.',
          'Ordena la lista por tamaño para ver a los grandes primero.',
          'Pulsa los tres puntos "…" → Desinstalar en lo que ya no uses.',
          'Reinicia el equipo al terminar.'
        ]
      },
      {
        id: 'win-temp', icon: '🗂️', title: 'Limpia la carpeta de temporales', impact: 'low',
        simple: 'Los programas van dejando papeles sucios por el camino. ¡Toca recogerlos! 🧼',
        why: 'La carpeta %temp% acumula restos de instalaciones y cachés que pueden ocupar varios GB.',
        steps: [
          'Cierra las aplicaciones que tengas abiertas.',
          'Pulsa Windows + R, escribe %temp% y pulsa Enter.',
          'Selecciona todo (Ctrl + A) y borra.',
          'Lo que no se pueda borrar está en uso: sáltalo sin miedo.'
        ]
      },
      {
        id: 'win-power', icon: '🔌', title: 'Elige bien tu plan de energía', impact: 'low',
        simple: 'Windows puede gastar menos batería o correr más rápido, ¡tú decides! ⚡',
        why: 'En portátiles, el plan "Equilibrado" o "Ahorro" reduce la velocidad máxima cuando no hace falta.',
        steps: [
          'Abre Configuración → Sistema → Energía y batería.',
          'En "Modo de energía" elige "Equilibrado" (o "Ahorro" con poca batería).',
          'Conectado a la corriente puedes usar "Máximo rendimiento".',
          'Cierra las apps que frenan el ahorro solo si las necesitas.'
        ]
      },
      {
        id: 'win-visual', icon: '✨', title: 'Ajusta los efectos visuales', impact: 'low',
        simple: 'Las animaciones bonitas gastan energía. Con menos brillos, todo va más ligero 💨',
        why: 'Transparencias y animaciones consumen GPU y CPU; en equipos justos se nota.',
        steps: [
          'Busca "Rendimiento de Windows" en el menú Inicio.',
          'Abre "Ajustar la apariencia y el rendimiento de Windows".',
          'Marca "Ajustar para obtener el mejor rendimiento".',
          'Reactiva solo "Suavizar bordes de fuentes" para que el texto se vea bien.'
        ]
      },
      {
        id: 'win-autorestart', icon: '🔁', title: 'Evita que las apps se reabran solas', impact: 'low',
        simple: 'Si al encender se abren mil ventanas de golpe, ¡apaga ese truco! 🪄',
        why: 'Windows 11 puede relanzar automáticamente las apps de tu última sesión, alargando el arranque.',
        steps: [
          'Abre Cuentas → Opciones de inicio de sesión.',
          'Desactiva "Guardar aplicaciones reiniciables automáticamente".',
          'Reinicia para comprobar el arranque más limpio.'
        ]
      }
    ],

    linux: [
      {
        id: 'linux-updates', icon: '⬆️', title: 'Actualiza el sistema por completo', impact: 'high',
        simple: 'Las actualizaciones traen arreglos que hacen todo más rápido y seguro. ¡No las dejes esperando! 🐧',
        why: 'Los kernels y bibliotecas actualizados corrigen cuellos de rendimiento; los pendientes consumen recursos del gestor de paquetes.',
        steps: [
          'Ubuntu/Debian: sudo apt update && sudo apt upgrade.',
          'Fedora: sudo dnf upgrade.',
          'Arch: sudo pacman -Syu.',
          'Si pidió reiniciar (aparece un icono de energía), reinicia para estrenar el kernel nuevo.'
        ]
      },
      {
        id: 'linux-autoremove', icon: '🧺', title: 'Lava los paquetes huérfanos', impact: 'mid',
        simple: 'Al desinstalar cosas quedan "juguetes sueltos" que ya nadie usa. ¡A la cesta! 🧺',
        why: 'Las dependencias que quedaron instaladas ocupan disco y memoria caché sin servir de nada.',
        steps: [
          'Ubuntu/Debian: sudo apt autoremove --purge.',
          'Fedora: sudo dnf autoremove.',
          'Arch: sudo pacman -Rns $(pacman -Qdtq) (si hay huérfanos).',
          'Revisa la lista antes de confirmar: debe decir que solo quita paquetes "innecesarios".'
        ]
      },
      {
        id: 'linux-flatpak', icon: '📦', title: 'Pasa lista a los Flatpak/Snap olvidados', impact: 'mid',
        simple: 'Las tiendas de apps Linux guardan versiones viejas de cada programa. ¡Fuera duplicados! 📦',
        why: 'Cada runtime de Flatpak/Snap duplicado ocupa varios GB y añade procesos en segundo plano.',
        steps: [
          'Flatpak: flatpak uninstall --unused (borra runtimes sin aplicaciones).',
          'Snap: revisa snap list y elimina los que no uses: sudo snap remove NOMBRE.',
          'Flatpak también puede limpiar caché: flatpak uninstall --unused --delete-data con cuidado.'
        ]
      },
      {
        id: 'linux-journal', icon: '📜', title: 'Recorta los registros del sistema', impact: 'low',
        simple: 'Linux guarda un diario de todo lo que pasa. ¡Recorta los capítulos viejos! ✂️',
        why: 'journald puede acumular cientos de MB o GB de registros que solo sirven para diagnosticar el pasado.',
        steps: [
          'Comprueba el tamaño: journalctl --disk-usage.',
          'Recorta a 200 MB: sudo journalctl --vacuum-size=200M.',
          'Para que no vuelva a crecer: sudo journalctl --vacuum-time=7d.',
          'O edita /etc/systemd/journald.conf con SystemMaxUse=200M.'
        ]
      },
      {
        id: 'linux-swap', icon: '🔄', title: 'Vigila el uso de swap (memoria de intercambio)', impact: 'mid',
        simple: 'Cuando la RAM se llena, Linux usa el disco como "mochila extra", ¡y el disco es más lento! 🐌',
        why: 'Si el swap está muy usado (swappiness alto), el sistema paga un peaje de velocidad constante.',
        steps: [
          'Mira el swap con: free -h o swapon --show.',
          'Si suele estar lleno, baja la agresividad: sudo sysctl vm.swappiness=10.',
          'Hazlo permanente en /etc/sysctl.conf.',
          'Lo mejor de todo: cierra las apps que más RAM coman (míralas en la pestaña Procesos).'
        ]
      },
      {
        id: 'linux-services', icon: '🔧', title: 'Revisa los servicios de usuario activos', impact: 'low',
        simple: 'Hay "ayudantes" que corren aunque su app esté cerrada. Revisa quién sobra 🔍',
        why: 'systemd --user puede arrancar servicios (sincronización, índices, updaters) que consumen RAM siempre.',
        steps: [
          'Lista tus servicios: systemctl --user list-units --type=service --state=running.',
          'Desactiva el que no uses: systemctl --user disable --now NOMBRE.',
          'Los servicios del sistema revísalos con systemctl (con sudo) solo si sabes qué hacen.',
          'Nunca desactives systemd, la red o el audio.'
        ]
      },
      {
        id: 'linux-cache', icon: '🧹', title: 'Limpia las cachés de tu carpeta personal', impact: 'low',
        simple: 'Tus apps guardan recuerdos en ~/.cache. ¡Una limpieza de primavera no viene mal! 🌸',
        why: 'La caché acelera las apps, pero crece sin control y nunca se limpia sola del todo.',
        steps: [
          'Mira cuánto ocupa: du -sh ~/.cache.',
          'Puedes vaciarla con seguridad: rm -rf ~/.cache/* (las apps la regeneran).',
          'Cierra el navegador antes de borrar su caché.',
          'También puedes borrar ~/.thumbnails si ocupa mucho.'
        ]
      }
    ],

    mac: [
      {
        id: 'mac-login', icon: '🔑', title: 'Ordena tus elementos de inicio de sesión', impact: 'high',
        simple: 'Hay apps que se esconden para arrancarse solas al encender la Mac. ¡Las encontramos! 🕵️',
        why: 'Los elementos de inicio consumen RAM desde el arranque y muchos solo sirven para "estar más rápidos" al abrirlos.',
        steps: [
          'Abre Ajustes del Sistema → General → Elementos de inicio de sesión y extensiones.',
          'Permite en el dock: entra con un clic derecho en cada icono → Opciones → desmarca "Abrir al iniciar sesión".',
          'Desactiva los agentes de terceros que no uses.',
          'Deja los de Apple y los que de verdad necesites (p. ej. la nube).'
        ]
      },
      {
        id: 'mac-updates', icon: '⬆️', title: 'Actualiza macOS y tus aplicaciones', impact: 'mid',
        simple: 'Las actualizaciones son vitaminas para la Mac. ¡Tómalas! 💊',
        why: 'macOS usa memoria compartida y bibliotecas comunes: cada actualización optimiza ese reparto.',
        steps: [
          'Abre Ajustes del Sistema → General → Actualización de software.',
          'Instala las actualizaciones de macOS pendientes.',
          'En la App Store → Actualizaciones, revisa tus apps.',
          'Activa las actualizaciones automáticas de seguridad.'
        ]
      },
      {
        id: 'mac-storage', icon: '🧹', title: 'Usa las recomendaciones de almacenamiento', impact: 'mid',
        simple: 'La Mac te dice ella misma qué está ocupando sitio. ¡Escúchala! 👂',
        why: 'macOS incluye un limpiador inteligente que borra cachés, duplicados y archivos obsoletos con un clic.',
        steps: [
          'Abre Ajustes del Sistema → General → Almacenamiento.',
          'Espera el análisis de las barras de colores.',
          'Revisa cada categoría (Aplicaciones, Documentos, iOS…).',
          'Activa "Vaciar Papelera automáticamente" y vacía la papelera de iPhoto si la tienes.'
        ]
      },
      {
        id: 'mac-cache', icon: '🗂️', title: 'Limpia las cachés de usuario', impact: 'low',
        simple: 'Las apps guardan "chatarra" en Biblioteca/Caches. ¡A la basura! 🗑️',
        why: 'Las cachés de navegador y apps pueden ocupar GB y, cuando se corrompen, causan cuelgues.',
        steps: [
          'En el Finder pulsa Mayús + Cmd + G.',
          'Ve a ~/Biblioteca/Caches.',
          'Borra el contenido de las carpetas de apps problemáticas.',
          'Si dudas, borra solo las de apps que ya hayas cerrado.'
        ]
      },
      {
        id: 'mac-spotlight', icon: '🔍', title: 'Da tiempo a Spotlight (o paúsalo)', impact: 'low',
        simple: 'Spotlight memoriza tus archivos para encontrarlos volando… pero memorizar cansa. ¡Que descanse si hace falta! 😅',
        why: 'mds y mdworker dan picos de CPU cuando indexan; en discos llenos puede durar mucho.',
        steps: [
          'Si el ordenador está caliente tras encenderse, espera: indexará unos minutos.',
          'Para limitarlo: Ajustes → Siri y Spotlight → desmarca carpetas enormes.',
          'Como último recurso puedes excluir discos enteros en Privacidad de Spotlight.'
        ]
      },
      {
        id: 'mac-battery', icon: '🔋', title: 'Cuida la batería de tu Mac', impact: 'low',
        simple: 'Una batería sana hace que la Mac vaya fina durante años. ¡Mímalá! 💚',
        why: 'La salud de la batería limita la velocidad máxima del procesador cuando baja.',
        steps: [
          'Mantén pulsada la tecla Opción y pulsa el icono de batería → "Estado de la batería".',
          'En Ajustes → Batería activa la carga optimizada.',
          'Evita dejarla al 0% o al 100% durante semanas.',
          'Si la salud baja del 80%, considera cambiarla.'
        ]
      }
    ],

    android: [
      {
        id: 'android-unused', icon: '🗑️', title: 'Desinstala apps que ni abres', impact: 'high',
        simple: 'Cada app que no usas es un invitado que come y ocupa asiento. ¡Menos invitados, más espacio! 🪑',
        why: 'Las apps sin uso siguen actualizándose, mandando notificaciones y despertando al teléfono.',
        steps: [
          'Ve a Ajustes → Aplicaciones (o "Apps").',
          'Ordena por tamaño: Apps más grandes primero.',
          'En cada una que no uses: toca "Desinstalar".',
          'Si la quieres conservar pero sin datos: usa "Desinstalar" y luego reinstala solo cuando la necesites.'
        ]
      },
      {
        id: 'android-storage', icon: '🧹', title: 'Libera espacio con el administrador de almacenamiento', impact: 'mid',
        simple: 'El móvil guarda basura: fotos repetidas, vídeos de grupos… ¡Limpieza! 🧼',
        why: 'El almacenamiento lleno frena las apps y bloquea actualizaciones del sistema.',
        steps: [
          'Ajustes → Almacenamiento (o "Cuidado del dispositivo" en Samsung).',
          'Toca "Liberar espacio" o "Administrar almacenamiento".',
          'Borra los archivos temporales y la papelera de Galería.',
          'Revisa "Archivos grandes": ahí están los vídeos que más pesan.'
        ]
      },
      {
        id: 'android-cache', icon: '🍪', title: 'Borra la caché de las apps pesadas', impact: 'mid',
        simple: 'Las apps dejan "migas" (caché) por todos lados. Barre las migas y funcionan mejor 🍪➡️🚮',
        why: 'Una caché corrupta o gigante provoca cierres inesperados y lentitud en apps concretas.',
        steps: [
          'Ajustes → Aplicaciones → toca la app que va lenta.',
          'Entra en "Almacenamiento".',
          'Toca "Borrar caché" (NO borres datos salvo que quieras reiniciar la app).',
          'Repite con las apps de redes sociales y fotos.'
        ]
      },
      {
        id: 'android-background', icon: '👻', title: 'Restringe los datos en segundo plano', impact: 'mid',
        simple: 'Hay apps trabajando cuando tú duermes. ¡Horario de silencio! 🌙',
        why: 'Las apps con datos en segundo plano despiertan el procesador y la batería constantemente.',
        steps: [
          'Ajustes → Aplicaciones → la app que más batería gasta.',
          'Entra en "Datos móviles" → desactiva "Datos en segundo plano".',
          'O de forma global: Ajustes → Redes → Ahorro de datos.',
          'Deja activas solo mensajería y correo si los necesitas al instante.'
        ]
      },
      {
        id: 'android-battery', icon: '🔋', title: 'Activa el ahorro de batería adaptativo', impact: 'low',
        simple: 'El teléfono aprende a dormir cuando tú no lo miras. ¡Sueño inteligente! 😴',
        why: 'El ahorro adaptativo limita los procesos en reposo sin notarlo en el uso diario.',
        steps: [
          'Ajustes → Batería → Ahorro de batería.',
          'Activa el modo "Adaptativo" (Android 9+).',
          'Revisa "Uso desde la última carga": las apps arriba son las más comilonas.',
          'Baja el brillo automático y el tiempo de apagado de pantalla a 30 s.'
        ]
      },
      {
        id: 'android-restart', icon: '🔄', title: 'Reinicia el teléfono una vez por semana', impact: 'low',
        simple: 'Los teléfonos también necesitan estirar las piernas. ¡Un reinicio semanal! 🧘',
        why: 'Reiniciar limpia la RAM y mata procesos zombis que se van acumulando durante semanas.',
        steps: [
          'Mantén pulsado el botón de encendido.',
          'Elige "Reiniciar" (no "Apagar").',
          'Tras encender, espera un minuto antes de abrir apps.',
          'Si va muy lento: mantén pulsado encendido + volumen arriba para "Reinicio forzado".'
        ]
      },
      {
        id: 'android-updates', icon: '⬆️', title: 'Actualiza sistema y apps', impact: 'mid',
        simple: 'Las apps viejas fallan más. ¡Mantenlas al día! 📅',
        why: 'Las actualizaciones corrigen fugas de memoria y reducen el consumo de las apps.',
        steps: [
          'Abre Play Store → toca tu avatar → "Gestionar apps y dispositivo".',
          'En "Actualizaciones disponibles" toca "Actualizar todo" (mejor con Wi-Fi).',
          'Ajustes → Sistema → Actualización de software para el sistema.',
          'Activa "Actualización automática de apps" solo con Wi-Fi.'
        ]
      }
    ],

    ios: [
      {
        id: 'ios-offload', icon: '📦', title: 'Descarga las apps que no usas', impact: 'high',
        simple: 'iPhone guarda apps "en pausa" por si vuelves. ¡Puedes decirle que guarde solo la caja! 📦',
        why: '"Desinstalar la app" conserva tus datos y documentos mientras libera el espacio de la app en sí.',
        steps: [
          'Ajustes → General → Almacenamiento del iPhone.',
          'Espera la lista de apps (tarda unos segundos).',
          'Toca una app que no uses → "Desinstalar la app".',
          'Sus datos quedan a salvo: al reinstalarla, vuelve como la dejaste.'
        ]
      },
      {
        id: 'ios-storage', icon: '🧹', title: 'Sigue las recomendaciones de almacenamiento', impact: 'mid',
        simple: 'El iPhone te sugiere cómo ganar espacio él solito. ¡Sigue sus consejos! 🧠',
        why: 'iOS detecta caché de Siri, vídeos vistos y fotos duplicadas de forma automática.',
        steps: [
          'Ajustes → General → Almacenamiento del iPhone.',
          'Lee la sección "Recomendaciones" arriba.',
          'Activa "Vaciar fotos eliminadas" y "Revisar archivos grandes".',
          'En Fotos → Ajustes, activa "Optimizar almacenamiento" para guardar las fotos en alta solo en iCloud.'
        ]
      },
      {
        id: 'ios-background', icon: '👻', title: 'Limita el refresco en segundo plano', impact: 'mid',
        simple: 'Hay apps espiando el mundo aunque no las mires. ¡Menos fantasmas, más batería! 👻',
        why: 'El refresco en segundo plano despierta el procesador decenas de veces por hora.',
        steps: [
          'Ajustes → General → Actualización en segundo plano.',
          'Desactívalo por completo o selecciona solo las apps imprescindibles.',
          'La mensajería instantánea conviene dejarla activa.',
          'Observa durante un día si mejora la batería.'
        ]
      },
      {
        id: 'ios-updates', icon: '⬆️', title: 'Mantén iOS al día', impact: 'mid',
        simple: 'Cada versión de iOS arregla cositas y hace todo más fluido. ¡Actualiza! 💫',
        why: 'Las actualizaciones optimizan la gestión de memoria y corrigen fugas de las apps del sistema.',
        steps: [
          'Ajustes → General → Actualización de software.',
          'Si hay una disponible, instala con el iPhone enchufado y con Wi-Fi.',
          'Activa las actualizaciones automáticas.',
          'Tras una actualización grande, espera unas horas: el sistema reindexa y luego va más rápido.'
        ]
      },
      {
        id: 'ios-restart', icon: '🔄', title: 'Reinicia el iPhone de vez en cuando', impact: 'low',
        simple: 'Un reinicio semanal es como una siesta corta para tu iPhone 😴',
        why: 'Reiniciar limpia la memoria de apps cerradas a medias y procesos heredados.',
        steps: [
          'Mantén pulsado el botón lateral + volumen hasta que aparezca el deslizador.',
          'Desliza para apagar, espera 30 segundos y enciende.',
          'En modelos con botón de inicio: mantén solo el lateral.',
          'Si se queda colgado: pulsación rápida volumen arriba, abajo y mantén el lateral.'
        ]
      },
      {
        id: 'ios-safari', icon: '🌐', title: 'Configura el cierre de pestañas de Safari', impact: 'low',
        simple: '¿Mil pestañas acumuladas en Safari? ¡Deja que el iPhone las guarde por ti! 🗂️',
        why: 'Cada pestaña abierta mantiene contenido en memoria aunque no la mires desde hace días.',
        steps: [
          'Ajustes → Safari → Cerrar pestañas.',
          'Elige "Tras un día" o "Tras una semana".',
          'Para cerrarlas ya: en Safari mantén pulsado el icono de pestañas → "Cerrar todas las pestañas".'
        ]
      }
    ]
  };

  /* ───────── Caída de salud en los últimos puntos del historial ── */
  function healthDrop(hist) {
    const items = (hist || []).slice(-12);
    if (items.length < 6) return 0;
    const half = Math.floor(items.length / 2);
    const avg = (arr) => arr.reduce((a, b) => a + b.health, 0) / arr.length;
    return Math.round(avg(items.slice(0, half)) - avg(items.slice(half)));
  }

  /* ───────── Sustituye los {tokens} de los textos ───────── */
  function fillTokens(text, s, extra) {
    const top = (s.processes && s.processes[0]) || null;
    const ctx = {
      cpu: Math.round(s.cpu),
      ram: Math.round(s.ramPct),
      ramUsedGB: (s.ramUsedMB / 1024).toFixed(1),
      ramTotalGB: (s.ramTotalMB / 1024).toFixed(1),
      procs: s.processCount,
      uptime: (s.uptimeMs / 3600e3).toFixed(1),
      topProcess: top ? top.friendly : 'el proceso más activo',
      topCpu: top ? top.cpu.toFixed(1) : '0',
      battery: '—', spanMin: '—', delta: '—', first: '—', last: '—', drop: '—'
    };
    Object.assign(ctx, extra || {});
    return String(text).replace(/\{(\w+)\}/g, (m, k) => (k in ctx ? String(ctx[k]) : m));
  }

  /* Tokens extra que dependen del historial o del entorno */
  function extraTokens(r, s, env, hist) {
    if (r.id === 'dyn-ramtrend') return trend(hist, 'ram') || {};
    if (r.id === 'dyn-cputrend') return trend(hist, 'cpu') || {};
    if (r.id === 'dyn-healthdrop') return { drop: healthDrop(hist) };
    if (r.id === 'dyn-battery' && env.battery) return { battery: Math.round(env.battery.level * 100) };
    return {};
  }

  /* Convierte una receta en recomendación final con textos resueltos */
  function materialize(r, s, env, hist) {
    const extra = extraTokens(r, s, env, hist);
    const steps = (typeof r.steps === 'function' ? r.steps(s, env) : r.steps) || [];
    return {
      id: r.id,
      icon: r.icon,
      title: fillTokens(r.title, s, extra),
      impact: r.impact,
      simple: r.simple ? fillTokens(r.simple, s, extra) : null,
      whyText: r.why ? fillTokens(r.why, s, extra) : null,
      steps: steps.map((st) => fillTokens(st, s, extra)),
      appliedAt: null
    };
  }

  function safeWhen(r, s, env, hist) {
    try { return !!r.when(s, env, hist); } catch (e) { return false; }
  }

  /* ───────────────────────── API pública ─────────────────────────
     build(snapshot, mode, appliedMap, historyItems, env)
       · mode         → 'colegio' | 'universidad' (reservado)
       · appliedMap   → { idRec: fechaEnMs } del perfil
       · historyItems → historial, para detectar tendencias
       · env          → { battery?: {level, charging} }
     Devuelve { active, done } con los textos ya resueltos.        */
  const IMPACT_RANK = { high: 0, mid: 1, low: 2 };

  function build(s, mode, appliedMap, historyItems, env) {
    const applied = appliedMap || {};
    const hist = historyItems || [];
    env = env || {};
    const usedIds = new Set();

    const candidates = [];
    // 1) Dinámicas: activas ahora, o ya aplicadas (para seguir viéndolas)
    for (const r of DYNAMIC) {
      if (applied[r.id] || safeWhen(r, s, env, hist)) candidates.push(r);
    }
    // 2) Generadas a partir de los procesos más pesados
    for (const r of heavyProcessRecs(s, 3)) candidates.push(r);
    const cl = closableListRec(s);
    if (cl) candidates.push(cl);
    // 3) Fijas del sistema operativo detectado
    for (const r of (BY_OS[s.os] || [])) candidates.push(r);

    const active = [];
    const done = [];
    for (const r of candidates) {
      if (usedIds.has(r.id)) continue;
      usedIds.add(r.id);
      const item = materialize(r, s, env, hist);
      const ts = applied[r.id];
      if (ts) { item.appliedAt = ts; done.push(item); }
      else active.push(item);
    }

    active.sort((a, b) =>
      (IMPACT_RANK[a.impact] != null ? IMPACT_RANK[a.impact] : 1) -
      (IMPACT_RANK[b.impact] != null ? IMPACT_RANK[b.impact] : 1));

    return { active: active.slice(0, 12), done };
  }

  ns.recommendations = { build, TASK_MANAGER };

})(window.OptiCore);
