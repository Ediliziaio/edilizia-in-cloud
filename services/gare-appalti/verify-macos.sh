#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."
if [[ "$(uname -s)" != Darwin ]]; then
  printf 'Questo collaudo nativo è per macOS. Su Linux usa verify-container.sh.\n' >&2
  exit 1
fi

if command -v brew >/dev/null; then
  brew_root="$(brew --prefix)"
  export PATH="$brew_root/opt/node@24/bin:$brew_root/opt/python@3.12/bin:$brew_root/opt/nss/bin:$brew_root/opt/openssl@3/bin:$PATH"
fi
export PATH="$PATH:/Applications/LibreOffice.app/Contents/MacOS"

for program in git node npm pdftoppm pdftotext pdfinfo soffice; do
  if ! command -v "$program" >/dev/null; then
    printf 'Comando mancante: %s. Controlla i prerequisiti macOS nel README di Gare.\n' "$program" >&2
    exit 1
  fi
done
if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)'; then
  printf 'Per i test occorre Node 24 o successivo.\n' >&2
  exit 1
fi
if ! xcode-select --print-path >/dev/null 2>&1; then
  printf 'Installa gli strumenti da riga di comando di Apple con xcode-select --install.\n' >&2
  exit 1
fi

qa_dir="$(mktemp -d "${TMPDIR:-/tmp}/eic-gare-macos.XXXXXX")"
trap 'rm -rf "$qa_dir"' EXIT

# Reproduce the worker dependency tree from the committed files only.
git archive HEAD \
  server/gare-ai server/gare-intake server/gare-journey server/gare-office \
  server/gare-preparation server/gare-review server/gare-sources server/gare-templates \
  services/gare-appalti src/modules/gare-appalti/source-current.js \
  src/modules/gare-appalti/reader/text-model.js src/modules/gare-appalti/dossier \
  supabase/functions/gare-pilot-ai/handler.ts | tar -xf - -C "$qa_dir"
cd "$qa_dir"

cp services/gare-appalti/package.json services/gare-appalti/package-lock.json .
# The worker renders PDFs through Node and does not need jsPDF browser extras.
npm ci --omit=dev --omit=optional --ignore-scripts --no-audit --no-fund

if [[ -z "${GARE_PYTHON:-}" ]]; then
  if ! command -v python3.12 >/dev/null; then
    printf 'Python 3.12 è richiesto per installare le dipendenze documentali.\n' >&2
    exit 1
  fi
  python3.12 -m venv "$qa_dir/python"
  GARE_PYTHON="$qa_dir/python/bin/python"
  "$GARE_PYTHON" -m pip install --only-binary=:all: -r services/gare-appalti/requirements.txt
fi

GARE_PYTHON="$GARE_PYTHON" GARE_DOC_SMOKE=1 GARE_AI_BACKEND=openrouter \
  node --test services/gare-appalti/openrouter.test.mjs
