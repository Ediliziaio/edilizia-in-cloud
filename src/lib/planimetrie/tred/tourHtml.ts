/**
 * Tour 3D da mandare al cliente: un solo file HTML con il modello dentro (GLB in base64) e il
 * visore <model-viewer> preso da CDN. Si apre con doppio clic, su telefono e computer, senza
 * account né app: si gira col dito o col mouse, si avvicina con due dita o la rotella.
 * Il file pesa quanto il GLB più un terzo; per una casa sono poche centinaia di kB.
 */
const VERSIONE_VISORE = "3.5.0";

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function base64(dati: Uint8Array): string {
  let s = "";
  for (let i = 0; i < dati.length; i += 0x8000) s += String.fromCharCode(...dati.subarray(i, i + 0x8000));
  return btoa(s);
}

export function tourHtml(glb: Uint8Array, opzioni: { titolo: string; azienda?: string; nota?: string }): string {
  const titolo = escape(opzioni.titolo || "Tour 3D");
  const sotto = [opzioni.azienda, opzioni.nota].filter(Boolean).map((s) => escape(s!)).join(" · ");
  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${titolo}</title>
<script type="module" src="https://cdn.jsdelivr.net/npm/@google/model-viewer@${VERSIONE_VISORE}/dist/model-viewer.min.js"></script>
<style>
  html,body{margin:0;height:100%;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#eef1f4;color:#1f2937}
  header{position:fixed;top:0;left:0;right:0;padding:12px 16px;background:rgba(255,255,255,.85);backdrop-filter:blur(6px);z-index:2}
  h1{margin:0;font-size:17px}
  p{margin:2px 0 0;font-size:12px;color:#6b7280}
  model-viewer{width:100%;height:100%;--poster-color:transparent}
  .aiuto{position:fixed;bottom:12px;left:50%;transform:translateX(-50%);font-size:12px;background:rgba(255,255,255,.85);padding:6px 12px;border-radius:999px}
</style>
</head>
<body>
<header><h1>${titolo}</h1>${sotto ? `<p>${sotto}</p>` : ""}</header>
<model-viewer src="data:model/gltf-binary;base64,${base64(glb)}" alt="${titolo}" camera-controls touch-action="pan-y"
  auto-rotate auto-rotate-delay="4000" rotation-per-second="12deg" shadow-intensity="0.8" exposure="1.05"
  camera-orbit="35deg 55deg auto" interaction-prompt="none"></model-viewer>
<div class="aiuto">Trascina per girare · due dita o rotella per avvicinarti</div>
</body>
</html>
`;
}
