#!/usr/bin/env bash
# Sposta le cartelle grandi dell'app dal modulo base al pacchetto di risorse
# «immagini_app» (android/immagini_app), che Google Play installa insieme
# all'app: il modulo base non può superare i 200 MB. Si lancia dopo
# `npx cap sync android` e prima di `:app:bundleRelease`. Per le build di prova
# (APK con assembleDebug) non serve: lì i pacchetti di risorse non ci sono.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DA="$ROOT_DIR/android/app/src/main/assets/public"
A="$ROOT_DIR/android/immagini_app/src/main/assets/public"
CARTELLE=(module-art templates module-detail render-references cover-stock pdf-stock blog module-thumbs images operational quote-picker)

if [[ ! -f "$DA/index.html" ]]; then
  echo "Mancano i file dell'app: prima lancia npx cap sync android" >&2
  exit 1
fi

rm -rf "$A"
mkdir -p "$A"
for c in "${CARTELLE[@]}"; do
  if [[ -d "$DA/$c" ]]; then
    mv "$DA/$c" "$A/$c"
  fi
done

echo "Modulo base: $(du -sh "$DA" | cut -f1) · pacchetto immagini_app: $(du -sh "$A" | cut -f1)"
