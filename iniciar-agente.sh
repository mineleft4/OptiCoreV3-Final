#!/usr/bin/env bash
# Arranca el agente local de OptiCore (Linux/macOS).
# Uso: ./iniciar-agente.sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "⚠  No se encontró Node.js. Instálalo desde https://nodejs.org y vuelve a intentarlo."
  exit 1
fi
exec node server.js
