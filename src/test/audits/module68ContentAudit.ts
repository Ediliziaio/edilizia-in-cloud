/** Read-only factory audit. Never imports editors, storage adapters or PDF exporters. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { SALES_AREAS } from "@/lib/moduli-vendita/areas";
import { FULL_MODULE_COVERS } from "@/lib/moduli-vendita/fullModuleCatalog";
import { createFullSerramentiTemplate, FULL_SERRAMENTI_MODULES } from "@/lib/moduli-vendita/fullSerramentiModules";
import { createFullTettiTemplate, FULL_TETTI_MODULES } from "@/lib/moduli-vendita/fullTettiModules";
import { createFullRstTemplate, FULL_RST_MODULES, FULL_PARETI_SOFFITTI_MODULES, FULL_PERGOLE_MODULES } from "@/lib/moduli-vendita/fullRstModules";
import { createFullBgnTemplate, FULL_BGN_MODULES } from "@/lib/moduli-vendita/fullBgnModules";
import { createFullFvTemplate, FULL_FV_MODULES } from "@/lib/moduli-vendita/fullFvModules";
import { createFullClmTemplate, FULL_CLM_MODULES } from "@/lib/moduli-vendita/fullClmModules";
import { createFullIdrTemplate, FULL_IDR_MODULES } from "@/lib/moduli-vendita/fullIdrModules";
import { createFullEltTemplate, FULL_ELT_MODULES } from "@/lib/moduli-vendita/fullEltModules";
import { createFullPavTemplate, FULL_PAV_MODULES } from "@/lib/moduli-vendita/fullPavModules";
import { createFullPscTemplate, FULL_PSC_MODULES } from "@/lib/moduli-vendita/fullPscModules";
import { createFullFacTemplate, FULL_FAC_MODULES } from "@/lib/moduli-vendita/fullFacModules";
import { leggiBlocco, leggiFotoPagina, fotoDellaLibreria, type ChiaveBlocco, type ChiaveFotoPagina, type SettoreBlocchi } from "../../../supabase/functions/_shared/blocchiPreventivo";

type Data = Record<string, unknown>;
const rec = (value: unknown): Data => value && typeof value === "object" && !Array.isArray(value) ? value as Data : {};
const arr = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const str = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const plain = (value: unknown): string => str(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const seed: { id: string; company_id: string; ragione_sociale: string; logo_url: string | null; cover_logo_url: string | null } = { id: "audit-offline", company_id: "audit-offline", ragione_sociale: "Impresa esempio", logo_url: null, cover_logo_url: null };
function register<B, I extends string, T>(ids: readonly I[], factory: (base: B, id: I) => T) {
  return { ids, make: (id: string) => {
    const base = structuredClone(seed), before = JSON.stringify(base);
    const template = factory(base as B, id as I);
    if (JSON.stringify(base) !== before) throw new Error(`Factory mutated its input: ${id}`);
    return rec(template);
  } };
}
export const MODULE68_FACTORIES = {
  serramenti: register(FULL_SERRAMENTI_MODULES, createFullSerramentiTemplate),
  tetti: register(FULL_TETTI_MODULES, createFullTettiTemplate),
  ristrutturazioni: register(FULL_RST_MODULES, createFullRstTemplate),
  "pareti-soffitti": register(FULL_PARETI_SOFFITTI_MODULES, createFullRstTemplate),
  pergole: register(FULL_PERGOLE_MODULES, createFullRstTemplate),
  bagni: register(FULL_BGN_MODULES, createFullBgnTemplate),
  fotovoltaico: register(FULL_FV_MODULES, (base: Parameters<typeof createFullFvTemplate>[0], id) => createFullFvTemplate(base, seed.company_id, id)),
  climatizzazione: register(FULL_CLM_MODULES, createFullClmTemplate),
  termoidraulica: register(FULL_IDR_MODULES, createFullIdrTemplate),
  elettrico: register(FULL_ELT_MODULES, createFullEltTemplate),
  pavimenti: register(FULL_PAV_MODULES, createFullPavTemplate),
  piscine: register(FULL_PSC_MODULES, createFullPscTemplate),
  facciate: register(FULL_FAC_MODULES, createFullFacTemplate),
};
export type AuditArea = keyof typeof MODULE68_FACTORIES;
/** Independent acceptance inventory: deleting a model from both app lists must still fail. */
export const MODULE68_EXPECTED: Record<AuditArea, readonly string[]> = {
  serramenti: ["finestre", "persiane", "avvolgibili", "zanzariere", "porte-ingresso", "porte-interne", "combinato"],
  tetti: ["rifacimento", "ripasso", "riparazioni", "isolamento", "impermeabilizzazione", "lattoneria", "amianto", "linea-vita", "lucernari"],
  ristrutturazioni: ["completa", "parziale", "commerciale", "spazi", "computo", "cucina", "sottotetto", "aperture-portanti", "condominio", "montascale"],
  "pareti-soffitti": ["tinteggiatura-interna", "carta-da-parati", "cartongesso", "controsoffitti", "decorativi", "umidita", "acustica"],
  pergole: ["pergola-bioclimatica", "pergola-telo", "tende-sole", "vetrate", "carport"],
  bagni: ["completo", "vasca-doccia", "doccia", "sanitari", "accessibilita", "rinnovo"],
  fotovoltaico: ["nuovo", "accumulo", "ampliamento", "componenti", "manutenzione"],
  climatizzazione: ["monosplit", "multisplit", "canalizzato", "sostituzione", "manutenzione", "vmc"],
  termoidraulica: ["caldaia", "pompa-calore", "ibrido", "radiante", "terminali", "idrico", "acqua-calda", "manutenzione", "conto-termico", "full-electric", "pellet", "solare-termico", "trattamento-acqua"],
  elettrico: ["completo", "adeguamento", "punti", "quadro", "domotica", "videocitofonia", "ricarica", "antifurto", "illuminazione", "automazioni", "rete-dati"],
  pavimenti: ["sovrapposizione", "rifacimento", "resina", "parquet", "pareti", "esterni"],
  piscine: ["nuova", "ristrutturazione", "rivestimento", "impianti", "accessori", "manutenzione"],
  facciate: ["cappotto", "rifacimento", "balconi", "tinteggiatura", "interno", "riparazioni"],
};
export const MODULE68_MODELS = Object.entries(MODULE68_EXPECTED).flatMap(([area, ids]) => ids.map(id => ({ area: area as AuditArea, id, key: `${area}/${id}` })));
const operational: ChiaveBlocco[] = ["comeFunziona", "protezione", "controlli", "documenti", "diario"];
const edilePages: ChiaveFotoPagina[] = ["chiSiamo", "percorso", "computo", "compreso", "investimento", "garanzie", "tempi", "domande", "recensioni", "chiusura"];
const srPages: ChiaveFotoPagina[] = ["percorso", "confronto", "proposta", "allegato", "dettagli", "cta"];
const fvPages: ChiaveFotoPagina[] = ["garanzie", "bollette", "componenti", "costi", "cassa", "piano", "faq", "risparmio", "produzione", "recensioni", "decisione"];
export type AuditIssue = { severity: "error" | "review"; code: string; field: string; detail: string };
export type AuditSection = { key: string; required: boolean; visibility: "visible" | "hidden" | "conditional"; source: "factory" | "sector-fallback"; title: string; intro: string; text: unknown; itemCount: number; photos: string[]; photoRequired: boolean };
export type AuditPhoto = { url: string; role: string; origin: "factory" | "sector-fallback" | "library" };
export interface ModelAudit {
  key: string; area: AuditArea; id: string; name: string; schema: "edile" | "serramenti" | "fotovoltaico";
  factoryFile: string; contentSha256: string; metadata: { intervention: unknown; edition: unknown; photoRevision: unknown };
  cover: { title: string; subtitle: string; url: string; catalogUrl: string };
  sections: AuditSection[]; photos: AuditPhoto[]; issues: AuditIssue[];
  expectedSections: string[]; declaredPageOrder: unknown[]; optionalEmptyFields: string[];
  textFields: Record<string, string>;
  visualPdfInspection: "not-performed"; actualPdfImageEmbedding: "not-tested";
}
const factoryFiles: Record<AuditArea, string> = { serramenti: "fullSerramentiModules", tetti: "fullTettiModules", ristrutturazioni: "fullRstModules", "pareti-soffitti": "fullRstModules", pergole: "fullRstModules", bagni: "fullBgnModules", fotovoltaico: "fullFvModules", climatizzazione: "fullClmModules", termoidraulica: "fullIdrModules", elettrico: "fullEltModules", pavimenti: "fullPavModules", piscine: "fullPscModules", facciate: "fullFacModules" };
const sectors: Record<AuditArea, SettoreBlocchi> = { serramenti: "serramenti", tetti: "tetti", ristrutturazioni: "ristrutturazione", "pareti-soffitti": "ristrutturazione", pergole: "ristrutturazione", bagni: "bagni", fotovoltaico: "fotovoltaico", climatizzazione: "climatizzazione", termoidraulica: "termoidraulico", elettrico: "elettrico", pavimenti: "pavimenti", piscine: "piscine", facciate: "ristrutturazione" };
const proofFields = ["testimonianze", "testimonianze_default", "recensioni", "gallery_lavori", "cantieri_galleria", "certificazioni"];
const photoUrls = (value: unknown): string[] => arr(rec(value).foto).map(str).filter(Boolean);
export const isAuditLocalAsset = (url: string) => /^\/(?:module-art|pdf-stock|cover-stock|render-references)\/[a-z0-9/_-]+\.(?:jpe?g|png|webp)$/i.test(url);

export function inspectModule68(area: AuditArea, id: string, template = MODULE68_FACTORIES[area].make(id)): ModelAudit {
  const key = `${area}/${id}`, schema = area === "serramenti" || area === "fotovoltaico" ? area : "edile";
  const blocks = rec(template.pdf_blocchi), defaults = rec(blocks.modulo_defaults), sector = sectors[area];
  const issues: AuditIssue[] = [], sections: AuditSection[] = [], photos: AuditPhoto[] = [];
  const issue = (code: string, field: string, detail: string, severity: AuditIssue["severity"] = "error") => issues.push({ severity, code, field, detail });
  const cover = { title: str(template.pdf_cover_hero) || str(template.cover_title), subtitle: str(template.pdf_cover_subhero) || str(template.cover_subtitle), url: str(template.pdf_cover_image_url) || str(template.cover_image_url), catalogUrl: FULL_MODULE_COVERS[key] || "" };
  for (const [field, value] of Object.entries(cover)) if (!value) issue("missing-cover-field", `cover.${field}`, "Required cover metadata is empty");
  if (cover.url !== cover.catalogUrl) issue("catalog-cover-mismatch", "cover.url", `${cover.url} != ${cover.catalogUrl}`);
  if (cover.url) photos.push({ url: cover.url, role: "cover", origin: "factory" });
  if (blocks.modulo_intervento == null) issue("missing-refresh-module-id", "pdf_blocchi.modulo_intervento", `Template ${String(template.id)} identifies the module, but the photography refresh reads only blocks/defaults.modulo_intervento. Add ${id} to fresh blocks and captured defaults; old-copy refresh needs its trusted outer module ID.`, "review");
  else if (blocks.modulo_intervento !== id) issue("intervention-id-mismatch", "pdf_blocchi.modulo_intervento", `Expected ${id}; received ${String(blocks.modulo_intervento)}`);
  if (!Object.keys(defaults).length) issue("missing-reset-defaults", "pdf_blocchi.modulo_defaults", "No captured defaults for resetting authored sections");
  const order = arr(template.pdf_ordine_capitoli ?? template.pdf_pages_order);
  const orderKey = (value: unknown) => str(rec(value).chiave ?? rec(value).id);
  const enabled = (page: string) => {
    const found = order.find(value => orderKey(value) === page);
    return found ? rec(found).visibile !== false && rec(found).visible !== false : null;
  };
  if (new Set(order.map(orderKey)).size !== order.length) issue("duplicate-page-id", "page-order", "Page identifiers are not unique");
  const requiredPages = schema === "edile" ? ["apertura", "progetto", "percorso", ...operational, "piano", "compreso", "investimento", "garanzie", "tempi", "domande"]
    : schema === "serramenti" ? ["proposta", "come_funziona", "protezione", "controlli", "documenti", "diario", "investimento", "percorso", "garanzie", "faq", "cta"]
      : ["come_funziona", "protezione", "controlli", "documenti", "diario", "garanzie", "faq", "decisione"];
  for (const page of requiredPages) if (enabled(page) !== true) issue("required-page-not-enabled", `page-order.${page}`, "Expected section not explicitly visible in factory page order");
  const addList = (field: string, fields: string[], min: number) => {
    const list = arr(template[field]);
    if (list.length < min) issue("missing-list-content", field, `Expected at least ${min} entries; got ${list.length}`);
    list.forEach((item, index) => {
      if (typeof item === "string") { if (!plain(item)) issue("missing-item-text", `${field}.${index}`, "Empty string entry"); }
      else for (const name of fields) if (!plain(rec(item)[name])) issue("missing-item-text", `${field}.${index}.${name}`, "Required item text is empty");
    });
    sections.push({ key: field, required: true, visibility: "visible", source: "factory", title: field, intro: "", text: list, itemCount: list.length, photos: [], photoRequired: false });
  };
  if (schema === "edile") {
    for (const field of ["esigenze", "soluzione", "usp", "percorso", "garanzie"]) addList(field, ["titolo", "descrizione"], 1);
    addList("cronoprogramma", ["fase", "descrizione", "durata"], 1);
    addList("faq", ["domanda", "risposta"], 6);
  } else if (schema === "serramenti") {
    for (const field of ["esigenze_default", "soluzione_default", "garanzie"]) addList(field, ["titolo", "descrizione"], 1);
    addList("perche_noi_default", [], 1); addList("faq_items", ["domanda", "risposta"], 6);
    addList("incluso_default", [], 1); addList("prossimi_passi_default", [], 1); addList("pdf_cta_finale_passi", [], 1);
    if (!plain(blocks.modulo_esclusioni)) issue("missing-exclusions", "pdf_blocchi.modulo_esclusioni", "No explicit excluded work scope");
    if (!plain(template.pdf_cta_finale_titolo)) issue("missing-required-text", "pdf_cta_finale_titolo", "Closing title is empty");
    const journey = rec(template.percorso_cliente), phases = arr(journey.fasi);
    if (!str(journey.titolo) || !str(journey.sottotitolo) || !phases.length) issue("missing-journey-content", "percorso_cliente", "Journey title, introduction and phases required");
    phases.forEach((phase, index) => { if (!str(rec(phase).nome) || !arr(rec(phase).step).every(item => !!plain(item)) || !arr(rec(phase).step).length) issue("missing-item-text", `percorso_cliente.fasi.${index}`, "Phase needs name and populated steps"); });
    sections.push({ key: "percorso_cliente", required: true, visibility: "visible", source: "factory", title: str(journey.titolo), intro: str(journey.sottotitolo), text: phases, itemCount: phases.length, photos: [], photoRequired: false });
  } else {
    addList("usp", ["titolo", "descrizione"], 1); addList("garanzie_conversione", ["titolo", "descrizione"], 1);
    addList("cronoprogramma", ["fase", "descrizione", "durata"], 1); addList("faq_items", ["domanda", "risposta"], 6);
    for (const field of ["percorso_cliente_intro", "valore_proposta_html", "pdf_cta_finale_titolo", "pdf_cta_finale_testo"]) {
      if (!plain(template[field])) issue("missing-required-text", field, "Required authored text missing");
      sections.push({ key: field, required: true, visibility: "visible", source: "factory", title: field, intro: "", text: template[field], itemCount: 1, photos: [], photoRequired: false });
    }
  }
  const blockKeys: ChiaveBlocco[] = schema === "edile" ? [...operational, "compreso"] : operational;
  for (const blockKey of blockKeys) {
    const raw = rec(blocks[blockKey]), resolved = leggiBlocco(blockKey, sector, blocks);
    // All standard technical explanations now have an authored photograph.
    // Company copies may remove it; this audit validates only clean factories.
    const requiredPhoto = blockKey !== "compreso";
    for (const field of ["titolo", "intro"] as const) if (!plain(raw[field])) issue("missing-authored-block-text", `pdf_blocchi.${blockKey}.${field}`, `Raw factory field missing (sector fallback can mask it: ${String(resolved[field])})`);
    if (!arr(raw.voci).length) issue("missing-authored-block-items", `pdf_blocchi.${blockKey}.voci`, "No explicitly authored items");
    arr(raw.voci).forEach((item, index) => { for (const field of ["titolo", "testo"]) if (!plain(rec(item)[field])) issue("missing-item-text", `pdf_blocchi.${blockKey}.voci.${index}.${field}`, "Empty authored item"); });
    if (blockKey === "compreso" && !arr(raw.escluse).length) issue("missing-exclusions", "pdf_blocchi.compreso.escluse", "No explicit excluded work entries");
    if (requiredPhoto && !resolved.foto.length) issue("missing-operational-photo", `pdf_blocchi.${blockKey}.foto`, "Operational page has no resolved photo; library-only images do not count");
    if (resolved.foto.length && !/illustrativ|simulazion/i.test(`${str(raw.nota)} ${str(template.render_disclaimer)}`)) issue("missing-illustration-notice", `pdf_blocchi.${blockKey}.nota`, "Photo lacks an explicit illustrative notice", "review");
    if (JSON.stringify(defaults[blockKey]) !== JSON.stringify(blocks[blockKey])) issue("reset-default-mismatch", `pdf_blocchi.${blockKey}`, "Reset snapshot differs from factory content");
    const section: AuditSection = { key: blockKey, required: true, visibility: "visible", source: Object.keys(raw).length ? "factory" : "sector-fallback", title: resolved.titolo, intro: resolved.intro || "", text: { items: resolved.voci, exclusions: resolved.escluse, note: raw.nota }, itemCount: resolved.voci.length, photos: resolved.foto, photoRequired: requiredPhoto };
    sections.push(section);
    photos.push(...resolved.foto.map(url => ({ url, role: `block.${blockKey}`, origin: photoUrls(raw).includes(url) ? "factory" as const : "sector-fallback" as const })));
  }
  const usedInBlocks = new Set(photos.filter(p => p.role.startsWith("block.")).map(p => p.url));
  const closingKey = schema === "edile" ? "chiusura" : schema === "serramenti" ? "cta" : "decisione";
  const closing = leggiFotoPagina(closingKey, sector, blocks);
  if (!closing) issue("missing-closing-photo", `pdf_blocchi.pagina_${closingKey}`, "Closing photo missing");
  // Only DocumentoEdilePDF suppresses closing photographs this way. Do not apply to SR/FV.
  if (schema === "edile" && closing && usedInBlocks.has(closing)) issue("suppressed-closing-photo", `pdf_blocchi.pagina_${closingKey}`, "Closing photo is also a block photo; shared Edile renderer suppresses it");
  for (const page of schema === "edile" ? edilePages : schema === "serramenti" ? srPages : fvPages) {
    const rawKey = `pagina_${page}`, raw = rec(blocks[rawKey]), url = leggiFotoPagina(page, sector, blocks);
    const pageOrderKey = page === "computo" ? "piano" : page;
    const visibility = enabled(pageOrderKey) === false || page === "recensioni" ? "hidden" : "conditional";
    if (url) photos.push({ url, role: rawKey, origin: photoUrls(raw).includes(url) ? "factory" : "sector-fallback" });
    sections.push({ key: rawKey, required: page === closingKey, visibility, source: Object.keys(raw).length ? "factory" : "sector-fallback", title: rawKey, intro: "", text: { raw, conditionalOnLayout: true }, itemCount: 0, photos: url ? [url] : [], photoRequired: page === closingKey });
    if (schema === "edile" && visibility !== "hidden" && url && page !== closingKey && (usedInBlocks.has(url) || closing === url)) issue("conditional-photo-dedup", rawKey, "Photo duplicates a block or closing photo; may be suppressed when the page needs a filler", "review");
  }
  const library = fotoDellaLibreria(sector, blocks);
  for (const entry of arr(blocks.modulo_foto)) {
    const url = str(rec(entry).url);
    if (url) photos.push({ url, role: "library", origin: "library" });
    if (!url || !str(rec(entry).nome)) issue("invalid-library-entry", "pdf_blocchi.modulo_foto", "Raw library entry requires URL and name");
    else if (!library.some(accepted => accepted.url === url)) issue("shared-chooser-rejects-local-library-entry", "pdf_blocchi.modulo_foto", `${url}: valid for the Facciate local asset validator but filtered by fotoDellaLibreria; reconcile the chooser allowlist or keep the texture in a separate library.`, "review");
  }
  for (const entry of library) if (!/illustrativ|simulazion/i.test(entry.nome)) issue("unlabelled-library-photo", "pdf_blocchi.modulo_foto", `${entry.url}: ${entry.nome}`, "review");
  // Scan actual template fields, excluding captured reset duplicates and photo-library captions.
  const textFields: Record<string, string> = {};
  const walk = (value: unknown, field: string) => {
    if (typeof value === "string") {
      if (!/\.(?:jpg|jpeg|png|webp)(?:\?.*)?$/i.test(value)) textFields[field] = value;
      if (/\blorem ipsum\b|\[object Object\]|\b(?:undefined|NaN|TODO|FIXME)\b/i.test(value)) issue("placeholder-residue", field, value.slice(0, 240));
      if (/\.(?:jpg|jpeg|png|webp)(?:\?.*)?$/i.test(value) && !photos.some(p => p.url === value && p.role === field)) photos.push({ url: value, role: field, origin: "factory" });
    } else if (Array.isArray(value)) value.forEach((item, index) => walk(item, `${field}.${index}`));
    else for (const [name, item] of Object.entries(rec(value))) if (name !== "modulo_defaults" && name !== "modulo_foto") walk(item, field ? `${field}.${name}` : name);
  };
  walk(template, "");
  for (const photo of photos) if (!isAuditLocalAsset(photo.url)) issue("non-local-or-unsafe-asset", photo.role, photo.url);
  for (const field of proofFields) if (arr(template[field]).length) issue("seeded-customer-proof", field, "Clean factory unexpectedly contains reviews, galleries or certificates; requires authentic provenance");
  const faq = arr(template.faq ?? template.faq_items), questions = faq.map(item => plain(rec(item).domanda));
  if (new Set(questions).size !== questions.length) issue("duplicate-faq", "faq", "Duplicate questions in one module");
  // Narrow, objective headline residue rules; do not flag legitimate exclusions/comparisons.
  const headline = `${cover.title} ${cover.subtitle} ${sections.find(s => s.key === "comeFunziona")?.title || ""}`;
  if (!["piscine", "ristrutturazioni"].includes(area) && /\bpiscin[ae]\b/i.test(headline)) issue("foreign-sector-headline", "cover/comeFunziona", "Pool-specific headline in another sector");
  if (["tetti", "piscine", "facciate"].includes(area) && /\b(?:climatizzator[ei]|zanzariere|fotovoltaic[oa])\b/i.test(headline)) issue("foreign-sector-headline", "cover/comeFunziona", headline);
  return {
    key, area, id, name: SALES_AREAS.find(a => a.id === area)?.interventions.find(m => m.id === id)?.title || "",
    schema, factoryFile: `src/lib/moduli-vendita/${factoryFiles[area]}.ts`, contentSha256: createHash("sha256").update(JSON.stringify(template)).digest("hex"),
    metadata: { intervention: blocks.modulo_intervento ?? null, edition: blocks.modulo_edizione ?? null, photoRevision: blocks.modulo_foto_revisione ?? null },
    cover, sections, photos, issues, textFields, expectedSections: sections.filter(s => s.required).map(s => s.key), declaredPageOrder: order,
    optionalEmptyFields: proofFields.filter(field => !arr(template[field]).length), visualPdfInspection: "not-performed", actualPdfImageEmbedding: "not-tested",
  };
}

export type AssetAudit = { url: string; exists: boolean; decoded: boolean; width?: number; height?: number; format?: string; bytes?: number; sha256?: string; error?: string };
/** Local file decode, not HTTP HEAD: load every pixel with Pillow and hash actual bytes. */
export function decodeModule68Assets(models: ModelAudit[], publicRoot = path.resolve("public")): AssetAudit[] {
  const urls = [...new Set(models.flatMap(model => model.photos.map(photo => photo.url)))].sort();
  const code = `import sys,json,pathlib,hashlib\nfrom PIL import Image\npayload=json.load(sys.stdin);root=pathlib.Path(payload['root']).resolve();result=[]\nfor url in payload['urls']:\n row={'url':url,'exists':False,'decoded':False}\n try:\n  file=(root/url.lstrip('/')).resolve()\n  if not file.is_relative_to(root): raise ValueError('Path outside public')\n  row['exists']=file.is_file()\n  with Image.open(file) as img:\n   img.load();row.update(decoded=True,width=img.width,height=img.height,format=img.format)\n  raw=file.read_bytes();row.update(bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest())\n except Exception as exc: row['error']=str(exc)\n result.append(row)\nprint(json.dumps(result))`;
  return JSON.parse(execFileSync("python3", ["-c", code], { encoding: "utf8", input: JSON.stringify({ root: publicRoot, urls }), maxBuffer: 8 * 1024 * 1024 }));
}
export function attachModule68AssetIssues(models: ModelAudit[], assets: AssetAudit[]) {
  const byUrl = new Map(assets.map(asset => [asset.url, asset]));
  for (const model of models) for (const url of new Set(model.photos.map(photo => photo.url))) {
    const asset = byUrl.get(url), roles = model.photos.filter(photo => photo.url === url).map(photo => photo.role);
    if (!asset?.decoded) model.issues.push({ severity: "error", code: "asset-decode-failed", field: roles.join(", "), detail: `${url}: ${asset?.error || "not checked"}` });
    else if (Math.max(asset.width || 0, asset.height || 0) < 800 && roles.some(role => role !== "library")) model.issues.push({ severity: "review", code: "low-resolution-photo", field: roles.join(", "), detail: `${url}: ${asset.width}×${asset.height}; review intended print size` });
  }
  for (const model of models.filter(m => m.schema === "edile")) {
    const closingUrl = model.sections.find(s => s.key === "pagina_chiusura")?.photos[0];
    const closingHash = closingUrl ? byUrl.get(closingUrl)?.sha256 : undefined;
    const alias = model.photos.find(p => p.role.startsWith("block.") && p.url !== closingUrl && closingHash && byUrl.get(p.url)?.sha256 === closingHash);
    if (alias) model.issues.push({ severity: "error", code: "suppressed-closing-photo-content-alias", field: "pagina_chiusura", detail: `${closingUrl} has identical bytes to ${alias.url} in ${alias.role}; data-URL deduplication suppresses closing despite different paths` });
  }
  return models;
}
export function runModule68Audit() {
  const models = MODULE68_MODELS.map(({ area, id }) => inspectModule68(area, id));
  const assets = decodeModule68Assets(models);
  attachModule68AssetIssues(models, assets);
  return {
    generatedAt: new Date().toISOString(), scope: "68 clean factory templates only; read-only app inspection; no saved copies, browser, PDF rendering or network",
    limits: ["Photo assignment is not proof of PDF embedding or visual relevance/crop", "Conditional fillers may not render; page inventory is logical, not physical pagination", "No audit of personal saved content", "No HTTP availability, editor layout/navigation, pricing or renderer tests in this suite"],
    summary: { models: models.length, areas: Object.keys(MODULE68_FACTORIES).length, uniqueAssets: assets.length, decodedAssets: assets.filter(a => a.decoded).length, errors: models.reduce((n, m) => n + m.issues.filter(i => i.severity === "error").length, 0), reviews: models.reduce((n, m) => n + m.issues.filter(i => i.severity === "review").length, 0), modelsWithErrors: models.filter(m => m.issues.some(i => i.severity === "error")).length },
    models, assets,
  };
}

export function module68Markdown(report: ReturnType<typeof runModule68Audit>): string {
  const clean = (value: unknown) => String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  const lines = ["# Audit automatico dei contenuti e asset — 68 factory", "", `Generato: ${report.generatedAt}`, "", "Solo sorgenti/factory pulite; nessun browser, salvataggio, accesso remoto o rendering PDF. Nessuna ispezione visiva dei PDF dichiarata da questo audit.", "", `Modelli: ${report.summary.models}; aree: ${report.summary.areas}; asset decodificati: ${report.summary.decodedAssets}/${report.summary.uniqueAssets}; errori: ${report.summary.errors}; segnalazioni da valutare: ${report.summary.reviews}.`, "", "Foto: assegnazioni risolte, incluse quelle condizionali; non attestano l'effettiva presenza nel PDF. B = blocchi operativi illustrati su 5 possibili; anche le spiegazioni tecniche dei Serramenti hanno ora un'immagine standard obbligatoria nella factory. Compreso può essere senza foto. Le sezioni sono logiche, non numeri di pagina.", "", "| Modello | Titolo copertina | Sezioni richieste | B | FAQ | Asset unici | Chiusura | Esito |", "|---|---|---:|---:|---:|---:|---|---|"];
  for (const m of report.models) {
    const closing = m.sections.find(s => ["pagina_chiusura", "pagina_cta", "pagina_decisione"].includes(s.key));
    const errors = m.issues.filter(i => i.severity === "error").length, reviews = m.issues.filter(i => i.severity === "review").length;
    lines.push(`| ${m.key} | ${clean(m.cover.title)} | ${m.expectedSections.length} | ${m.sections.filter(s => operational.includes(s.key as ChiaveBlocco) && s.photos.length).length}/5 | ${m.sections.find(s => s.key === "faq" || s.key === "faq_items")?.itemCount || 0} | ${new Set(m.photos.map(p => p.url)).size} | ${clean(closing?.photos[0] || "assente")} | ${errors} errori; ${reviews} review |`);
  }
  lines.push("", "## Correzioni e punti di coordinamento", "",
    "- **Refresh fotografico:** ID aggiunto alle sei factory Tetti e a Persiane, prima della cattura dei default. Per copie pregresse il helper accetta `prepareModulePhotoRefresh(value, sector, knownModuleId?)`; il main ha collegato il pulsante al contesto `useTemplateEditorModuleId` (verificato nel sorgente, non via browser da questa suite). Nessuna migrazione automatica. Conflitti rifiutati; foto personalizzate, rimozioni e relativi default conservati. Rev2 senza metadata ritenta solo correzioni mappate esatte, senza riempimenti generici.",
    "- **Texture Facciate:** rimosse dai soli nuovi default le due texture `render-references/facades`, mai assegnate alle pagine e filtrate dal chooser condiviso (12 occorrenze). Le fotografie effettive dei blocchi restano assegnate e nella libreria. Nessuna modifica all'allowlist, agli asset su disco o alle copie salvate.",
    "- **Serramenti testuali:** mantenuti intenzionalmente i quattro Come funziona di finestre, avvolgibili, zanzariere e porte-ingresso. Ciascuno contiene intro e quattro voci tecniche specifiche (componenti, scelta/configurazione e posa); `senzaFoto` esplicito, non un errore di caricamento. Restano registrati come scelta editoriale.",
    "- **Riempimenti condizionali duplicati:** richiedono revisione PDF mirata soltanto se la pagina risulta vuota. Se un blocco ha già la foto o il capitolo occupa lo spazio, la soppressione è intenzionale e non è un difetto.",
    "", "## Anomalie e interventi suggeriti", "");
  for (const m of report.models.filter(model => model.issues.length)) {
    lines.push(`### ${m.key}`, "", `Factory: \`${m.factoryFile}\``, "");
    for (const issue of m.issues) lines.push(`- ${issue.severity.toUpperCase()} · \`${issue.code}\` · \`${issue.field}\`: ${clean(issue.detail)}`);
    lines.push("");
  }
  lines.push("## Criteri e limiti", "", "- ID confrontati con inventario indipendente, areas.ts, liste factory e catalogo; titoli/copertine e sezioni richieste controllati sul valore effettivo.", "- Titolo, intro e righe dei blocchi verificati anche sui valori grezzi: un fallback non può mascherare testo specifico mancante.", "- Foto di copertina, blocchi, pagine e librerie censite per ruolo e origine. Ogni asset è caricato completamente con Pillow; dimensioni, formato, byte e SHA-256 sono nel JSON.", "- Recensioni, certificazioni e gallerie vuote sono intenzionali. Sono controllate le factory da base priva di prove aziendali, non le copie salvate dall'utente.", "- Duplicati delle chiusure Edile sono errori perché il renderer li sopprime; duplicati dei riempimenti condizionali sono review, non prova di una pagina vuota.", "- Identificare la pertinenza di una fotografia o il ritaglio richiede visione umana: nomi e decodifica non bastano. Nessuna certificazione di tutti i PDF.", "- Il JSON conserva per ogni modello testi, sezioni/visibilità, foto/ruoli/origine, hash contenuti e problemi puntuali; è la matrice dettagliata da usare per il collaudo successivo.", "");
  return lines.join("\n");
}
