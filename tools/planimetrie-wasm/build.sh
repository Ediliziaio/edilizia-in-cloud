#!/usr/bin/env bash
# Compila il motore in WebAssembly per la pagina di prova dev/planimetria-motore.
# Serve Rust >= 1.95 con il target wasm32-unknown-unknown e wasm-pack (vedi README).
set -euo pipefail
cd "$(dirname "$0")"
OUT=../../dev/planimetria-motore/wasm
wasm-pack build --release --target web --out-dir "$OUT" --out-name planimetrie_wasm --no-pack "$@"
rm -f "$OUT/.gitignore"
ls -l "$OUT"/*.wasm
