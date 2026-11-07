const SYNC_AI_FUNCTIONS = new Set([
  "generate-bathroom-render", "generate-facade-render", "generate-floor-render",
  "generate-pergola-render", "generate-pool-render", "generate-roof-render",
  "generate-shutter-render", "generate-technical-render",
  "planimetria-genera",
]);

/** I motori sincroni Alta hanno un budget server di 140 secondi. */
export function supabaseRequestTimeout(input: RequestInfo | URL): number {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const endpoint = url.split(/[?#]/, 1)[0].match(/\/functions\/v1\/([^/]+)\/?$/)?.[1];
  if (!endpoint) return 25_000;
  return SYNC_AI_FUNCTIONS.has(endpoint) ? 155_000 : 60_000;
}
