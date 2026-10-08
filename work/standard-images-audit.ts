/** Offline, read-only application audit. Writes only its two requested reports. */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { runModule68Audit, MODULE68_FACTORIES } from "../src/test/audits/module68ContentAudit";
import { TETTI_PHOTOGRAPHY_CORRECTIONS } from "../src/lib/moduli-vendita/tettiPhotographyCorrections";
import { BGN_EDITORIAL_PHOTO_REPLACEMENTS } from "../src/lib/moduli-vendita/bgnEditorialPhotography";
import { RST_PHOTO_CORRECTIONS } from "../src/lib/moduli-vendita/rstPhotoCorrections";
import { CLM_PHOTO_CORRECTIONS, CLM_COVER_PHOTO_CORRECTIONS } from "../src/lib/moduli-vendita/clmPhotoCorrections";
import { IDR_PHOTOGRAPHY_CORRECTIONS } from "../src/lib/moduli-vendita/idrPhotoCorrections";

globalThis.fetch = async () => { throw new Error("Network forbidden in standard image audit"); };
const root = process.cwd(), outputs = path.resolve(root, "../../outputs");
const readJson = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const old = readJson(path.join(outputs, "module68-content-audit/matrix.json"));
const qaPath = path.resolve(root, "../editor-unification-qa/all-edile/final-summary.json");
const qa = readJson(qaPath);
const report = runModule68Audit();
const rec = (x: unknown): Record<string, any> => x && typeof x === "object" && !Array.isArray(x) ? x as Record<string, any> : {};
const urls = (x: unknown): string[] => Array.isArray(rec(x).foto) ? rec(x).foto.filter((x: unknown) => typeof x === "string" && x) : [];
const unique = (x: string[]) => [...new Set(x)];
const hash = (file: string) => createHash("sha256").update(readFileSync(path.resolve(root, file))).digest("hex");
const edileFillers: Record<string, string> = { chiSiamo: "chiSiamo", percorso: "percorso", piano: "computo", compreso: "compreso", investimento: "investimento", garanzie: "garanzie", tempi: "tempi", domande: "domande", recensioni: "recensioni", chiusura: "chiusura" };
const srFillers: Record<string, string> = { percorso: "percorso", confronto: "confronto", proposta: "proposta", allegato_tecnico: "allegato", investimento: "dettagli", cta: "cta" };
const fvFillers: Record<string, string> = { garanzie: "garanzie", bollette_240: "bollette", componenti: "componenti", costi_futuri: "costi", cassa_25: "cassa", piano_pagamento: "piano", faq: "faq", risparmio: "risparmio", produzione: "produzione", recensioni: "recensioni", decisione: "decisione" };
const operational = ["comeFunziona", "protezione", "controlli", "documenti", "diario"];
const observations = [
  { model: "tetti/impermeabilizzazione", page: "protezione", priorPhysicalPage: 6, type: "subject-gap", currentUrl: "/pdf-stock/tetti/protezione.jpg", note: "QA visiva pregressa: tetto inclinato in tegole, non copertura piana/terrazzo.", action: "Foto orizzontale di protezione accessi, bordo e superfici su terrazzo/copertura piana; nessuna falsa attestazione di sicurezza." },
  { model: "tetti/impermeabilizzazione", page: "controlli", priorPhysicalPage: 7, type: "subject-gap", currentUrl: "/pdf-stock/tetti/controllo-termico.jpg", note: "QA visiva pregressa: controlli su tetto inclinato, soggetto poco pertinente a impermeabilizzazione piana.", action: "Dettaglio orizzontale di risvolti, giunti, bocchettone o verifica del manto piano; nota illustrativa, prova solo se prevista." },
  { model: "elettrico/quadro", page: "comeFunziona", priorPhysicalPage: 4, type: "crop", note: "QA visiva pregressa: componenti tagliati sopra e sotto.", action: "Ricomporsi nel formato della fascia o scegliere dettaglio con margini attorno ai componenti, senza ridurre il testo." },
  { model: "bagni/accessibilita", page: "chiusura", priorPhysicalPage: 15, type: "minor-crop", note: "QA visiva pregressa: rubinetto tagliato in alto e molto pavimento; sanitari/maniglioni visibili.", action: "Ritaglio/composizione della chiusura migliorabile; non manca una foto." },
];
const models = report.models.map(m => {
  const template = MODULE68_FACTORIES[m.area].make(m.id), blocks = rec(template.pdf_blocchi);
  const closing = m.schema === "edile" ? "chiusura" : m.schema === "serramenti" ? "cta" : "decisione";
  const fillerMap = m.schema === "edile" ? edileFillers : m.schema === "serramenti" ? srFillers : fvFillers;
  const keys = unique(["cover", ...m.declaredPageOrder.map(p => String(rec(p).chiave ?? rec(p).id)), closing]);
  const qaArea = m.area === "termoidraulica" ? "termoidraulico" : m.area;
  const baseQa = qa.records.find((r: any) => r.area === qaArea && r.module === m.id && r.variant === "base");
  const rows = keys.map(key => {
    const blockKey = key === "come_funziona" ? "comeFunziona" : key;
    const block = m.sections.find(s => s.key === blockKey && (operational.includes(blockKey) || blockKey === "compreso"));
    const fillerKey = fillerMap[key] ? `pagina_${fillerMap[key]}` : null;
    const filler = m.sections.find(s => s.key === fillerKey);
    const order = m.declaredPageOrder.find(p => String(rec(p).chiave ?? rec(p).id) === key);
    const enabled = rec(order).visible !== false && rec(order).visibile !== false;
    const company = ["chi_siamo", "chiSiamo"].includes(key);
    const companyPhoto = company && typeof template.chi_siamo_foto_url === "string" ? template.chi_siamo_foto_url : null;
    const dataDependent = ["lavori", "foto", "recensioni", "gallery_lavori", "render", "anteprima", "confronto", "macro_dedicate", "linee_dedicate", "articoli_dedicati", "macro_categorie"].includes(key);
    const title = key === "cover" ? m.cover.title : block?.title || key;
    const direct = unique(key === "cover" ? [m.cover.url] : [...(block ? urls(blocks[blockKey]) : []), ...(fillerKey ? urls(blocks[fillerKey]).slice(0, 1) : []), ...(companyPhoto ? [companyPhoto] : [])]);
    const resolved = unique(key === "cover" ? [m.cover.url] : [...(block?.photos || []), ...(filler?.photos || []), ...(companyPhoto ? [companyPhoto] : [])]);
    const need = key === "cover" || key === closing || Boolean(block?.photoRequired);
    const textOnly = m.schema === "serramenti" && key === "come_funziona" && !need;
    const policy = need ? "standard-necessary" : textOnly ? "intentional-technical-text" : dataDependent || company ? "authentic-or-product-data-only" : "optional-support-to-content";
    const explicitOff = Boolean((block && rec(blocks[blockKey]).senzaFoto === true) || (fillerKey && rec(blocks[fillerKey]).senzaFoto === true));
    const fallback = resolved.filter(url => !direct.includes(url));
    const dedup = m.issues.filter(i => i.code === "conditional-photo-dedup" && i.field === fillerKey).map(i => i.field);
    const missing = need && !resolved.length;
    const reasons = [
      ...(textOnly ? ["Intro e quattro voci tecniche; senzaFoto esplicito, non placeholder."] : []),
      ...(dataDependent ? ["Richiede dati reali o di prodotto; non sostituire con stock presentato come prova."] : []),
      ...(company ? ["Identità/foto aziendale autentica opzionale; attivazione dipende dai contenuti aziendali."] : []),
      ...(!resolved.length && explicitOff && !textOnly ? ["Slot fotografico disattivato esplicitamente dalla factory."] : []),
      ...(!resolved.length && !explicitOff && !need && !dataDependent && !company ? ["Contenuto testuale/tabellare/diagramma; nessuna immagine standard obbligatoria."] : []),
      ...(fallback.length ? ["Foto risolta dal fallback di settore, non assegnata direttamente a questo slot."] : []),
      ...(dedup.length ? ["Riempimento duplicato: può essere soppresso; non prova una pagina vuota."] : []),
      ...(!enabled ? ["Pagina disattivata nel modello fresh; la foto risolta non implica rendering."] : []),
    ];
    const concerns = observations.filter(o => o.model === m.key && o.page === key).map(o => ({ ...o, mappingStillAssigned: o.currentUrl ? resolved.includes(o.currentUrl) : true, source: "outputs/edile-unification-qa.md / visual-review.json" }));
    const assets = resolved.map(url => {
      const a = report.assets.find(asset => asset.url === url);
      const ratio = a?.width && a?.height ? a.width / a.height : null;
      return { url, width: a?.width, height: a?.height, sha256: a?.sha256, decoded: a?.decoded, ratio,
        layoutConcern: ratio == null ? "unknown" : key === "cover" && ratio > 1.25 ? "landscape-on-A4-cover: crop possible, not a confirmed defect"
          : block && ratio < 0.9 ? "portrait-single-block: tableau/contain layout may dominate; not a missing image"
          : "cover-fit crop depends on final available height; no per-page visual certification" };
    });
    const physicalPage = baseQa?.destinations?.[`edile.section.${key}`] ?? null;
    const textPrefixes: Record<string, string[]> = {
      cover: ["cover_title", "cover_subtitle", "pdf_cover_hero", "pdf_cover_subhero"],
      apertura: ["cover_title", "usp"], progetto: ["esigenze", "soluzione"], proposta: ["esigenze_default", "soluzione_default", "incluso_default"],
      chiSiamo: ["chi_siamo", "usp"], chi_siamo: ["chi_siamo_testo", "perche_noi_default"],
      percorso: ["percorso", "percorso_cliente"], iter: ["percorso_cliente_intro", "cronoprogramma"],
      garanzie: ["garanzie", "garanzie_conversione"], tempi: ["cronoprogramma"],
      domande: ["faq"], faq: ["faq_items"], chiusura: ["cta", "prossimi_passi"], cta: ["pdf_cta_finale_titolo", "pdf_cta_finale_testo", "pdf_cta_finale_passi"],
      decisione: ["pdf_cta_finale_titolo", "pdf_cta_finale_testo", "pdf_cta_finale_passi"], condizioni: ["condizioni_legali_testo"],
    };
    const prefixes = block ? [`pdf_blocchi.${blockKey}`] : textPrefixes[key] || [];
    const matchingText = Object.entries(m.textFields).filter(([field]) => prefixes.some(prefix => field === prefix || field.startsWith(prefix + ".")));
    const contentEvidence = { fields: matchingText.map(([field]) => field), authoredTextCharacters: matchingText.reduce((n, [, value]) => n + value.trim().length, 0),
      quoteDataDependent: ["piano", "investimento", "allegato_tecnico", "componenti", "macro_categorie", "produzione", "flussi", "risparmio", "costi_futuri", "cassa_25", "co2", "piano_pagamento", "bollette_240"].includes(key),
      authenticDataDependent: dataDependent || company };
    return { page: key, title, pageEnabled: enabled, photoPolicy: policy, required: need, rawAssignedCount: direct.length, resolvedCount: resolved.length,
      blockPhotoCount: block?.photos.length ?? 0, fillerPhotoCount: filler?.photos.length ?? 0, rawUrls: direct, resolvedUrls: resolved, fallbackUrls: fallback,
      photoExplicitlyDisabled: explicitOff, trueUnassignedStandardPlaceholder: missing, conditionalDedup: dedup, concerns, assets, reasons, contentEvidence,
      existingBaseQa: physicalPage ? { page: physicalPage, imageSomewhereOnPage: baseQa.image_pages.includes(physicalPage), provesSlotEmbedding: false } : null };
  });
  const repeatedBlockPhotos = unique(m.photos.filter(p => p.role.startsWith("block.")).map(p => p.url)).map(url => ({ url, roles: m.photos.filter(p => p.role.startsWith("block.") && p.url === url).map(p => p.role) })).filter(x => x.roles.length > 1);
  return { key: m.key, name: m.name, schema: m.schema, factoryFile: m.factoryFile, freshContentSha256: m.contentSha256, changedSincePreviousMatrix: old.models.find((p: any) => p.key === m.key)?.contentSha256 !== m.contentSha256,
    issues: m.issues, rows, repeatedBlockPhotos, existingQaBase: baseQa ? { file: baseQa.file, pages: baseQa.pages, imagePages: baseQa.image_pages, issues: baseQa.issues } : null };
});

const maps = { tetti: TETTI_PHOTOGRAPHY_CORRECTIONS, bagni: BGN_EDITORIAL_PHOTO_REPLACEMENTS, ristrutturazioni: RST_PHOTO_CORRECTIONS, climatizzazione: CLM_PHOTO_CORRECTIONS, termoidraulica: IDR_PHOTOGRAPHY_CORRECTIONS };
const legacyCandidates = Object.entries(maps).flatMap(([area, ids]) => Object.entries(ids).flatMap(([id, entries]) => Object.entries(entries).map(([slot, change]) => ({ model: `${area}/${id}`, slot, ...change, actualSavedOccurrence: "not-inspected", source: "declared photo correction map" }))));
const rows = models.flatMap(m => m.rows.map(row => ({ model: m.key, ...row })));
const summary = { models: models.length, logicalPageRows: rows.length, uniqueAssets: report.summary.uniqueAssets, decodedAssets: report.summary.decodedAssets, factoryErrors: report.summary.errors,
  trueUnassignedStandardPlaceholders: rows.filter(r => r.trueUnassignedStandardPlaceholder).length, requiredImagePages: rows.filter(r => r.required).length,
  intentionalTechnicalTextPages: rows.filter(r => r.photoPolicy === "intentional-technical-text").length,
  zeroResolvedRows: rows.filter(r => !r.resolvedCount).length, rowsWithFallback: rows.filter(r => r.fallbackUrls.length).length,
  conditionalDedup: rows.filter(r => r.conditionalDedup.length).length, existingQaSubjectGaps: observations.filter(o => o.type === "subject-gap").length,
  existingQaCropConcerns: observations.filter(o => /crop/.test(o.type)).length, changedSincePreviousMatrix: models.filter(m => m.changedSincePreviousMatrix).length,
  visualPagesInspectedThisAudit: 0, assetsVisuallyInspectedThisAudit: 0 };

// Assertions validate the audit's coverage and interpretation, without touching the app.
assert.equal(models.length, 68);
assert.equal(new Set(models.map(m => m.key)).size, 68);
assert.ok(models.every(m => m.rows.length >= 18));
assert.equal(summary.intentionalTechnicalTextPages, 4);
assert.equal(summary.conditionalDedup, 26);
assert.equal(summary.trueUnassignedStandardPlaceholders, 0);
assert.equal(summary.factoryErrors, 0);
assert.equal(summary.uniqueAssets, summary.decodedAssets);
assert.ok(observations.every(o => rows.some(r => r.model === o.model && r.page === o.page && r.concerns.length)));
assert.ok(rows.every(r => r.rawAssignedCount === r.rawUrls.length && r.resolvedCount === r.resolvedUrls.length));
assert.ok(rows.every(r => r.resolvedCount <= 2));
const sources = ["src/lib/moduli-vendita/modulePhotography.ts", "src/components/preventivi/pdf/DocumentoEdilePDF.tsx", "src/components/serramenti/SerramentoPDF.tsx", "supabase/functions/_shared/blocchiPreventivo.ts", "supabase/functions/_shared/fvHtmlTemplate.ts", "src/lib/serramenti/mockPdfData.ts"];
const result = { generatedAt: new Date().toISOString(), summary, method: "offline fresh factories + raw/resolved native image slots + read-only previous QA; no saved-copy access or PDF rendering", sourceHashes: Object.fromEntries(sources.map(f => [f, hash(f)])),
  previousQaRendererHash: qa.current_renderer_sha256, rendererMatchesPreviousQa: hash(sources[1]) === qa.current_renderer_sha256,
  limits: ["Logical page rows, not one row per physical PDF sheet", "0 new visual inspections", "Existing QA start-page images cannot prove embedding of a particular slot", "Fresh factory metadata does not reveal saved-copy state", "No automatic refresh or storage access", "Repeated photos and whitespace are not automatically defects"],
  previousVisualQa: qa.visual_review, legacyCandidates, legacyCoverCandidates: CLM_COVER_PHOTO_CORRECTIONS, models, assets: report.assets };

const esc = (s: unknown) => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
const shortUrl = (url: string) => url.replace(/^\/(module-art|pdf-stock|cover-stock)\//, "");
const md = ["# Audit approfondito immagini standard — 68 modelli", "", `Generato: ${result.generatedAt}`, "",
  "## Risposta operativa", "",
  `**${summary.trueUnassignedStandardPlaceholders} immagini standard necessarie prive di assegnazione nelle factory fresh, secondo la policy editoriale attuale.** Non è una misura di completezza rispetto a una nuova specifica più illustrata. La pertinenza di tutte le immagini NON è stata verificata: la QA esistente documenta **2 foto poco pertinenti** nello stesso modulo Tetti e **2 crop migliorabili**; altri soggetti/crop non visionati restano da valutare.`, "",
  `Copertura: ${summary.models} modelli, ${summary.logicalPageRows} righe di pagina logica; ${summary.requiredImagePages} pagine con foto standard necessaria; ${summary.decodedAssets}/${summary.uniqueAssets} asset decodificati. ${summary.changedSincePreviousMatrix} modelli diversi per hash rispetto alla matrice precedente. Nessuna modifica dell'app o dei salvataggi.`, "",
  "## Gap effettivi di soggetto/crop già osservati", "", "| Area/modello | Pagina logica (PDF QA precedente) | Stato | Cosa manca / intervento suggerito |", "|---|---|---|---|"];
for (const o of observations) md.push(`| ${o.model} | ${o.page} (p. ${o.priorPhysicalPage}) | ${esc(o.note)} | ${esc(o.action)} |`);
md.push("", "Le quattro righe provengono da `outputs/edile-unification-qa.md` e `work/editor-unification-qa/all-edile/visual-review.json`: non sono nuove osservazioni visive. Le due assegnazioni Tetti sono ancora quelle segnalate. Il problema Tetti è la pertinenza del soggetto, non soltanto composizione o crop.", "",
  "## Cosa non è un'immagine standard mancante", "",
  "- **4 Come funziona testuali:** Serramenti/finestre, avvolgibili, zanzariere, porte-ingresso. Intro e quattro voci specifiche sono presenti; `senzaFoto` esplicito. Sono scelte tecniche intenzionali nella policy attuale, ma candidati a nuove immagini se la nuova specifica richiederà più illustrazioni; non esclusi da tale valutazione.",
  "- **26 riempimenti duplicati:** elencati sotto, possono essere esclusi dal renderer. Sono aggiunte decorative subordinate allo spazio, non pagine con un riquadro fotografico obbligatorio lasciato vuoto.",
  "- Computo, investimento, garanzie, cronoprogramma, FAQ, firma e condizioni possono essere realmente testuali/tabellari. Spazio bianco con contenuto non equivale a foto mancante; le precedenti QA Pavimenti/Bagni lo dichiarano espressamente.",
  "- Foto progetto, prima/dopo, lavori, recensioni, team e consulente richiedono dati autentici; nessuno stock va inserito fingendo prova del cliente/azienda. Logo aziendale assente non è una foto editoriale mancante.",
  "- Le schede prodotto/macro/linea dipendono dal prodotto quotato: non basta una foto generica. Nei 7 moduli SR locali il mock usa famiglie/macro/linee vuote; il renderer imposta `showProductPhotos=false` se nessun prodotto ha foto. Quindi il commento «placeholder SVG» del percorso generale NON dimostra un placeholder presente nei 7 base locali. Se una fornitura mista ha alcune foto e altre mancanti, può comparire «Foto non fornita»: caso dati prodotto, non un gap della factory standard.",
  "- Le 12 texture Facciate erano solo proposte di libreria, non foto assegnate a pagine; sono state rimosse dai nuovi default. Nessuna pagina aspetta quelle texture. Le immagini ripetute fra dettagli/controlli/diario possono motivare maggiore varietà, ma non sono assegnazioni mancanti.", "",
  "## Vuoti, fallback e copie pregresse", "",
  `Le righe con zero foto risolte sono ${summary.zeroResolvedRows}; includono pagine nascoste, contenuti non fotografici e spazi per prove autentiche. ${summary.rowsWithFallback} righe risolvono almeno una foto dal fallback. Non sono ${summary.zeroResolvedRows} immagini da generare.`,
  "La selezione legge prima lo slot corrente, poi il default catturato; `senzaFoto:true` prevale. In assenza di foto valida può entrare il fallback di settore. I campi immagini già convertiti, se presenti ma null/vuoti, non recuperano una foto dal modello: una conversione fallita può quindi produrre assenza, anche se il file locale esiste. Nessun fallimento di conversione è dimostrato da questo audit.",
  "DocumentoEdilePDF deduplica riempimenti/chiusura rispetto a foto progetto, lavori, azienda e blocchi attivi; i riempimenti dipendono anche dall'altezza libera (minimo 120 pt). Lo stesso slot assegnato può non comparire. Serramenti deduplica i filler proposta/allegato/dettagli anche contro copertina/percorso/CTA; la CTA stessa non è rimossa solo perché ripete la cover. Non applicare indiscriminatamente le regole Edile a FV/SR.",
  "Le copie salvate possono conservare vecchi default: non sono state lette. Il helper rev2 è puro e su richiesta; con revisione già 2 normalmente non ripete il refresh, salvo recupero ID contestuale mancante con sostituzione mappata esatta. Pertanto «factory corretta» non significa «ogni copia precedente corretta». Il JSON elenca le vecchie assegnazioni dichiarate nelle mappe, non salvataggi realmente trovati. Non usare il refresh per annullare una rimozione volontaria.",
  "Rischi latenti specifici: Tetti/impermeabilizzazione eredita anche chiSiamo=squadra sul tetto e investimento=sottotetto: non sono foto mancanti; la pertinenza va rivalutata se questi filler vengono davvero mostrati in una variante. Nei 4 FV diversi da accumulo i fallback bollette/cassa/risparmio/produzione sono censiti, ma le corrispondenti pagine sono spente nei fresh: non attribuire loro un difetto nel base.", "",
  "## Duplicazioni condizionali (26, non bug accertati)", "", "| Modello | Slot |", "|---|---|");
for (const m of models) { const list = m.rows.flatMap(r => r.conditionalDedup); if (list.length) md.push(`| ${m.key} | ${list.join(", ")} |`); }
md.push("", "## Matrice per modello / pagina", "",
  "A/R = numero di URL distinti assegnati direttamente / risolti (0, 1 o 2). Non è il numero di immagini effettivamente stampate. B/F = foto del blocco / foto di riempimento; uno stesso URL può occupare entrambi gli slot ma viene contato una volta in R. Foto in libreria non assegnate non aumentano A/R. `off` indica pagina disattivata, `dati` contenuto dipendente da dati autentici/prodotto. Le pagine fisiche QA sono solo un riferimento storico; una foto sulla stessa pagina non dimostra quel preciso slot.",
  "I dettagli JSON includono URL completi, dimensioni/aspect ratio, provenienza fallback, flag senzaFoto, ragioni, policy e collegamento alla QA. Una cover orizzontale su A4 segnala una possibilità di crop, non un difetto; un blocco con foto singola verticale sotto rapporto 0,9 può attivare la tavola intera (contain), non un'immagine persa.", "");
md.push("`senzaFoto` indica almeno uno slot esplicitamente disabilitato, non necessariamente tutta la pagina: blocco e filler sono distinti. Il JSON registra anche i campi di testo presenti e i contenuti dipendenti da dati del preventivo. La policy «necessaria» copre cover, chiusura e i cinque blocchi editoriali, salvo i quattro tecnici testuali; non pretende una fotografia per ogni tipo di pagina.", "");
for (const m of models) {
  md.push(`### ${m.key} — ${m.name}`, "", "| Pagina | A/R | B/F | Foto necessaria? | Stato / note | Immagini risolte |", "|---|---:|---:|---|---|---|");
  for (const row of m.rows) {
    const notes = [!row.pageEnabled ? "off" : "", row.photoPolicy === "authentic-or-product-data-only" ? "dati" : "", row.photoExplicitlyDisabled ? "senzaFoto" : "", row.photoPolicy === "intentional-technical-text" ? "testuale intenzionale" : "", row.fallbackUrls.length ? "fallback" : "", row.conditionalDedup.length ? "dedup condizionale" : "", ...row.concerns.map(c => c.type), row.trueUnassignedStandardPlaceholder ? "GAP assegnazione" : "", row.existingBaseQa ? `QA p${row.existingBaseQa.page}` : ""].filter(Boolean);
    const assignmentStatus = row.resolvedCount ? (row.required ? "assegnata standard" : "assegnata opzionale/condizionale") : "";
    md.push(`| ${esc(row.page)} | ${row.rawAssignedCount}/${row.resolvedCount} | ${row.blockPhotoCount}/${row.fillerPhotoCount} | ${row.required ? "sì" : "no"} | ${[assignmentStatus, ...notes].filter(Boolean).join("; ") || "nessun obbligo fotografico nella policy attuale"} | ${row.resolvedUrls.map(shortUrl).join("; ") || "—"} |`);
  }
  if (m.repeatedBlockPhotos.length) md.push("", `Riutilizzi interni (non gap): ${m.repeatedBlockPhotos.map(x => `${shortUrl(x.url)} → ${x.roles.join(", ")}`).join("; ")}.`);
  md.push("");
}
md.push("## Evidenze, riproduzione e limiti", "",
  "- Script offline: `work/edilizia-in-cloud/work/standard-images-audit.ts`; da repository eseguire `bun work/standard-images-audit.ts`. Esegue factory pure e decoder locale dell'audit68; undici assert di copertura/coerenza. Nessun browser, chiamata di rete, salvataggio utente o render PDF.",
  "- Evidenze di codice: `DocumentoEdilePDF.tsx:1105` (fotoUsate/chiusura), `:1365` (filler condizionale), `:908` (tavola verticale); `blocchiPreventivo.ts:842` (precedenze slot/default/fallback); `SerramentoPDF.tsx:2142` e `:3398` (colonna foto/placeholder), `:2774` (dedup filler); `mockPdfData.ts:422` (nessuna famiglia/macro/linea demo nei moduli locali). I file completi sotto src/components/preventivi/pdf, src/components/serramenti, supabase/functions/_shared e src/lib/serramenti sono identificati negli hash JSON.",
  "- Collegamento al masterplan `Piano-standard-unico-moduli.md`: questa matrice supporta l'inventario della fase 2; zero assegnazioni necessarie mancanti non equivale a standard pubblicato né al collaudo estetico/adozione completo della fase 7.",
  `- QA esistente: 56 base Edile / 820 pagine renderizzate, 230 PDF complessivi automatici. Revisione visiva pregressa dichiarata: 9 base / 132 pagine, non tutti i 68. Renderer corrente identico a quello consolidato: ${result.rendererMatchesPreviousQa ? "sì" : "no; risultati precedenti da non considerare verifica dell'attuale renderer"}.`,
  "- **Ispezioni visive eseguite in questo audit: 0 pagine PDF, 0 asset.** Nessuna certificazione visiva integrale, nessun riuso dei conteggi precedenti come lavoro nuovo.",
  "- Le altre prove visive settoriali restano attribuite ai rispettivi handoff (Bagni, Pavimenti, IDR/CLM, Facciate); non si sommano perché renderer e campioni possono sovrapporsi. Le osservazioni aperte usano il consolidamento più recente.",
  "- La pertinenza non è deducibile da soli nomi e dimensioni; oltre ai 4 casi documentati qui, soggetti e crop non visionati restano non certificati. Il JSON include la QA storica e gli hash dei sorgenti per distinguere tempi/versioni.",
  "- Graphify consultato sul grafo esistente (nessun rebuild): ha orientato la lettura verso renderer, adapter e immaginiDocumento; nodi factory recenti non presenti. Query limitata a circa 650 token, nessuna nuova estrazione semantica; non è una prova di copertura fotografica.", "");
writeFileSync(path.join(outputs, "standard-images-audit.json"), JSON.stringify(result, null, 2) + "\n");
writeFileSync(path.join(outputs, "standard-images-audit.md"), md.join("\n"));
console.log(JSON.stringify({ ...summary, rendererMatchesPreviousQa: result.rendererMatchesPreviousQa, assertions: 11, outputs }, null, 2));
