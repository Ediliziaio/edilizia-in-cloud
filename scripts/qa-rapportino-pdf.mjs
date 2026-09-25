/** Runs the actual Edge Function + renderer with synthetic DB/storage, zero network. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import * as pdfLib from "pdf-lib";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = process.argv[2];
const qa = process.argv[3];
assert(out && qa, "Usage: node scripts/qa-rapportino-pdf.mjs <demo.pdf> <qa-directory>");
fs.mkdirSync(path.dirname(out), { recursive: true }); fs.mkdirSync(qa, { recursive: true });
const dir = path.join(root, "supabase/functions/genera-pdf-rapportino");
const cache = new Map();
function load(file, injections = {}) {
  if (cache.has(file)) return cache.get(file);
  const source = fs.readFileSync(file, "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  const require = ref => {
    if (ref in injections) return injections[ref];
    if (ref.includes("pdf-lib")) return pdfLib;
    if (ref === "./model.ts" || ref === "./render.ts") return load(path.resolve(path.dirname(file), ref));
    throw new Error(`Unstubbed dependency: ${ref}`);
  };
  new Function("require", "module", "exports", "Deno", code)(require, module, module.exports, injections.Deno);
  cache.set(file, module.exports); return module.exports;
}
const { renderRapportino, wrap } = load(path.join(dir, "render.ts"));
const companyId = "10000000-0000-4000-8000-000000000001";
const reportId = "20000000-0000-4000-8000-000000000024";
const orderId = "30000000-0000-4000-8000-000000000001";
const userId = "40000000-0000-4000-8000-000000000001";
const imageRefs = [1, 2].map(i => `campo-rapportini/${companyId}/${orderId}/demo-${i}.png`);
const imageBuffers = new Map();
for (let i = 0; i < 2; i++) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="480"><rect width="1000" height="480" fill="#eef2f6"/><path d="M170 350V65H830V350Z" fill="${i ? "#dce3e8" : "#dfd6c9"}" stroke="#8999a8" stroke-width="4"/><path d="M170 350L100 408H900L830 350" fill="#cbd5df" stroke="#8999a8" stroke-width="4"/><path d="M620 350V130H755V350" fill="#f8fafc" stroke="#8999a8" stroke-width="4"/>${i ? '<path d="M208 112H570M208 158H570M208 204H570M208 250H570M208 296H570" stroke="#b5c2ce" stroke-width="6"/>' : '<path d="M236 102l38 73-27 49 40 80M390 100l-24 67 30 82-20 55M497 112l31 64-40 84" fill="none" stroke="#aa967f" stroke-width="11"/>'}<text x="500" y="452" text-anchor="middle" font-family="Arial,sans-serif" font-size="24" fill="#334155">SCHEMA DIMOSTRATIVO ${i + 1} - NON È UNA FOTO DI CANTIERE</text></svg>`;
  imageBuffers.set(imageRefs[i], await sharp(Buffer.from(svg)).png().toBuffer());
}
const report = {
  id: reportId, company_id: companyId, order_id: orderId, user_id: userId,
  data_lavoro: "2026-09-24", created_at: "2026-09-24T15:05:00Z", updated_at: "2026-09-24T15:05:00Z",
  ore_lavorate: 7.5, ore_straordinario: 0, role_type: "employee", stato: "inviato",
  autore: { first_name: "Luca", last_name: "Demo" },
  ordine: { order_code: "DEMO-024", description: "Ristrutturazione appartamento", client_name: "Cliente dimostrativo", indirizzo_lavori: "Via Esempio 12 - Località DEMO" },
  descrizione_lavori: "Soggiorno: preparazione dei supporti, applicazione del primer e ripristino dell'intonaco.\nRegolarizzazione delle spallette e posa della rete di rinforzo. Pulizia dell'area a fine giornata.",
  fasi_lavorate: [{ phase_id: "intonaco", percentuale: 45 }, { phase_id: "protezioni", percentuale: 100 }],
  presenze: [{ employee_id: "luca", nome: "Luca Demo", ore: 7.5 }, { employee_id: "anna", nome: "Anna Prova", ore: 4 }],
  materiali_usati: [{ nome: "Malta premiscelata per intonaco", quantita: 6, unita: "sacchi", da_furgone: false }, { nome: "Primer consolidante", quantita: 3, unita: "l", da_furgone: true }, { nome: "Rete in fibra di vetro", quantita: 12, unita: "m²", order_item_id: "rete" }],
  foto_urls: imageRefs,
  note: "Domani: completamento delle spallette, dopo l'asciugatura.\nFACSIMILE - Dati inventati e immagini schematiche. Nessuna firma raccolta; non è un'attestazione di lavoro.",
  costo_manodopera: 999999, gps_lat: 42.1234567, presenze_registrate: [{ costo_orario: 123456 }],
};
const ctx = {
  report, company: { name: "IMPRESA DEMO", legal_address: "Via Esempio 1", legal_city: "Località DEMO", email: "demo@example.invalid" },
  branding: { primaryColor: "#F97415", platformName: "Edilizia in Cloud" },
  phases: [{ id: "intonaco", name: "Ripristino intonaci interni" }, { id: "protezioni", name: "Protezioni e preparazione" }],
  punches: [{ tipo: "entrata", timestamp_evento: "2026-09-24T06:00:00Z" }, { tipo: "pausa_inizio", timestamp_evento: "2026-09-24T10:00:00Z" }, { tipo: "pausa_fine", timestamp_evento: "2026-09-24T11:00:00Z" }, { tipo: "uscita", timestamp_evento: "2026-09-24T14:30:00Z" }],
  warnings: [], revision: "DEMO-01", generatedAt: "2026-09-24T15:06:00Z",
};
const loadDemoImage = async ref => imageBuffers.get(ref) ?? null;
const demo = await renderRapportino(ctx, loadDemoImage);
fs.writeFileSync(out, demo.bytes);
assert.deepEqual(demo.warnings, []);
let assertions = 1;
// Stress cases retain sentinel text, original photo indexes and repeated tables.
const scenarios = [
  ["stress", { ...ctx, report: { ...report, descrizione_lavori: ("Descrizione estesa: " + "a".repeat(140) + "\n").repeat(24) + "FINE_DESCRIZIONE", note: Array.from({ length: 55 }, (_, i) => `Nota ${i + 1}: controllo completo della lavorazione.`).join("\n") + "\nFINE_NOTE", materiali_usati: Array.from({ length: 45 }, (_, i) => ({ nome: `Materiale ${i + 1}: ${"descrizione ".repeat(i === 10 ? 190 : 4)}`, quantita: i + 1, unita: "m²" })), foto_urls: [...imageRefs, "missing"], lavoro_completato: true, firma_operaio_url: "missing" } }],
  ["subappalto", { ...ctx, report: { ...report, role_type: "subcontractor", presenze: [{ subappaltatore_id: "sub", nome: "Impresa esterna DEMO", ore: 4 }], stato: "approvato", approvato: true, approvato_at: "2026-09-25T06:00:00Z", foto_urls: [] } }],
  ["minimo", { ...ctx, report: { id: reportId, data_lavoro: "2026-09-24", stato: "bozza" }, punches: [], phases: [] }],
];
for (const [name, context] of scenarios) {
  const result = await renderRapportino(context, loadDemoImage);
  fs.writeFileSync(path.join(qa, `${name}.pdf`), result.bytes);
  assert((await pdfLib.PDFDocument.load(result.bytes)).getPageCount() > 0);
  if (name === "stress") assert.equal(result.warnings.length, 2);
  assertions++;
}
const fontDoc = await pdfLib.PDFDocument.create(), font = await fontDoc.embedFont(pdfLib.StandardFonts.Helvetica);
const lines = wrap("Prima riga\n\n" + "A".repeat(500), font, 9, 100);
assert(lines.includes("")); assert(lines.every(l => font.widthOfTextAtSize(l, 9) <= 100)); assertions += 2;

let handler, state;
const operations = [];
function db(kind) {
  return { from(table) {
    let update = null; const filters = [];
    const q = {
      select(value) { operations.push([kind, table, "select", value]); return q; },
      update(value) { update = value; return q; },
      eq(...args) { filters.push(args); return q; },
      in(...args) { filters.push(args); return q; },
      gte(...args) { filters.push(args); return q; },
      lt(...args) { filters.push(args); return q; },
      order() { return q; },
      single: async () => result(), maybeSingle: async () => result(),
      then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
    };
    function result() {
      operations.push([kind, table, update ? "update" : "read", filters, update]);
      if (table === "campo_rapportini" && kind === "caller") return { data: state.denied ? null : { id: reportId } };
      if (table === "campo_rapportini" && update) return { data: state.conflict ? null : { id: reportId }, error: state.updateError ? {} : null };
      if (table === "campo_rapportini") return { data: report };
      if (table === "profiles") return { data: { company_id: state.otherTenant ? "other" : companyId } };
      if (table === "companies") return { data: ctx.company };
      if (table === "order_work_phases") return { data: ctx.phases };
      if (table === "campo_timbrature") return { data: ctx.punches };
      throw new Error(`Unexpected table ${table}`);
    }
    return q;
  }, storage: { from(bucket) { return {
    download: async assetPath => { const buffer = imageBuffers.get(`${bucket}/${assetPath}`); return { data: buffer ? new Blob([buffer]) : null }; },
    upload: async (assetPath, bytes, options) => { assert.equal(options.upsert, false); assert(assetPath.includes("/rapportino-v2-")); state.uploads.push(assetPath); state.bytes = bytes; return { error: state.uploadError ? {} : null }; },
    getPublicUrl: assetPath => ({ data: { publicUrl: `https://local.invalid/storage/v1/object/public/${bucket}/${assetPath}` } }),
  }; } } };
}
load(path.join(dir, "index.ts"), {
  "https://esm.sh/@supabase/supabase-js@2": { createClient: () => db("caller") },
  "../_shared/headers.ts": { getCorsHeaders: () => ({}), errorResponse: (message, status) => Response.json({ error: message }, { status }), jsonResponse: (body, status) => Response.json(body, { status }) },
  "../_shared/auth.ts": { requireAuth: async () => { if (state.noAuth) throw new Response("unauthorized", { status: 401 }); return { userId, supabaseAdmin: db("admin") }; } },
  "../_shared/getBranding.ts": { getBrandingForCompany: async () => ctx.branding },
  "../_shared/fetchWithTimeout.ts": { fetchWithTimeout: () => { throw new Error("Network forbidden in local QA"); } },
  Deno: { env: { get: key => key === "SUPABASE_URL" ? "https://local.invalid" : "synthetic-not-a-key" }, serve: fn => { handler = fn; } },
});
for (const [flags, expected] of [[{}, 200], [{ denied: true }, 403], [{ otherTenant: true }, 403], [{ noAuth: true }, 401], [{ conflict: true }, 409], [{ uploadError: true }, 500], [{ updateError: true }, 500]]) {
  state = { uploads: [], ...flags }; operations.length = 0;
  const response = await handler(new Request("http://local.invalid", { method: "POST", headers: { authorization: "Bearer synthetic" }, body: JSON.stringify({ rapportino_id: reportId }) }));
  assert.equal(response.status, expected, await response.clone().text()); assertions++;
  if (expected === 200) {
    const body = await response.json(); assert.equal(body.warnings.length, 0);
    assert(operations.some(o => o[0] === "caller" && o[1] === "campo_timbrature" && o[2] === "read" && o[3].some(f => f[0] === "order_id" && f[1] === orderId)));
    assert(operations.some(o => o[2] === "update" && o[3].some(f => f[0] === "updated_at" && f[1] === report.updated_at)));
    fs.writeFileSync(path.join(qa, "edge-function.pdf"), state.bytes);
  }
  if (flags.denied || flags.noAuth || flags.otherTenant) assert.equal(state.uploads.length, 0);
}
state = { uploads: [] };
const invalid = await handler(new Request("http://local.invalid", { method: "POST", body: JSON.stringify({ rapportino_id: "bad" }) })); assert.equal(invalid.status, 400); assertions++;
console.log(JSON.stringify({ demo: out, demoPages: demo.pageCount, assertions, remoteRequests: 0, realWrites: 0, qaDirectory: qa }, null, 2));
