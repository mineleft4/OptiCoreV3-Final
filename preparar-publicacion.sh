#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
# OptiCore — preparar-publicacion.sh
# Genera la carpeta publicar/web que se arrastra a Netlify Drop.
#
# Uso:
#   ./preparar-publicacion.sh \
#       --api      https://opticore-api.onrender.com \
#       --descargas https://github.com/USUARIO/REPO/releases/latest/download
#
#   --api         URL de la API en la nube (backend/ + MySQL): cuentas,
#                 perfil e historial.            (opcional)
#   --descargas   Carpeta con los ejecutables del agente (GitHub Releases)
#                 para el botón «Descargar» según el sistema.   (opcional)
#
# Sin argumentos genera la web "en blanco" (útil para conseguir primero
# la URL de Netlify y compilar después el agente con esa URL).
# ════════════════════════════════════════════════════════════════
set -euo pipefail
cd "$(dirname "$0")"

API=""
DESCARGAS=""
while (( $# > 0 )); do
  case "$1" in
    --api)        API="${2:-}"; shift 2 ;;
    --descargas)  DESCARGAS="${2:-}"; shift 2 ;;
    -h|--help)    sed -n '2,19p' "$0"; exit 0 ;;
    *) echo "⚠  Opción desconocida: $1 (usa --help)"; exit 1 ;;
  esac
done

if ! command -v node >/dev/null 2>&1; then
  echo "⚠  Falta Node.js (solo se usa para validar las URLs). Instálalo desde https://nodejs.org"
  exit 1
fi

# Valida una URL http(s) y la devuelve sin barra final ni ruta extra
clean_url() {
  node -e '
    try {
      const u = new URL(process.argv[1]);
      if (!/^https?:$/.test(u.protocol)) process.exit(2);
      process.stdout.write((u.origin + u.pathname).replace(/\/+$/, ""));
    } catch { process.exit(2); }
  ' "$1" 2>/dev/null || { echo "⚠  URL no válida: $1" >&2; exit 1; }
}

[[ -n "$API" ]]       && API="$(clean_url "$API")"
[[ -n "$DESCARGAS" ]] && DESCARGAS="$(clean_url "$DESCARGAS")"

OUT="publicar"
WEB="$OUT/web"
rm -rf "$OUT"
mkdir -p "$WEB/css" "$WEB/js"

cp index.html "$WEB/"
cp -r css/. "$WEB/css/"
cp -r js/. "$WEB/js/"

# Rellena las direcciones en el index.html publicado
if [[ -n "$API" ]]; then
  sed -i "s|<meta name=\"opticore-cloud\" content=\"\" />|<meta name=\"opticore-cloud\" content=\"$API\" />|" "$WEB/index.html"
fi
if [[ -n "$DESCARGAS" ]]; then
  sed -i "s|<meta name=\"opticore-agent-release\" content=\"\" />|<meta name=\"opticore-agent-release\" content=\"$DESCARGAS\" />|" "$WEB/index.html"
fi

echo ""
echo "✅ Web preparada en: $WEB"
echo "   API en la nube:   ${API:-(sin configurar: las cuentas usarán el agente local)}"
echo "   Descarga agente:  ${DESCARGAS:-(sin configurar: el aviso no mostrará botón de descarga)}"
echo ""
echo "Siguiente paso: arrastra la carpeta publicar/web a https://app.netlify.com/drop"
echo "(Nada de server.js ni backend/ se sube a Netlify.)"
echo ""
