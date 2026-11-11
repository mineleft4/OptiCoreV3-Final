# 🌐 Cómo publicar OptiCore (Netlify Drop + MySQL + agente descargable)

OptiCore tiene **tres piezas**:

| Pieza | Qué hace | Dónde vive |
|-------|----------|------------|
| 🌐 **Web** (`index.html`, `css/`, `js/`) | La interfaz | **Netlify Drop** |
| ☁️ **API + MySQL** (`backend/`) | Cuentas, perfil, historial | Render / Railway + MySQL gestionado |
| 💻 **Agente** (`server.js` → ejecutable) | CPU, RAM y procesos reales | **El PC de cada visitante** (descarga un `.exe`) |

```
Navegador ──► Netlify (web estática)
    │
    ├──► API en la nube ──► MySQL     (cuenta, perfil, historial: desde cualquier dispositivo)
    └──► Agente en 127.0.0.1:8137     (datos reales de ESE equipo, nunca salen de él)
```

> Netlify Drop solo sirve archivos estáticos: **no puede ejecutar el backend ni conectarse a MySQL**. Por eso la API vive aparte y la web la llama por HTTPS. El navegador nunca se conecta directo a MySQL (expondría la contraseña).

El orden importa, porque cada paso necesita la URL del anterior:

**1 → Base de datos MySQL · 2 → API · 3 → Web en Netlify · 4 → Compilar el agente · 5 → Web final**

---

## 1. Base de datos MySQL

Crea una base MySQL gestionada con plan gratuito (por ejemplo **Aiven for MySQL**, **TiDB Cloud** o **Railway**). Anota la URL de conexión:

```
mysql://USUARIO:CONTRASENA@HOST:PUERTO/opticore
```

No hace falta crear tablas: la API las crea sola al arrancar (`backend/schema.sql` es solo de referencia).

## 2. API en la nube

1. Sube la carpeta `backend/` a un repositorio de GitHub (o todo el proyecto).
2. En **Render** (o Railway): *New → Web Service* → elige el repo.
   - **Root directory:** `backend`
   - **Build command:** `npm install`
   - **Start command:** `npm start`
3. Variables de entorno (ver `backend/.env.example`):

   | Variable | Valor |
   |----------|-------|
   | `MYSQL_URL` | la URL del paso 1 |
   | `DB_SSL` | `true` si el proveedor exige TLS (Aiven, TiDB) |
   | `ALLOWED_ORIGINS` | la URL de tu web en Netlify (la pones en el paso 3) |

4. Cuando termine, comprueba `https://TU-API.onrender.com/api/health` → debe responder `{"ok":true,"db":true,...}`.

> En el plan gratuito de Render la API se "duerme" tras un rato sin uso y la primera petición tarda ~30-60 s. La web ya lo tiene en cuenta (espera hasta 9 s al arrancar y reintenta al pulsar «🔑 Entrar»).

## 3. Web en Netlify Drop

```bash
chmod +x preparar-publicacion.sh
./preparar-publicacion.sh --api https://TU-API.onrender.com
```

Arrastra la carpeta **`publicar/web`** a **https://app.netlify.com/drop**. Netlify te da una URL tipo `https://sparkly-pika-123456.netlify.app`.

**Cámbiale el nombre ahora** (*Site configuration → General → Change site name*), por ejemplo `opticore-demo`, y **no lo cambies después**: la URL queda grabada en el agente y en la API.

Vuelve a Render y pon `ALLOWED_ORIGINS=https://opticore-demo.netlify.app` (sin barra final).

## 4. Compilar el agente (un archivo por sistema operativo)

El agente se compila automáticamente en GitHub con `.github/workflows/build-agent.yml`:

1. Sube **todo el proyecto** a un repositorio de GitHub (público, para que cualquiera pueda descargar).
2. *Actions → «Compilar agente» → Run workflow* → escribe la URL de tu web (`https://opticore-demo.netlify.app`).
3. Al terminar (≈2 min) aparecen en *Releases* estos archivos:

   | Sistema | Archivo |
   |---------|---------|
   | Windows | `opticore-agent-windows-x64.exe` |
   | Linux | `opticore-agent-linux-x64` |
   | macOS (Apple Silicon) | `opticore-agent-macos-arm64` |
   | macOS (Intel) | `opticore-agent-macos-x64` |

Cada ejecutable **ya incluye** el origen de tu web: el visitante no configura nada y solo esa web puede leerlo.

## 5. Web final con botones de descarga

```bash
./preparar-publicacion.sh \
  --api       https://TU-API.onrender.com \
  --descargas https://github.com/USUARIO/REPO/releases/latest/download
```

Vuelve a arrastrar `publicar/web` al **mismo sitio** de Netlify (*Deploys* → arrastrar). El aviso «Estás viendo datos estimados» mostrará el botón **⬇️ Descargar** del sistema del visitante, con sus instrucciones.

---

## Lo que ve el visitante

1. Abre tu web → crea cuenta o entra como invitado.
2. Descarga el archivo de su sistema:
   - **Windows:** doble clic en el `.exe`.
   - **Linux:** `chmod +x opticore-agent-linux-x64 && ./opticore-agent-linux-x64`
   - **macOS:** `chmod +x opticore-agent-macos-arm64 && xattr -d com.apple.quarantine opticore-agent-macos-arm64 && ./opticore-agent-macos-arm64`
3. Deja la ventana abierta, vuelve a la web y pulsa **🔄 Reintentar**.
4. En **Android/iOS** no hay agente: siguen los datos estimados, pero **la cuenta y el historial funcionan igual** desde el móvil.

### Avisos de seguridad del sistema (son normales)

Los ejecutables **no están firmados** (firmar cuesta dinero: certificado de Windows / cuenta de desarrollador de Apple):

- **Windows SmartScreen:** *Más información → Ejecutar de todas formas*.
- **macOS Gatekeeper:** el comando `xattr -d com.apple.quarantine …` de arriba, o clic derecho → Abrir.
- Algunos antivirus desconfían de ejecutables sin firmar que abren un puerto; el agente solo escucha en `127.0.0.1`.

## Probar que todo está bien

```bash
# API y base de datos
curl https://TU-API.onrender.com/api/health

# Agente (con el ejecutable abierto): 200 = tu web está autorizada
curl -s -o /dev/null -w "%{http_code}\n" -H "Origin: https://opticore-demo.netlify.app" http://127.0.0.1:8137/api/status
```

## Problemas frecuentes

| Problema | Causa y solución |
|----------|------------------|
| «El servidor de cuentas no responde» | La API gratuita estaba dormida. Espera ~1 min y pulsa 🔑 Entrar otra vez. |
| La API responde 403 «Origen no autorizado» | `ALLOWED_ORIGINS` no coincide exactamente con la URL de Netlify (https, sin barra final). |
| El agente responde 403 | El ejecutable se compiló con otra URL. Cambiaste el nombre del sitio: vuelve a ejecutar el workflow con la URL correcta. |
| Firefox/Safari no ven el agente | Bloquean `http://127.0.0.1` desde páginas HTTPS. Usa **Chrome/Edge** para datos reales. |
| `/api/health` da `db:false` | Revisa `MYSQL_URL` y `DB_SSL=true` si el proveedor exige TLS. |

## Seguridad

- Las contraseñas se guardan con **scrypt + sal**; las sesiones, solo como **hash** del token.
- Cada usuario ve **solo su** perfil e historial (no existe ninguna lista pública de usuarios).
- **Usa HTTPS siempre** (Netlify y Render lo dan por defecto): las contraseñas viajan en la petición de login.
- El agente escucha **solo en `127.0.0.1`** y solo responde a los orígenes autorizados (nunca `*`).
- Los datos del sistema (procesos, CPU) **no pasan por la nube**: van del navegador al agente del propio visitante. A MySQL solo llegan las instantáneas que el usuario guarda (CPU %, RAM %, nº de procesos, salud).
- Recomendado: subir la contraseña mínima de 4 a 8 caracteres en `backend/server.js` (`validPassword`) y en `index.html`.
