import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Buffer } from "node:buffer";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { PDFDocument } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { FULL_FV_MODULES, createFullFvTemplate } from "@/lib/moduli-vendita/fullFvModules";
import { FULL_SERRAMENTI_MODULES, createFullSerramentiTemplate } from "@/lib/moduli-vendita/fullSerramentiModules";
import { buildFvPreviewBase } from "@/lib/moduli-vendita/fvPreviewData";
import { renderFvPdfHtml } from "../../../supabase/functions/_shared/fvHtmlTemplate";
import { applyFvNativeTurn, applySrNativeTurn, type FvNativeCatalogue } from "@/lib/preventivi/verticalWizardDraft";
import { fvConfigurationPayload } from "@/lib/fotovoltaico/configurazioneAtomica";
import { fvConversationPreview } from "@/lib/fotovoltaico/conversationPreview";
import { srConversationPayload } from "@/lib/serramenti/conversationSave";
import { INITIAL } from "@/pages/azienda/fotovoltaico/FotovoltaicoWizard/constants";
import { buildMockPdfData } from "@/lib/serramenti/mockPdfData";
import { SerramentoPDF } from "@/components/serramenti/SerramentoPDF";
import { importiDelPreventivo } from "@/lib/serramenti/righePreventivo";
import { chiaveDisegno, disegniDelPreventivo } from "@/lib/serramenti/disegniPerPdf";
import { nuovaAnalisiIntervento, SCENARI_ESISTENTI } from "@/lib/serramenti/analisiIntervento";
import { calcolaRisparmio } from "@/lib/serramenti/risparmio";
import { DbMinimo } from "../helpers/edgeFinto";
import type { NativeOperation } from "../../../supabase/functions/_shared/quoteNative";
import type { SrProgettoDetail } from "@/types/serramenti";

vi.setConfig({ testTimeout: 120_000 });
// pdfkit's Node streams receive Node Buffers: jsdom's separate Uint8Array realm
// otherwise makes its instanceof check treat JPEG bytes as UTF-8 text.
beforeAll(() => {
  vi.stubGlobal("Uint8Array", Object.getPrototypeOf(Buffer.prototype).constructor);
  if (process.env.PREVENTIVI_PDF_RENDER_URL) vi.stubGlobal("Deno", { env: { get: (key: string) => process.env[key] } });
});
afterAll(() => vi.unstubAllGlobals());
vi.mock("https://esm.sh/pdf-lib@1.17.1", async () => await import("pdf-lib"));
vi.mock("@/lib/storage/immaginiModelloPdf", () => ({ CAMPI_IMMAGINE_SERRAMENTI: [], firmaImmagine: async (v: unknown) => v, firmaImmaginiModello: async (v: unknown) => v }));
vi.mock("@/lib/pdf/votiOnline", () => ({ votiOnlineAzienda: async (): Promise<unknown> => null }));
vi.mock("@/lib/serramenti/rasterizzaDisegno", () => ({ rasterizzaDisegno: async (element: import("react").ReactElement) => {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { default: sharp } = await import("sharp");
  const svg = renderToStaticMarkup(element).replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  const { data, info } = await sharp(Buffer.from(svg)).resize({ width: 800 }).png().toBuffer({ resolveWithObject: true });
  return { src: `data:image/png;base64,${data.toString("base64")}`, larghezza: info.width, altezza: info.height };
} }));
vi.mock("@/lib/serramenti/pdfImageUtils", () => ({ toDataUrl: async (url: string | null) => {
  if (!url || url.startsWith("data:")) return url;
  const local = url.startsWith(window.location.origin) ? new URL(url).pathname : url;
  if (!local.startsWith("/")) throw new Error(`Immagine esterna non ammessa: ${url}`);
  const b = await readFile(path.resolve("public", local.slice(1)));
  // Like the browser canvas conversion, decode WebP/AVIF rather than labelling raw bytes JPEG.
  const { default: sharp } = await import("sharp");
  const image = sharp(b).resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true });
  const png = /\.png$/i.test(local) || (await image.metadata()).hasAlpha;
  const converted = await (png ? image.png() : image.jpeg({ quality: 85 })).toBuffer();
  return `data:image/${png ? "png" : "jpeg"};base64,${converted.toString("base64")}`;
} }));

const frozenPath = "../../../supabase/functions/_shared/documentoCongelato";
const signedPath = "../../../supabase/functions/_shared/pdfFirmato";
const { congelaDocumento } = await import(/* @vite-ignore */ frozenPath);
const { assicuraPdfFirmato } = await import(/* @vite-ignore */ signedPath);
const output = process.env.EIC_QA_PDF_DIR;
const op = (id: string, kind: string, values: Record<string, string | number | boolean>): NativeOperation => ({
  id, kind, action: "upsert", axes: [], fields: Object.entries(values).map(([key, value]) => ({ key, value })),
});
async function artefatto(name: string, bytes: Uint8Array | string) {
  if (!output) return;
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, name), bytes);
}
async function testo(bytes: Uint8Array) {
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
  const pdf = await task.promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const p = await pdf.getPage(i);
    pages.push((await p.getTextContent()).items.filter(x => "str" in x).map(x => (x as { str: string }).str).join(" "));
  }
  await task.destroy();
  return pages;
}

/** Real freeze/hash/stamp/save code; only database, storage and inference are local fixtures. */
async function firmaLocale(bytes: Uint8Array, type: "fv" | "quote", id: string) {
  const db = new DbMinimo();
  const files = new Map<string, Uint8Array>();
  const source = `qa/${id}/originale.${type === "fv" ? "html" : "pdf"}`;
  files.set(`${type === "fv" ? "fv-progetti" : "quote-pdfs"}/${source}`, bytes);
  db.tabelle.fv_progetti = [{ id, numero: id, pdf_vendita_url: source }];
  db.tabelle.quotes = [{ id, quote_number: id, pdf_storage_path: source }];
  db.tabelle.companies = [{ id: "qa", name: "Impresa QA" }];
  const sb = Object.assign(db, { storage: { from: (bucket: string) => ({
    download: async (file: string) => {
      const b = files.get(`${bucket}/${file}`);
      return { data: b ? { arrayBuffer: async () => new Uint8Array(b).buffer } : null, error: b ? null : { message: "File assente" } };
    },
    upload: async (file: string, b: Uint8Array) => { files.set(`${bucket}/${file}`, new Uint8Array(b)); return { error: null as null }; },
  }) } });
  const snapshot = await congelaDocumento(sb, { tipo: type, documentoId: id, companyId: "qa", aziendaNome: "Impresa QA", firmatario: "Cliente QA" }, id);
  const frozen = files.get(`quote-pdfs/${snapshot.path}`)!;
  if (type === "quote") expect(Array.from(frozen)).toEqual(Array.from(bytes));
  else {
    expect(snapshot.path).toMatch(/\.pdf$/);
    const expectedPages = new DOMParser().parseFromString(new TextDecoder().decode(bytes), "text/html").querySelectorAll(".page").length;
    expect((await PDFDocument.load(frozen)).getPageCount()).toBe(expectedPages);
    await artefatto(`${id}.pdf`, frozen);
  }
  db.tabelle.signature_requests = [{
    id, company_id: "qa", status: "signed", signed_at: "2026-10-26T10:00:00Z", tipo_documento: type,
    quote_id: type === "quote" ? id : null, fv_progetto_id: type === "fv" ? id : null,
    signer_name: "Cliente QA", signer_email: "qa@example.test", documento_hash: snapshot.hash, documento_path: snapshot.path,
  }];
  const result = await assicuraPdfFirmato(sb, id);
  const signed = files.get(`quote-pdfs/${result.path}`)!;
  expect(new TextDecoder().decode(signed.subarray(0, 4))).toBe("%PDF");
  expect((await assicuraPdfFirmato(sb, id)).creato).toBe(false);
  const before = await testo(frozen);
  const after = await testo(signed);
  expect(after.length).toBe(before.length + 1);
  before.forEach((page, i) => expect(after[i]).toContain(page));
  return signed;
}

describe("Flusso locale, risposte AI sintetiche e renderer originali", () => {
  it.each(FULL_SERRAMENTI_MODULES)("Serramenti %s: proposta confermata, riapertura, copia, PDF e file firmato", async moduleId => {
    const template = createFullSerramentiTemplate({ company_id: "qa", ragione_sociale: "Impresa QA" }, moduleId);
    const enriched = await buildMockPdfData({ moduleId, template, companyName: "Impresa QA" });
    const base: SrProgettoDetail = { ...enriched.detail, serramenti: [], accessori: [], servizi: [] };
    const proposed = await applySrNativeTurn(base, { module: "serramenti", operations: [
      op("window", "serramento", { title: "Finestra QA soggiorno", catalogueId: "window", quantity: 2, width: 1200, height: 1400, room: "Soggiorno QA" }),
      op("labour", "servizio", { title: "Posa QA controllata", quantity: 4, unit: "h" }),
    ] }, [{ id: "window", kind: "famiglia", label: "Finestra QA", specs: "" }],
    async operation => ({ price: operation.kind === "servizio" ? 45 : 500, cost: 20, unit: operation.kind === "servizio" ? "h" : "pz" }));
    const payload = srConversationPayload(base, proposed);
    expect(payload.p_next.serramenti).toHaveLength(1);
    const reopened = JSON.parse(JSON.stringify(proposed));
    expect(reopened.servizi).toEqual(proposed.servizi);
    for (const copy of [false, true]) {
      const id = `sr-${moduleId}${copy ? "-copia" : ""}`;
      const detail = structuredClone(reopened);
      detail.progetto.code = id;
      detail.progetto.cliente_nome = copy ? "CopiaQA" : "ClienteQA";
      const amounts = importiDelPreventivo(detail, detail.progetto);
      expect(amounts.totale).toBeGreaterThan(0);
      detail.progetto.totale_min = detail.progetto.totale_max = amounts.totale;
      const bytes = new Uint8Array(await renderToBuffer(SerramentoPDF({ ...enriched, detail }) as Parameters<typeof renderToBuffer>[0]));
      const before = await testo(bytes);
      expect(before.join(" ")).toContain(detail.progetto.cliente_nome);
      expect(before.join(" ")).toContain("Soggiorno QA");
      const signed = await firmaLocale(bytes, "quote", id);
      const after = await testo(signed);
      expect(after.length).toBe(before.length + 1);
      // Every original page remains present, in order, after signing and storage round-trip.
      before.forEach((page, i) => expect(after[i]).toContain(page));
      await artefatto(`${id}.pdf`, bytes);
      await artefatto(`${id}-firmato.pdf`, signed);
    }
  });

  it.each([false, true])("Editoriale prodotto, finiture e piano, con abaco configuratore e firma (copia: %s)", async copia => {
    const template = createFullSerramentiTemplate({ company_id: "qa", ragione_sociale: "Impresa QA" }, "finestre");
    template.percorso_cliente!.fasi[0] = { ...template.percorso_cliente!.fasi[0],
      attivita_azienda: "Verifica misure sul posto QA", conferma_cliente: "Conferma finiture QA",
      tempistiche: "Data concordata dopo il rilievo QA" };
    const data = await buildMockPdfData({ moduleId: "finestre", template, companyName: "Impresa QA" });
    const first = data.detail.serramenti[0];
    Object.assign(first, { family_id: "famiglia-qa", ambiente: "Soggiorno", colore_interno: "RAL 9010",
      colore_esterno: "RAL 7016", larghezza_mm: 1200, altezza_mm: 1400,
      disegno_config: { v: 1, tipologia: "finestra_2_ante", apertura: "dx" },
      valori_assi: { maniglia: "nera" }, scelte_assi: {} });
    data.detail.serramenti = [first, { ...structuredClone(first), id: "seconda", ambiente: "Camera" }];
    data.axisLabelByKey = { "famiglia-qa|maniglia|nera": { axisLabel: "Maniglia", valueLabel: "Nero opaco QA" } };
    const { toDataUrl } = await import("@/lib/serramenti/pdfImageUtils");
    const profile = await toDataUrl("/render-references/profiles/Profilo-PVC-5-Camere-Sezione-Bianco.webp");
    const frontale = await toDataUrl("/render-references/profiles/Profilo-PVC-2ante-Maniglia-Centrale-Bianco.jpeg");
    data.lineeDedicate = [{ id: "sistema-qa", nome: "Sistema QA dimostrativo", prodotti: "Soggiorno e Camera",
      tipologia: "Finestre", immagine_url: frontale, descrizione: "Profilo dimostrativo: configurazione e prestazioni da verificare sul listino reale.",
      immagini: [
        { id: "frontale", url: frontale!, ruolo: "principale", didascalia: "Vista frontale catalogo QA" },
        { id: "sezione", url: profile!, ruolo: "sezione", didascalia: "Sezione originale catalogo QA" },
        { id: "riservata", url: profile!, ruolo: "esclusa", didascalia: "IMMAGINE ESCLUSA NON STAMPARE" },
      ],
      dati: [{ etichetta: "Profilo QA", valore: "PVC" }, { etichetta: "Spessore QA", valore: "76 mm" },
        { etichetta: "Vetro QA", valore: "Configurazione selezionata" }, { etichetta: "Quarto dato QA", valore: "Conservato integralmente" }],
      scheda_tecnica_url: "https://example.test/scheda-qa.pdf", scheda_tecnica_nome: "Scheda QA" }];
    data.disegni = await disegniDelPreventivo(data.detail.serramenti, {}, {});
    const key = chiaveDisegno(first.family_id, first.larghezza_mm, first.altezza_mm, first.valori_assi, first.disegno_config,
      first.scelte_assi, { interno: first.colore_interno, esterno: first.colore_esterno });
    expect(data.disegni[key].viste.map(v => v.vista)).toEqual(["interna", "esterna"]);
    const id = `sr-editoriale${copia ? "-copia" : ""}`;
    data.detail.progetto.code = id;
    const bytes = new Uint8Array(await renderToBuffer(SerramentoPDF(data) as Parameters<typeof renderToBuffer>[0]));
    const pages = await testo(bytes);
    const text = pages.join(" ");
    expect(text).toContain("Vista frontale catalogo QA");
    expect(text).toContain("Sezione originale catalogo QA");
    expect(text).not.toContain("IMMAGINE ESCLUSA NON STAMPARE");
    for (const content of ["Immagine del produttore", "IL TUO FASCICOLO", "Sistema QA dimostrativo", "Conservato integralmente", "RAL 9010", "RAL 7016", "Nero opaco QA",
      "Da dentro", "Da fuori", "Soggiorno", "Camera", "Verifica misure sul posto QA", "Conferma finiture QA", "Data concordata dopo il rilievo QA"])
      expect(text).toContain(content);
    const pianoPagina = pages.find(page => page.includes("Verifica misure sul posto QA"))!;
    await artefatto(`${id}.pdf`, bytes);
    expect(pianoPagina).toContain("Documenti e cura");
    expect(pianoPagina).toContain("Immagini generate a scopo illustrativo");
    expect(text.match(/Colori, finiture e dettagli/gi)).toHaveLength(1);
    expect(text).toContain("Posizioni abaco: 1, 2");
    expect(pages.slice(1).every(page => page.length > 200), "Nessun foglio con un dettaglio rimasto da solo").toBe(true);
    await artefatto(`${id}.pdf`, bytes);
    await artefatto(`${id}-firmato.pdf`, await firmaLocale(bytes, "quote", id));
    data.lineeDedicate = [];
    data.familiesById = { "famiglia-qa": { id: "famiglia-qa", nome: "Famiglia scelta QA", descrizione: "Descrizione autentica QA. ".repeat(12),
      immagine_url: null, custom_field_values: {}, macrocategoria_id: null },
      "estranea": { id: "estranea", nome: "NON STAMPARE PRODOTTO ESTRANEO", descrizione: "Non selezionato",
        immagine_url: profile, custom_field_values: {}, macrocategoria_id: null } };
    const fallback = await testo(new Uint8Array(await renderToBuffer(SerramentoPDF(data) as Parameters<typeof renderToBuffer>[0])));
    expect(fallback.join(" ")).toContain("Famiglia scelta QA");
    expect(fallback.filter(page => page.replace(/\s+/g, "").includes("ILSISTEMASCELTO"))).toHaveLength(1);
    expect(fallback.join(" ")).not.toContain("NON STAMPARE PRODOTTO ESTRANEO");
    data.familiesById["famiglia-qa"].descrizione = "Breve descrizione gia presente nell'abaco";
    const compatto = await testo(new Uint8Array(await renderToBuffer(SerramentoPDF(data) as Parameters<typeof renderToBuffer>[0])));
    expect(compatto.join(" ")).toContain("Famiglia scelta QA");
    expect(compatto.join("").replace(/\s+/g, "")).not.toContain("ILSISTEMASCELTO");
  });

  it("non descrive infissi esistenti quando l'intervento e' una nuova costruzione", async () => {
    const template = createFullSerramentiTemplate({ company_id: "qa", ragione_sociale: "Impresa QA" }, "finestre");
    const data = await buildMockPdfData({ moduleId: "finestre", template, companyName: "Impresa QA" });
    data.detail.progetto.tipo_intervento = "nuova_costruzione";
    data.detail.progetto.analisi_intervento = { ...nuovaAnalisiIntervento(), esistente: "alluminio_freddo" };
    const text = (await testo(new Uint8Array(await renderToBuffer(SerramentoPDF(data) as Parameters<typeof renderToBuffer>[0])))).join(" ");
    expect(text).not.toContain("LA TUA SCELTA"); expect(text).not.toContain("La posa prevista nella tua offerta");
  });

  it.each(["alluminio_freddo", "legno", "pvc"] as const)("Prima/dopo %s: originale, copia, posa e firma locale completa", async scenario => {
    const template = createFullSerramentiTemplate({ company_id: "qa", ragione_sociale: "Impresa QA" }, "finestre");
    const data = await buildMockPdfData({ moduleId: "finestre", template, companyName: "Impresa QA" });
    const a = nuovaAnalisiIntervento(); Object.assign(a, { esistente: scenario, vetro: "doppio", uwPrima: 4, fontePrima: "Valutazione tecnica QA", uwDopo: 1.2, fonteDopo: "Scheda fornitore QA", motivo: "Scelta per il comfort della famiglia QA", problemi: ["freddo", "rumore"], noteRilievo: "Guarnizioni da verificare sul vano QA" });
    a.posa.rimozione = "inclusa"; a.posa.ripristini = "esclusa";
    a.risparmio = { uwAttuale: 4, uwNuovo: 1.2, bolletta: 1200, m2Casa: 100, zona: "E", superficie: data.detail.serramenti.reduce((sum, s) => sum + s.larghezza_mm * s.altezza_mm * s.quantita / 1000000, 0), fonteBolletta: "cliente" };
    data.detail.progetto.analisi_intervento = a;
    data.detail.progetto.risparmio_eur_anno = Math.round(calcolaRisparmio({ zona_climatica: a.risparmio.zona, m2_serramenti: a.risparmio.superficie, uw_attuale: a.risparmio.uwAttuale!, uw_nuovo: a.risparmio.uwNuovo!, bolletta_attuale_anno: a.risparmio.bolletta }).risparmio_eur_anno * 100) / 100;
    data.detail.serramenti.forEach(s => { s.materiale = "pvc"; });
    const { toDataUrl } = await import("@/lib/serramenti/pdfImageUtils");
    const foto = await toDataUrl(SCENARI_ESISTENTI[scenario].immagine);
    const fotoProdotto = await toDataUrl("/render-references/profiles/Profilo-PVC-2ante-Maniglia-Centrale-Bianco.jpeg");
    data.lineeDedicate = [{ id: "linea-qa", nome: "PVC selezionato QA", prodotti: "Finestre previste", tipologia: "Finestre", descrizione: "Configurazione dimostrativa QA", immagine_url: fotoProdotto, dati: [{ etichetta: "Uw", valore: "1.2 W/m²K" }], scheda_tecnica_url: null, scheda_tecnica_nome: null }];
    for (const copia of [false, true]) {
      const id = `sr-confronto-${scenario}${copia ? "-copia" : ""}`;
      const progetto = JSON.parse(JSON.stringify(data.detail.progetto)); progetto.code = id;
      const bytes = new Uint8Array(await renderToBuffer(SerramentoPDF({ ...data, fotoConfrontoStandard: foto, detail: { ...data.detail, progetto } }) as Parameters<typeof renderToBuffer>[0]));
      const prima = await testo(bytes); const text = prima.join(" ");
      for (const content of ["LA TUA SCELTA", "Uw inferiore del 70%", "Scelta per il comfort della famiglia QA", "La posa prevista nella tua offerta", "Esclusa", "Da definire", "Da dove arriva la stima", "Valutazione tecnica QA", "Scheda fornitore QA", "non percentuale di risparmio sulla bolletta"])
        expect(text).toContain(content);
      expect(text).not.toContain("+46%");
      expect(prima.find(p => p.includes("LA TUA SCELTA"))).toContain("Uw inferiore del 70%");
      expect(prima.find(p => p.includes("LA TUA SCELTA"))).toContain("Nessuna eliminazione automatica");
      expect(prima.find(p => p.includes("La posa prevista nella tua offerta"))).toContain("organizzare gli spazi");
      expect(text.match(/Totale preventivo/gi)).toHaveLength(1);
      const signed = await firmaLocale(bytes, "quote", id); const dopo = await testo(signed);
      prima.forEach((page, i) => expect(dopo[i]).toContain(page));
      await artefatto(`${id}.pdf`, bytes); await artefatto(`${id}-firmato.pdf`, signed);
    }
  });

  it.each(["finanziato", "contanti", "senza-pareggio", "piano-da-definire", "pareggio-primo-anno"] as const)("Economia serramenti: %s, rata e recupero senza duplicare il totale", async scenario => {
    const template = createFullSerramentiTemplate({ company_id: "qa", ragione_sociale: "Impresa QA" }, "finestre");
    template.pdf_mostra_rata_mensile = true;
    const data = await buildMockPdfData({ moduleId: "finestre", template, companyName: "Impresa QA" });
    const finanziato = importiDelPreventivo(data.detail, data.detail.progetto).totale;
    const rata = Math.round(finanziato / 60 * 100) / 100;
    const rataTesto = rata.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    Object.assign(data.detail.progetto, {
      schema_pagamento: scenario === "contanti" ? "tre_step" : "tutto_finanziato",
      pagamento_milestones: [{ label: scenario === "contanti" ? "Saldo" : "Finanziamento", percentuale: 100, when: "Alla conferma" }],
      fin_piani: scenario === "piano-da-definire" ? [] : [{ nome: "Piano QA", mesi: 60, tasso: 0, rata_mese: rata, finanziato, anticipo: 0 }],
      detrazione_aliquota: scenario === "senza-pareggio" ? 0 : 50,
      risparmio_eur_anno: scenario === "senza-pareggio" ? 1 : scenario === "pareggio-primo-anno" ? 1800 : 180,
    });
    const bytes = new Uint8Array(await renderToBuffer(SerramentoPDF(data) as Parameters<typeof renderToBuffer>[0]));
    const pages = await testo(bytes);
    const text = pages.join(" ");
    await artefatto(`sr-economia-${scenario}.pdf`, bytes);
    expect(text.match(/Totale preventivo/gi)).toHaveLength(1);
    expect(text).toContain("RECUPERO DELL'INVESTIMENTO");
    expect(text).not.toContain("Gratis o positivo");
    expect(text).not.toContain("reali di esborso");
    if (scenario === "contanti" || scenario === "piano-da-definire") {
      expect(text).not.toContain(rataTesto);
      expect(text).not.toContain("SIMULAZIONE FINANZIAMENTO");
      if (scenario === "piano-da-definire") expect(text).toContain("rata e durata da definire");
    } else {
      expect(text).toContain(rataTesto);
      expect(text).toContain("60 mesi");
      expect(text).toContain("La rata va pagata per intero");
    }
    if (scenario === "senza-pareggio") {
      expect(text).toContain("Il pareggio non viene raggiunto");
      expect(text).not.toContain("Pareggio ~ anno");
    } else {
      expect(text).not.toContain("Il pareggio non viene raggiunto");
      if (scenario === "pareggio-primo-anno") expect(text).toContain("Pareggio entro A1");
    }
  });

  it.runIf(Boolean(process.env.PREVENTIVI_PDF_RENDER_URL)).each(FULL_FV_MODULES)("FV %s: HTML originale, conversione nativa, copia e PDF firmato completo", async moduleId => {
    const catalogue: FvNativeCatalogue = {
      pannelli: [{ id: "panel", descrizione: "Modulo QA 500W", potenza_w: 500, prezzo_vendita: 150 }],
      inverter: [{ id: "inv", descrizione: "Inverter QA 6kW", prezzo_vendita: 900 }],
      accumuli: [{ id: "battery", descrizione: "Batteria QA 10kWh", capacita_kwh: 10, prezzo_vendita: 3000 }],
      products: [], kits: [], labour: [], services: [],
    };
    const draft = applyFvNativeTurn({ ...structuredClone(INITIAL), pannello_id: "panel", inverter_id: "inv", numero_pannelli_scelti: 12, potenza_kwp: 6, iva_aliquota: 0.1, cliente_nome: "ClienteQA" },
      { module: "fotovoltaico", operations: [op("configurazione", "configurazione", { panelCount: 12, withBattery: true, batteryId: "battery" })] }, catalogue);
    const payload = fvConfigurationPayload(draft, catalogue, { companyId: "qa", projectId: "qa-project", updatedAt: "2026-10-26T10:00:00Z" });
    const reopened = JSON.parse(JSON.stringify(draft));
    const template = createFullFvTemplate({} as never, "qa", moduleId);
    expect(fvConversationPreview(reopened, catalogue, template, "Impresa QA", []).total).toBe(fvConversationPreview(draft, catalogue, template, "Impresa QA", []).total);
    for (const copy of [false, true]) {
      const id = `fv-${moduleId}${copy ? "-copia" : ""}`;
      const input = buildFvPreviewBase(template);
      input.template = template;
      input.cliente.nome = copy ? "CopiaQA" : "ClienteQA";
      input.progetto.numero = id;
      input.componenti = payload.p_components.map(c => ({ ...c, potenza_w: c.potenza_unitaria_w }));
      const html = renderFvPdfHtml(input);
      expect(html).toContain(input.cliente.nome);
      expect(html).toContain(id);
      const signed = await firmaLocale(new TextEncoder().encode(html), "fv", id);
      expect((await PDFDocument.load(signed)).getPageCount()).toBeGreaterThan(2);
      await artefatto(`${id}.html`, html);
      await artefatto(`${id}-firmato.pdf`, signed);
    }
  });
});
