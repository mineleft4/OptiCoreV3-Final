# ⚡ OptiCore

**OptiCore** ayuda a optimizar el dispositivo con recomendaciones adaptadas a su sistema operativo (**Windows, Linux, macOS, Android o iOS**).

La versión 2 separa la aplicación en **dos piezas**:

```
🌐 Web publicada (HTML/CSS/JS)  ──HTTP──▶  💻 Agente local (Node.js en tu PC)
   se puede subir a Internet                 lee CPU, RAM y procesos REALES
```

- La **web** puede estar en cualquier hosting estático (GitHub Pages, Netlify, Vercel, un VPS…).
- El **agente** es un pequeño servidor Node.js que el visitante ejecuta **en su propio ordenador**. La web lo busca en `http://127.0.0.1:8137` y, si responde, muestra los datos reales.
- Si el agente no está activo, la web sigue funcionando con **datos estimados** y recomendaciones coherentes.
- En **móvil (Android/iOS)** no existe agente local: se mantienen las **recomendaciones**, el historial y el resumen, pero el medidor pasa a llamarse **SoC** y la sección **Procesos** se oculta (un navegador no puede leer los procesos del teléfono).

> 📤 **¿Quieres publicarla en Internet?** Sigue la guía paso a paso de **[PUBLICAR.md](PUBLICAR.md)** (MySQL + API + Netlify Drop + agente como ejecutable `.exe` / binario).

## 🚀 Uso rápido

### Opción A — Todo local (la más sencilla)

```bash
cd OptiCore
node server.js
# abre http://127.0.0.1:8137
```

El agente sirve la página y los datos son **reales** en ese equipo. También puedes usar `npm start` o `./iniciar-agente.sh` (Linux/macOS) / `iniciar-agente.bat` (Windows).

### Opción B — Web publicada + agente local (recomendada para Internet)

1. **Sube la web** a tu hosting estático: `index.html`, `css/` y `js/`. (`server.js` no se sube.)
2. En `index.html`, ajusta si hace falta:
   - `<meta name="opticore-agent" content="http://127.0.0.1:8137">` → dirección del agente (normalmente se deja así).
   - `<meta name="opticore-agent-download" content="">` → URL del ZIP del agente que verá el visitante en el aviso.
3. **Prepara el ZIP del agente** con: `server.js`, `package.json`, `index.html`, `css/`, `js/`, `iniciar-agente.sh`, `iniciar-agente.bat`, `agent.config.example.json` y tu `agent.config.json`.
4. **Autoriza tu dominio** en el agente. Copia `agent.config.example.json` a `agent.config.json`:

   ```json
   {
     "allowedOrigins": ["https://tu-dominio.com"]
   }
   ```

   También vale la variable de entorno:

   ```bash
   OPTICORE_ALLOWED_ORIGINS="https://tu-dominio.com" node server.js
   ```

   Los orígenes `localhost`, `127.0.0.1` y `file://` (abrir el HTML con doble clic) se permiten siempre para desarrollo.

5. El visitante descarga el ZIP, instala [Node.js](https://nodejs.org), ejecuta `node server.js` (o el lanzador) y vuelve a la web. Al pulsar **🔄 Reintentar** en el aviso, el punto de la cabecera se pone verde y aparecen sus datos reales.

> El agente escucha **solo en `127.0.0.1`** por defecto: no es accesible desde Internet ni desde otros equipos de la red. Usa `HOST=0.0.0.0` únicamente si sabes lo que haces.

### Opción C — Abrir `index.html` con doble clic

La página funciona sin servidor con **datos estimados**. Si además el agente está ejecutándose, también puede conectarse a él (`file://` está permitido en el CORS del agente).

## 🧠 Cómo detecta la web el agente

1. Prueba el **mismo origen** (`/api/status`): útil cuando el agente sirve la página.
2. En paralelo, prueba la dirección de `<meta name="opticore-agent">` (por defecto `http://127.0.0.1:8137`).
3. Si alguna responde, activa el **modo real**; si no, el **modo estimado**.
4. Mientras la app está abierta, reintenta la conexión cada minuto y permite reintentar a mano desde el aviso.

### Notas sobre navegadores

- **Chrome/Edge**: al pasar de una web HTTPS a `127.0.0.1`, el navegador puede pedir permiso de **acceso a la red local**. Acepta el aviso.
- **Firefox/Safari**: pueden bloquear peticiones HTTP a `localhost` desde una página HTTPS (*mixed content*). Si ocurre, la web muestra el aviso de datos estimados. Chrome/Edge es la opción más fiable.
- El agente responde al *preflight* CORS y a la cabecera **Private Network Access** (`Access-Control-Allow-Private-Network`).
- La web **nunca** lee procesos por sí sola: solo el agente local puede hacerlo.

## 🏫 Modos de interfaz

| Modo | Interfaz | Procesos |
|------|----------|----------|
| **Colegio** 🏫 | Colores brillantes, iconos llamativos y lenguaje sencillo | **Minimizado**: solo los que trabajan de verdad, como tarjetas con emoji y semáforo 🟢🟡🔴 |
| **Universidad** 🎓 | Diseño moderno con glassmorphism y gradientes | **Completo**: tabla con PID, nombre, categoría, CPU %, RAM, descripción y **"¿Puedo cerrarlo?"** (✅⚠️🚫), con buscador y orden |

Cambia de modo con **🔄 Cambiar modo**. En **móvil**, la pestaña **Procesos** no aparece y el medidor principal se llama **SoC**.

## 🌗 Tema claro/oscuro

OptiCore sigue automáticamente el esquema del navegador (`prefers-color-scheme`) y permite forzarlo con el botón **🖥️** (*automático → ☀️ claro → 🌙 oscuro*). La elección se recuerda en `localStorage`. Las gráficas canvas se redibujan al cambiar de esquema.

## 📱 Diseño adaptable

- **Escritorio** (>1024 px): diseño completo con pestañas arriba.
- **Tablet** (721–1024 px): cabecera compacta, Resumen en 2 columnas.
- **Móvil** (≤720 px): barra de navegación inferior fija, cabecera en 2 filas, tarjetas apiladas y tabla sin columnas secundarias.
- **Móvil pequeño** (≤400 px): medidores reducidos y Resumen en 1 columna.
- Respeta el *safe area* de iPhone.

En móvil se oculta **Procesos** y se muestra **SoC**; las secciones visibles son **Resumen**, **Recomendaciones** e **Historial**.

## 👤 Cuentas de usuario

- Las cuentas, el **perfil** y el **historial** se guardan en **MySQL** a través de la API de `backend/`: inicia sesión desde **cualquier dispositivo** (incluido el móvil) y ves lo mismo.
- La web guarda un **token Bearer** en `localStorage` (las cookies entre dominios no son fiables). En MySQL solo se guarda el **hash** del token.
- Las contraseñas se guardan con **scrypt + sal**, nunca en claro.
- Como **invitado** todo funciona, pero el historial y las recomendaciones aplicadas quedan en `localStorage`.
- Al iniciar sesión, lo hecho como invitado se **une** a tu perfil.
- La pestaña **Historial** muestra tu **perfil** (miembro desde, recomendaciones aplicadas, instantáneas).
- Si no configuras la API en la nube (`<meta name="opticore-cloud">` vacío), las cuentas siguen funcionando como antes en el agente local (`data/*.json`), solo para uso en ese equipo.

> El **ejecutable descargable** del agente solo mide el equipo (`/api/status`, `/api/snapshot`); no guarda cuentas.

## 📊 Secciones

1. **Resumen** — medidores de **CPU** (o **SoC** en móvil), **RAM**, datos del sistema, gráfica en vivo y salud del dispositivo.
2. **Procesos** (solo escritorio) — semáforo ✅⚠️🚫 con el motivo de cada proceso. En móvil no se muestra.
3. **Recomendaciones** — consejos por impacto (🔥 alto / ⚡ medio / 🌱 mantenimiento), pasos numerados y botón **"✅ ¡Ya la hice!"**. Las aplicadas pasan a **🏆 Recomendaciones que ya aplicaste**.
4. **Historial** — instantáneas automáticas cada minuto y manuales con 📸, con evolución de CPU/SoC, RAM y salud.

## 🧠 Motor de recomendaciones

Combina:

- **Fijas por sistema operativo** (Linux, Windows, macOS, Android, iOS…).
- **Dinámicas según métricas**: CPU/SoC alto, RAM llena, batería baja, tiempo encendido…
- **Tendencias del historial**: "tu RAM subió X puntos en los últimos N minutos".
- **Procesos más pesados reales** (solo con agente): identifica culpable, PID y si se puede cerrar.
- En **móvil** los textos de CPU se adaptan a **SoC** y se mantienen los consejos específicos de Android/iOS.

## 🔐 Privacidad y seguridad

- El agente lee **solo el equipo donde se ejecuta** y escucha en **loopback** (`127.0.0.1`).
- La web publicada **no recibe** los datos del sistema: el navegador los pide directamente al agente del visitante.
- CORS con **lista blanca** de orígenes (nunca `*`), tokens Bearer y límite de intentos de login.
- No subas `server.js` a un hosting público: es un agente para el PC del visitante, no un backend multiusuario.
- No expongas el agente a Internet ni uses `HOST=0.0.0.0` sin protección.

## ⚠️ Nota sobre los datos

- **Con agente**: CPU, RAM, procesos, tiempo encendido, núcleos y hostname son **reales**. Temperatura y frecuencia se estiman.
- **Sin agente o en móvil**: se simulan datos realistas según el SO (`svchost.exe` en Windows, `gnome-shell` en Linux, apps de Android/iOS…).
- En móvil el navegador **no puede** acceder a los procesos reales: por eso se oculta la sección y se usa **SoC**.
- OptiCore **nunca cierra procesos**: solo te guía para hacerlo con seguridad.

## 📁 Estructura

```
OptiCore/
├── index.html                 # Splash + cuenta + 4 secciones (metas: agente, nube, descargas)
├── server.js                  # Agente local (se compila a .exe / binario con Bun)
├── backend/                   # API en la nube: Node + MySQL (cuentas, perfil, historial)
│   ├── server.js
│   ├── package.json
│   ├── schema.sql             # solo de referencia: las tablas se crean solas
│   └── .env.example
├── .github/workflows/
│   └── build-agent.yml        # Compila el agente para Windows, Linux y macOS
├── preparar-publicacion.sh    # Genera publicar/web para Netlify Drop
├── PUBLICAR.md                # Guía completa: MySQL → API → Netlify → agente
├── agent.config.example.json  # Orígenes autorizados (modo "node server.js")
├── iniciar-agente.sh/.bat     # Lanzadores (modo "node server.js")
├── css/styles.css
└── js/
    ├── process-meta.js        # Catálogo de ~100 procesos
    ├── data.js                # Detección de SO + simulador + datos reales
    ├── recommendations.js     # Motor de recomendaciones
    ├── api.js                 # Dos destinos: agente local (datos) y nube (cuentas)
    ├── account.js             # Cuenta + adaptadores de almacenamiento
    ├── scheme.js              # Tema claro/oscuro
    └── main.js                # Interfaz, gráficas, historial y modo móvil/SoC
```

Tecnología: **HTML + CSS + JavaScript puro + Node.js** (solo módulos nativos), sin frameworks ni dependencias.
