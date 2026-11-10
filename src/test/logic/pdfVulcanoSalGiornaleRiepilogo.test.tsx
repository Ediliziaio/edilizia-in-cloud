/// <reference types="node" />
/**
 * Difetti dei PDF trovati nella simulazione su Impresa Vulcano (10/11/2026): SAL, giornale dei lavori, riepilogo
 * commessa. Con `PROVE_PDF_DIR` impostata scrive anche gli HTML e i PDF di prova in quella cartella.
 */
import { describe, expect, it } from "vitest";
import { isValidElement, type ReactNode } from "react";
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildSalHtml, type SalRecord } from "../../../supabase/functions/generate-sal-pdf/render";
import { buildGiornaleHtml, type GiornataDocumento } from "../../../supabase/functions/_shared/documentoGiornale";
import { ruoloFirmatario, leggiGiornateDocumento } from "../../../supabase/functions/_shared/datiDocumentoGiornale";
import { vesteHtml } from "../../../supabase/functions/_shared/vesteHtml";
import { senzaEmoji } from "../../../supabase/functions/_shared/senzaEmoji";
import { createOrdinePDFDocument } from "@/components/orders/OrdinePDF";
import { PieSocietario } from "@/components/preventivi/pdf/FoglioCondizioniPDF";
import type { DatiRiepilogo } from "@/lib/orders/riepilogoCommessaDati";

const VULCANO = "7c87c209-7868-42d0-ad98-6c95ac6de196";
const ALTRA = "00000000-0000-0000-0000-000000000001";
const DIR = process.env.PROVE_PDF_DIR;
const logoUrl = DIR ? `data:image/png;base64,${readFileSync(join(process.cwd(), "public/loghi/impresa-vulcano.png")).toString("base64")}` : "https://x.test/logo.png";
// Nel PDF di react-pdf sotto jsdom un data: URL esce rovinato: per la prova il logo si passa come file (PROVE_PDF_LOGO).
const logoPdf = process.env.PROVE_PDF_LOGO || logoUrl;

const sal = (companyId: string): SalRecord => ({
  id: "s", numero_sal: 2, data_emissione: "2026-11-10", stato: "emesso", importo_totale: 23500, note: null, order_id: "o", company_id: companyId,
  sal_voci: [
    { id: "a", descrizione: "Impermeabilizzazione copertura con guaina bituminosa", importo_contrattuale: 18000, percentuale_avanzamento: 75, importo_sal: 13500, note: null },
    { id: "b", descrizione: "Rifacimento intonaci e tinteggiature", importo_contrattuale: 12000, percentuale_avanzamento: 50, importo_sal: 6000, note: null },
    { id: "c", descrizione: "Demolizioni", importo_contrattuale: 8000, percentuale_avanzamento: 50, importo_sal: 4000, note: null },
  ],
});
const azienda = { ragione_sociale: "Impresa Vulcano s.r.l.", partita_iva: "06923340969", colore_primario: "#1C1650", logo_url: logoUrl, indirizzo: "Via Marconi 35", citta: "Lonate Pozzolo", cap: "21015" };
const order = { description: "Ristrutturazione condominio Via Roma", order_code: "VUL-2026-14", total_amount: 38000, indirizzo_lavori: "Via Roma 12, Vanzaghello", customer: { first_name: "Condominio", last_name: "Roma 12", address: "Via Roma 12" } };
const extra = { vociPrecedenti: { "impermeabilizzazione copertura con guaina bituminosa": 9000, "rifacimento intonaci e tinteggiature": 3000, "demolizioni": 4000 }, aliquotaIva: 10 };

describe("SAL: veste di Vulcano e colonna Voce", () => {
  it("Vulcano: logo grande, piè proprio su ogni foglio e numero di pagina nel margine", () => {
    const html = buildSalHtml(sal(VULCANO), order, azienda, null, "Edilizia in Cloud", 16000, null, extra);
    expect(html).toContain('class="piede-proprio"');
    expect(html).toContain("Sede Legale: Via Marconi, 35");
    expect(html).toContain("text-decoration:underline;\">info@impresavulcano.it");
    expect(html).toContain("height:55pt;width:auto;max-width:340pt");
    expect(html).toContain("@bottom-center");
    expect(html).toContain("EB Garamond");
    expect(html).toContain('class="piede-spazio"');
    if (DIR) writeFileSync(join(DIR, "sal-vulcano.html"), html);
  });

  it("le altre aziende: nessuna veste, logo di sempre", () => {
    const html = buildSalHtml(sal(ALTRA), order, azienda, null, "Edilizia in Cloud", 16000, null, extra);
    expect(html).not.toContain("piede-proprio");
    expect(html).not.toContain("EB Garamond");
    expect(html).toContain("max-height:60px;max-width:180px");
    expect(vesteHtml(ALTRA, 182)).toMatchObject({ attiva: false, css: "", apri: "", chiudi: "", stileLogo: null });
  });

  it("la voce non si spezza dentro le parole e ha spazio: le altre colonne sono strette", () => {
    const html = buildSalHtml(sal(ALTRA), order, azienda, null, undefined, 16000, null, extra);
    expect(html).not.toMatch(/td\s*\{[^}]*overflow-wrap:\s*anywhere/);
    expect(html).not.toMatch(/word-break:\s*break-all/);
    expect(html).toContain("td.voce { min-width: 140px; }");
    expect(html).toContain('class="voce"');
    // Le colonne di numeri, con tutte e otto, lasciano alla voce più della metà della larghezza utile (≈688 px).
    const larghezze = [...html.matchAll(/<th style="[^"]*width:(\d+)px;/g)].map((m) => Number(m[1]));
    expect(larghezze).toHaveLength(7);
    expect(688 - larghezze.reduce((s, w) => s + w, 0)).toBeGreaterThan(200);
  });
});

const giornata = (o: Partial<GiornataDocumento> = {}): GiornataDocumento => ({
  id: "g1", data_lavori: "2026-11-09", stato: "firmata", condizioni_meteo: "soleggiato", temperatura: "14°C",
  lavorazioni_eseguite: "Posa guaina 🚧 sul lato nord 👷‍♂️\nControllo ✅ dei giunti", materiali_utilizzati: "Guaina 4 mm ☀️", personale_presente: 4,
  note: "Tutto ok 👍🏽", avanzamento_percentuale: 60, firmato_da: "Marco Bianchi", firmato_il: "2026-11-09", pm_signed_at: "2026-11-09T16:00:00Z",
  pm_signature_hash: "abc123def4567890", firmatario: "Marco Bianchi", firmato_da_ruolo: "Direttore tecnico", ...o,
});

describe("Giornale dei lavori", () => {
  it("niente emoji, né quelle del modello né quelle scritte nel testo", () => {
    const html = buildGiornaleHtml([giornata()], { description: "Ristrutturazione", order_code: "VUL-14" }, azienda, "EiC", VULCANO);
    expect(html).not.toMatch(/\p{Extended_Pictographic}️|\p{Emoji_Presentation}|[\u{1F000}-\u{1FAFF}]/u);
    for (const t of ["Soleggiato", "Temperatura: 14°C", "4 operai", "Posa guaina sul lato nord", "Controllo dei giunti", "Tutto ok", "Ultimo avanzamento"]) expect(html).toContain(t);
    if (DIR) writeFileSync(join(DIR, "giornale-vulcano.html"), html);
  });

  it("la firma porta il ruolo di chi firma; senza ruolo «Firma», mai più «Capocantiere» d'ufficio", () => {
    expect(buildGiornaleHtml([giornata()], null, azienda)).toContain("Direttore tecnico: <strong>Marco Bianchi</strong>");
    const senza = buildGiornaleHtml([giornata({ firmato_da_ruolo: null })], null, azienda);
    expect(senza).toContain("Firma: <strong>Marco Bianchi</strong>");
    expect(senza).not.toContain("Capocantiere");
  });

  it("veste di Vulcano; le altre aziende senza", () => {
    const v = buildGiornaleHtml([giornata()], null, azienda, "EiC", VULCANO);
    expect(v).toContain('class="piede-proprio"');
    expect(v).toContain("height:55pt");
    const a = buildGiornaleHtml([giornata()], null, azienda, "EiC", ALTRA);
    expect(a).not.toContain("piede-proprio");
    expect(a).toContain("Pagina \" counter(page)");
  });

  it("ruoloFirmatario: per utente, per nome in qualunque ordine, mai indovinato", () => {
    const dip = [
      { user_id: "u1", first_name: "Marco", last_name: "Bianchi", qualifica: "Capocantiere", role_type: "operaio" },
      { user_id: null, first_name: "Lùca", last_name: "Verdi", qualifica: null, role_type: "Capoposa" },
      { user_id: null, first_name: "Anna", last_name: "Neri", qualifica: null, role_type: "operaio" },
      { user_id: null, first_name: "Ugo", last_name: "Rossi", qualifica: "Geometra", role_type: "operaio" },
      { user_id: null, first_name: "Ugo", last_name: "Rossi", qualifica: "Muratore", role_type: "operaio" },
    ];
    expect(ruoloFirmatario(dip, { userId: "u1" })).toBe("Capocantiere");
    expect(ruoloFirmatario(dip, { nome: "verdi  luca" })).toBe("Capoposa");
    expect(ruoloFirmatario(dip, { nome: "Anna Neri" })).toBeNull(); // «operaio» è una categoria, non un ruolo
    expect(ruoloFirmatario(dip, { nome: "Ugo Rossi" })).toBeNull(); // due schede, due ruoli
    expect(ruoloFirmatario(dip, { nome: "Sconosciuto" })).toBeNull();
    expect(ruoloFirmatario([], { nome: "" })).toBeNull();
  });

  it("leggiGiornateDocumento: la firma automatica (id utente in firmato_da) diventa nome e ruolo", async () => {
    const tabelle: Record<string, unknown[]> = {
      giornale_lavori: [{ id: "g1", order_id: "o", data_lavori: "2026-11-09", firmato_da: "11111111-2222-3333-4444-555555555555", giornale_foto: [] }],
      profiles: [{ id: "11111111-2222-3333-4444-555555555555", first_name: "Marco", last_name: "Bianchi" }],
      employees: [{ user_id: "11111111-2222-3333-4444-555555555555", first_name: "Marco", last_name: "Bianchi", qualifica: "Capocantiere", role_type: "operaio" }],
    };
    const db = {
      from: (t: string) => {
        const q: Record<string, unknown> = {};
        for (const m of ["select", "eq", "in", "order", "gte", "lte", "range", "limit"]) q[m] = () => q;
        q.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: tabelle[t] ?? [], error: null }).then(ok);
        return q;
      },
      storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }) },
    };
    const [g] = await leggiGiornateDocumento(db, { companyId: VULCANO, orderId: "o" });
    expect(g.firmato_da).toBe("Marco Bianchi");
    expect(g.firmato_da_ruolo).toBe("Capocantiere");
  });

  it("senzaEmoji tiene i simboli tipografici e gli spazi giusti", () => {
    expect(senzaEmoji("☀️ Sole")).toBe("Sole");
    expect(senzaEmoji("ok 👍🏽 fatto")).toBe("ok fatto");
    expect(senzaEmoji("famiglia 👨‍👩‍👧 qui")).toBe("famiglia qui");
    expect(senzaEmoji("© 2026 Vulcano® – A→B ™ 25°C € 1/2")).toBe("© 2026 Vulcano® – A→B ™ 25°C € 1/2");
    expect(senzaEmoji("🌡 14°")).toBe("14°");
  });
});

/* ── Riepilogo commessa ── */
function testo(v: unknown): string {
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.map(testo).join(" ");
  if (isValidElement<{ children?: unknown }>(v)) return testo(v.props.children);
  return "";
}
const leggi = (doc: unknown) => testo(doc).replace(/\s+/g, " ");
function trova(v: unknown, tipo: unknown): boolean {
  if (Array.isArray(v)) return v.some((x) => trova(x, tipo));
  if (isValidElement<{ children?: ReactNode }>(v)) return v.type === tipo || trova(v.props.children, tipo);
  return false;
}
const dati = {
  permessi: { vedeCosti: true, vedeFatture: false, vedeSubappalti: false, vedeSicurezza: false },
  azienda: { nome: "Impresa Vulcano s.r.l.", righe: ["Via Marconi 35 – Lonate Pozzolo (VA)"], logo: logoPdf },
  fornitoriArticoli: {}, fasi: [], fatture: [], fattureAnnullate: 0, contratti: [], salSub: [], ddt: [], usciteMagazzino: [], attivita: [], appuntamenti: [],
  sopralluoghi: [], ticket: [], rapportini: [], ore: { rapportini: 0, giornate: 0, ore: 0, straordinari: 0, primo: null, ultimo: null, perPersona: [] },
  mezzi: [], foto: [], fotoTotali: 0, allegati: [], sicurezzaPos: [], sicurezzaDuvri: [], sicurezzaVerbali: [], firme: [], storicoStati: [], segnalazioni: [],
  errori: [], noteCantiere: [], nonLette: [],
} as unknown as DatiRiepilogo;
const props = (companyId: string, o: Record<string, unknown> = {}) => ({
  order: { id: "o", company_id: companyId, order_code: "VUL-2026-14", description: "Ristrutturazione condominio Via Roma", total_amount: 38000, vat_rate: 10, client_name: "Condominio Roma 12", indirizzo_lavori: "Via Roma 12, Vanzaghello", current_status_id: null, created_at: null, ...o },
  items: [
    { id: "i1", name: "Guaina bituminosa 4 mm", quantity: 120, unita_misura: "mq", unit_price: 18, natura_riga: "materiale", status: "da_ordinare" },
    { id: "i2", name: "Posa impermeabilizzazione", quantity: 1, unit_price: 4200, natura_riga: "lavorazione" },
  ],
  statuses: [],
  companyName: "Impresa Vulcano s.r.l.",
  dati,
});

describe("Riepilogo commessa", () => {
  it("per il cliente: niente stato d'acquisto, contatore installati, «Documento riservato» né «Non impostata»", () => {
    const t = leggi(createOrdinePDFDocument({ ...props(ALTRA), perCliente: true }));
    for (const interno of ["Da ordinare", "Lavorazione", "Articoli Installati", "0/2", "Documento riservato", "Non impostata", "Creato il", "TEMPISTICHE"]) expect(t).not.toContain(interno);
    for (const v of ["Guaina bituminosa 4 mm", "Posa impermeabilizzazione", "Condominio Roma 12"]) expect(t).toContain(v);
  });

  it("per il cliente: le date che ci sono restano, quelle che mancano no; il bollino di stato solo se c'è uno stato", () => {
    const t = leggi(createOrdinePDFDocument({
      ...props(ALTRA, { work_start_date: "2026-11-02", created_at: "2026-10-01T10:00:00Z", current_status_id: "s1" }),
      statuses: [{ id: "s1", name: "In corso", position: 1 }], perCliente: true,
    }));
    expect(t).toContain("Inizio lavori 02/11/2026");
    expect(t).toContain("Creato il 01/10/2026");
    expect(t).toContain("In corso");
    expect(t).not.toContain("Fine lavori");
    expect(t).not.toContain("Pagamento");
  });

  it("interna: stato d'acquisto, installati e «Documento riservato» restano", () => {
    const t = leggi(createOrdinePDFDocument(props(ALTRA)));
    for (const v of ["Da ordinare", "Lavorazione", "Articoli Installati", "Documento riservato"]) expect(t).toContain(v);
  });

  it("Vulcano: piè proprio e logo grande; la riga di riferimento dice «riservato» solo all'interno", () => {
    const cliente = createOrdinePDFDocument({ ...props(VULCANO), perCliente: true });
    const interno = createOrdinePDFDocument(props(VULCANO));
    expect(trova(cliente, PieSocietario)).toBe(true);
    expect(trova(createOrdinePDFDocument(props(ALTRA)), PieSocietario)).toBe(false);
    expect(leggi(cliente)).not.toContain("Documento riservato");
    expect(leggi(interno)).toContain("Documento riservato · VUL-2026-14");
    expect(JSON.stringify(cliente, (_k, v) => (typeof v === "string" && v.length > 200 ? "…" : v))).toContain('"height":55,"width":340');
  });

  it.runIf(!!DIR)("PDF di prova", async () => {
    const { pdf } = await import("@react-pdf/renderer");
    for (const [nome, perCliente] of [["riepilogo-vulcano-cliente", true], ["riepilogo-vulcano-interno", false]] as const) {
      const blob = await pdf(createOrdinePDFDocument({ ...props(VULCANO, perCliente ? {} : { work_start_date: "2026-11-02" }), perCliente })).toBlob();
      writeFileSync(join(DIR!, `${nome}.pdf`), Buffer.from(await blob.arrayBuffer()));
    }
  }, 60000);
});
