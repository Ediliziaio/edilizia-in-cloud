/**
 * Misura token-opt Silvio (audit 2026-06): conta tool e char inviati al modello
 * per scenario di classificazione, prima/dopo il filtro per dominio.
 *
 * Uso:  npx -y deno-bin run -A --no-lock scripts/measure-silvio-tools.ts
 */
import {
  CORE_TOOL_DOMAINS,
  domainsForClassification,
  getToolsForChannel,
  TOOL_CONTRACT_LEGEND,
  toolsToOpenAISpec,
} from "../supabase/functions/_shared/silvioTools.ts";

const base = { channel: "internal_chat" as const, role: "company_admin", personaKey: "silvio" };

function measure(label: string, domains: ReturnType<typeof domainsForClassification>) {
  const tools = getToolsForChannel({ ...base, domains });
  const spec = toolsToOpenAISpec(tools);
  const chars = JSON.stringify(spec).length;
  console.log(
    `${label.padEnd(42)} ${String(tools.length).padStart(3)} tool  ${String(chars).padStart(7)} char (~${Math.round(chars / 3.6 / 100) / 10}K tok)`,
  );
  return { tools, spec, chars };
}

console.log("=== Catalogo (enrichment COMPATTO già attivo) ===");
const full = measure("FULL (nessun filtro / fallback)", null);

const scenarios: Array<[string, string, string[]]> = [
  ["finance single-area", "finance", []],
  ["operations single-area", "operations", []],
  ["sales single-area", "sales", []],
  ["hr multi-area (assunzione)", "hr", ["hr", "finance", "strategic"]],
  ["cross-area finance+operations", "finance", ["finance", "operations"]],
  ["fiscal single-area", "fiscal", []],
  ["client single-area", "client", []],
  ["strategic (cross-ecosystem)", "strategic", []],
];
for (const [label, primary, involved] of scenarios) {
  measure(label, domainsForClassification({ primaryArea: primary, involvedAreas: involved }));
}

console.log(`\nTOOL_CONTRACT_LEGEND: ${TOOL_CONTRACT_LEGEND.length} char (una volta nel system)`);
console.log(`CORE_TOOL_DOMAINS: ${CORE_TOOL_DOMAINS.join(", ")}`);

// ── Test cross-area del memo: "confronta marginalità cantieri e scadenze fatture"
// Caso peggiore: classificato multi-area finance+operations. Verifica che i tool
// chiave di entrambe le aree siano nel set filtrato.
const cross = domainsForClassification({ primaryArea: "finance", involvedAreas: ["finance", "operations"] });
const crossTools = getToolsForChannel({ ...base, domains: cross });
const names = new Set(crossTools.map((t) => t.schema?.function?.name ?? t.schema?.name));
const fullNames = [...getToolsForChannel({ ...base, domains: null })].map((t) => t.schema?.function?.name ?? t.schema?.name);

const mustMatch: Array<[string, RegExp]> = [
  ["marginalità cantieri/commesse", /margin|commess|cantier/i],
  ["scadenze/fatture scadute", /fattur|scadut|unpaid|overdue|sollecit/i],
  ["cashflow/incassi", /cashflow|incass|cassa/i],
  ["KPI generali (core)", /kpi/i],
  ["ricerca knowledge (core)", /search_brain|brain/i],
];
console.log("\n=== Verifica cross-area: 'confronta marginalità cantieri e scadenze fatture' ===");
console.log(`domini: ${cross?.join(", ")}`);
let ok = true;
for (const [need, re] of mustMatch) {
  const inFiltered = [...names].filter((n) => re.test(String(n)));
  const inFull = fullNames.filter((n) => re.test(String(n)));
  const pass = inFiltered.length > 0;
  ok = ok && pass;
  console.log(`${pass ? "✅" : "❌"} ${need}: ${inFiltered.length}/${inFull.length} tool nel set filtrato${pass ? ` (es. ${inFiltered.slice(0, 3).join(", ")})` : ` — MANCANO: ${inFull.slice(0, 5).join(", ")}`}`);
}

// Tool del catalogo pieno ESCLUSI dal set cross-area (sanity: devono essere fuori tema)
const excluded = fullNames.filter((n) => !names.has(n));
console.log(`\nEsclusi dal set cross-area (${excluded.length}): ${excluded.slice(0, 15).join(", ")}${excluded.length > 15 ? ", …" : ""}`);

if (!ok) {
  console.error("\n❌ FAIL: il set filtrato perde tool necessari al caso cross-area");
  Deno.exit(1);
}
console.log("\n✅ PASS: il set filtrato copre il caso cross-area del memo");
