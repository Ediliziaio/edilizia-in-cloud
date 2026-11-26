const SYNC_AI_FUNCTIONS = new Set([
  "generate-bathroom-render", "generate-facade-render", "generate-floor-render",
  "generate-pergola-render", "generate-pool-render", "generate-roof-render",
  "generate-shutter-render", "generate-technical-render",
  "planimetria-genera",
  // La lettura dei contratti con Sonnet 5.5 (17/11/2026): un contratto scansionato di 76 pagine chiede circa
  // 60 secondi, e a 60 il browser chiudeva mentre il server finiva. Budget server: 140 secondi.
  "generic-doc-ai-extract",
  "ai-confronto-modelli",
]);

/** I motori sincroni Alta hanno un budget server di 140 secondi. */
export function supabaseRequestTimeout(input: RequestInfo | URL, method?: string): number {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const metodo = (method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  // Una foto da 15 MB in cantiere può richiedere più dei 25 secondi delle normali letture, anche in download.
  // Le richieste che firmano un link restano brevi; il caricamento ha lo stesso budget dell'XHR di commessa.
  if (/^(GET|POST|PUT|PATCH)$/.test(metodo) && /\/storage\/v1\/object\/(?!sign(?:\/|$)|list(?:\/|$)|move(?:\/|$)|copy(?:\/|$)|info(?:\/|$))[^/]+\/.+/.test(url)) return 240_000;
  const endpoint = url.split(/[?#]/, 1)[0].match(/\/functions\/v1\/([^/]+)\/?$/)?.[1];
  if (!endpoint) return 25_000;
  return SYNC_AI_FUNCTIONS.has(endpoint) ? 155_000 : 60_000;
}
