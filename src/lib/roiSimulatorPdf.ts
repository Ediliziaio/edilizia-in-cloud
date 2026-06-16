/**
 * Simulatore ROI di vendita — documento d'offerta / proposta di valore PDF.
 *
 * Genera un PDF A4 brandizzato, multi-sezione e multi-pagina, da lasciare al
 * prospect durante/dopo la trattativa. Non è una "paginetta" di numeri ma una
 * vera proposta di valore ancorata alle FUNZIONI reali di EdiliziaInCloud, in
 * cui la leva dominante è il **margine recuperato** col controllo di gestione.
 *
 * Riusa il pattern jsPDF di `pacchetto-custom/exportOfferPdf.ts` (stesso oggetto
 * BRAND navy `#1E3A5F` + accento orange `#F97316`, footer legale con
 * Domus Group S.r.l. SOLO nel footer). Nelle pagine il brand è EdiliziaInCloud.
 *
 * Struttura:
 *  1. Copertina — wordmark, "Proposta di valore", preparata per {cliente}, data
 *  2. La tua situazione oggi — riepilogo input ("cosa ci hai raccontato")
 *  3. Quanto ti costa NON cambiare — costo dell'inazione in grande (anno/mese/gg)
 *  4. Cosa ottieni con EdiliziaInCloud — tabella delle leve (results.leve[])
 *  5. Il confronto — due barre disegnate (inazione vs canone) + hero guadagno + ROI/payback
 *  6. Le funzioni incluse — moduli EdiliziaInCloud su 2 colonne
 *  7. L'investimento + CTA — canone, payback, call to action
 *  8. Footer legale su ogni pagina (Domus Group S.r.l. solo qui)
 *
 * Uso:  generateRoiPdf(inputs, results, clientName)                  → scarica il file
 *       generateRoiPdf(inputs, results, clientName, { mode: "datauristring" })
 *                                                                    → base64 per l'allegato email
 *       generateRoiPdf(inputs, results, clientName, { mode: "blob" }) → Blob
 *
 * NB: niente claim su localizzazione server (UE/Italia/Europa) — vietati.
 */

import jsPDF from "jspdf";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import type { RoiInputs, RoiResults } from "@/lib/roiSimulator";

const BRAND = {
  name: "EdiliziaInCloud",
  tagline: "Il gestionale per imprese edili italiane",
  legalName: "Domus Group S.r.l.",
  taxId: "P.IVA 13132010961",
  address: "Via Aurelio Saffi 29 — 20123 Milano",
  email: "info@ediliziaincloud.com",
  phone: "+39 02 87198520",
  // Palette (RGB) — coerente con exportOfferPdf.
  navy: [30, 58, 95] as const,
  navySoft: [45, 78, 120] as const,
  orange: [249, 115, 22] as const,
  green: [22, 163, 74] as const,
  greenSoft: [240, 253, 244] as const,
  amber: [217, 119, 6] as const,
  amberSoft: [255, 247, 237] as const,
  red: [185, 28, 28] as const,
  redSoft: [254, 242, 242] as const,
  ink: [33, 37, 41] as const,
  grey: [100, 100, 100] as const,
  greyLight: [148, 163, 184] as const,
  zebra: [248, 249, 251] as const,
  panel: [245, 246, 250] as const,
  hair: [223, 227, 234] as const,
};

const eur = (n: number) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
    // Forza il separatore delle migliaia anche dove l'ICU è ridotto
    // (minimumGroupingDigits=2): è un documento per il cliente → "2.044 €".
    useGrouping: "always",
  })
    .format(Number.isFinite(n) ? n : 0)
    // jsPDF (WinAnsi) non rende gli spazi stretti/insecabili che Intl inserisce
    // tra numero e simbolo: normalizziamo ogni carattere non-ASCII (tranne euro)
    // a spazio semplice.
    .replace(/[^\x20-\x7E\u20AC]/g, " ");

const num = (n: number) =>
  new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0, useGrouping: "always" }).format(
    Number.isFinite(n) ? n : 0,
  );

const giorni = (n: number) => `${num(n)} ${n === 1 ? "giorno" : "giorni"}`;

/** Voci di tempo perso → etichette leggibili (ordine = colonna input). */
const HOUR_LABELS: ReadonlyArray<readonly [keyof RoiInputs, string]> = [
  ["oreFatturazione", "Fatturazione & DDT"],
  ["orePreventivi", "Preventivi"],
  ["oreCantieri", "Gestione cantieri"],
  ["oreRicercaDocumenti", "Ricerca documenti"],
  ["oreDoppieImmissioni", "Doppie immissioni"],
];

/**
 * Moduli EdiliziaInCloud citati nella proposta. Sottoinsieme curato di funzioni
 * realmente presenti nel prodotto (vedi src/pages/funzionalita/*): mai inventati.
 */
const MODULES: ReadonlyArray<readonly [string, string]> = [
  ["Controllo di gestione", "Cruscotto, margini e KPI sempre aggiornati"],
  ["Bilanci e conto economico", "Situazione economica in tempo reale"],
  ["Commesse e cantieri", "Costi, ricavi e marginalità per cantiere"],
  ["Fatturazione elettronica", "Attiva e passiva, FatturaPA e SDI"],
  ["DDT e bolle", "Documenti di trasporto digitali"],
  ["Preventivi e offerte", "Computi rapidi e professionali"],
  ["Magazzino", "Scorte e movimenti di cantiere"],
  ["Prima nota e scadenzario", "Incassi, pagamenti e scadenze sotto controllo"],
  ["Ordini fornitori", "Acquisti tracciati e listini storici"],
  ["App mobile da cantiere", "Foto, rapportini e materiali dal campo"],
  ["Assistente AI", "Risposte e automazioni sui tuoi dati"],
  ["Compliance e conservazione", "Cassetto SDI e conservazione digitale a norma"],
];

export interface GenerateRoiPdfOptions {
  /**
   * "save" (default) scarica il file; "datauristring" ritorna il PDF come
   * data-URI base64 (usato per allegarlo all'email); "blob" ritorna un Blob.
   */
  mode?: "save" | "datauristring" | "blob";
  /** @deprecated Alias storico di `mode` (round 2). Mantenuto per compat. */
  output?: "save" | "datauristring" | "blob";
  /** Sovrascrive il nome file (default `<cliente>-Proposta-EdiliziaInCloud.pdf`). */
  fileName?: string;
}

/** Nome file sicuro per il download della proposta. */
export function roiPdfFileName(clientName: string): string {
  const safe =
    (clientName || "cliente")
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "cliente";
  return `${safe}-Proposta-EdiliziaInCloud.pdf`;
}

const A4 = { w: 210, h: 297 } as const;
const MARGIN = 16;
const CONTENT_W = A4.w - MARGIN * 2;
const FOOTER_TOP = A4.h - 16; // riga del footer
const SAFE_BOTTOM = A4.h - 22; // soglia per il page-break (sopra il footer)

/**
 * Contesto di disegno: incapsula `doc`, il cursore verticale `y`, e i numeri di
 * pagina, esponendo helper riutilizzabili (sezioni, righe tabella, barre…).
 */
class PdfDoc {
  readonly doc: jsPDF;
  y = 0;
  private readonly cliente: string;
  private readonly dateLabel: string;

  constructor(cliente: string) {
    this.doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    this.cliente = cliente;
    this.dateLabel = format(new Date(), "d MMMM yyyy", { locale: it });
  }

  // ── primitive colore/testo ──
  private fill(rgb: readonly [number, number, number]) {
    this.doc.setFillColor(rgb[0], rgb[1], rgb[2]);
  }
  private draw(rgb: readonly [number, number, number]) {
    this.doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
  }
  private ink(rgb: readonly [number, number, number]) {
    this.doc.setTextColor(rgb[0], rgb[1], rgb[2]);
  }
  private font(style: "normal" | "bold" | "italic", size: number) {
    this.doc.setFont("helvetica", style);
    this.doc.setFontSize(size);
  }

  /** Banda d'intestazione navy ripetuta in cima a ogni pagina-contenuto. */
  private runningHeader() {
    const { doc } = this;
    this.fill(BRAND.navy);
    doc.rect(0, 0, A4.w, 16, "F");
    this.ink([255, 255, 255]);
    this.font("bold", 12);
    doc.text(BRAND.name, MARGIN, 10.5);
    this.ink(BRAND.greyLight);
    this.font("normal", 7.5);
    doc.text("Proposta di valore", A4.w - MARGIN, 7.5, { align: "right" });
    doc.text(`per ${this.cliente}`, A4.w - MARGIN, 11.5, { align: "right" });
  }

  /** Footer legale su OGNI pagina (Domus Group solo qui) + numero pagina. */
  private footer(pageNo: number, pageCount: number) {
    const { doc } = this;
    this.draw(BRAND.hair);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, FOOTER_TOP, A4.w - MARGIN, FOOTER_TOP);
    this.ink(BRAND.grey);
    this.font("normal", 6.8);
    doc.text(`${BRAND.legalName} — ${BRAND.taxId} — ${BRAND.address}`, MARGIN, FOOTER_TOP + 4);
    doc.text(`${BRAND.email} · ${BRAND.phone}`, A4.w - MARGIN, FOOTER_TOP + 4, { align: "right" });
    this.ink(BRAND.greyLight);
    doc.text(
      "Stima indicativa basata sui dati che ci hai fornito. Documento preparato da EdiliziaInCloud.",
      MARGIN,
      FOOTER_TOP + 7.5,
    );
    doc.text(`${pageNo} / ${pageCount}`, A4.w - MARGIN, FOOTER_TOP + 7.5, { align: "right" });
  }

  /** Inizia una nuova pagina-contenuto (header in cima, cursore sotto). */
  newContentPage() {
    this.doc.addPage();
    this.runningHeader();
    this.y = 26;
  }

  /** Assicura `need` mm di spazio: se non c'è, va a pagina nuova. */
  ensure(need: number) {
    if (this.y + need > SAFE_BOTTOM) this.newContentPage();
  }

  /** Titolo di sezione con kicker numerato + sottotitolo opzionale. */
  sectionTitle(kicker: string, title: string, subtitle?: string) {
    this.ensure(subtitle ? 24 : 18);
    const { doc } = this;
    // pallino accento + kicker
    this.ink(BRAND.orange);
    this.font("bold", 8);
    doc.text(kicker.toUpperCase(), MARGIN, this.y);
    this.y += 5.5;
    this.ink(BRAND.navy);
    this.font("bold", 16);
    doc.text(title, MARGIN, this.y);
    this.y += 2;
    this.draw(BRAND.orange);
    doc.setLineWidth(0.8);
    doc.line(MARGIN, this.y, MARGIN + 18, this.y);
    this.y += subtitle ? 5.5 : 7;
    if (subtitle) {
      this.ink(BRAND.grey);
      this.font("normal", 9.5);
      const lines = doc.splitTextToSize(subtitle, CONTENT_W);
      doc.text(lines, MARGIN, this.y);
      this.y += lines.length * 5 + 3;
    }
  }

  /** Riga chiave/valore con zebra opzionale; grassetto per i totali. */
  kvRow(label: string, value: string, opts: { zebra?: boolean; bold?: boolean; accent?: readonly [number, number, number] } = {}) {
    const { doc } = this;
    const rowH = 7;
    this.ensure(rowH);
    if (opts.zebra) {
      this.fill(BRAND.zebra);
      doc.rect(MARGIN, this.y - 4.6, CONTENT_W, rowH, "F");
    }
    this.font(opts.bold ? "bold" : "normal", 9.5);
    this.ink(opts.bold ? BRAND.ink : BRAND.grey);
    doc.text(label, MARGIN + 2, this.y);
    this.ink(opts.accent ?? BRAND.ink);
    this.font(opts.bold ? "bold" : "normal", 9.5);
    doc.text(value, A4.w - MARGIN - 2, this.y, { align: "right" });
    this.y += rowH;
  }

  /** Box pannello chiaro con titolo + corpo testuale (wrap). */
  panel(title: string, body: string, tone: "neutral" | "amber" | "green" = "neutral") {
    const { doc } = this;
    const bg = tone === "amber" ? BRAND.amberSoft : tone === "green" ? BRAND.greenSoft : BRAND.panel;
    const bodyLines = doc.splitTextToSize(body, CONTENT_W - 8);
    const boxH = 11 + bodyLines.length * 5;
    this.ensure(boxH + 2);
    this.fill(bg);
    doc.rect(MARGIN, this.y, CONTENT_W, boxH, "F");
    // barretta accento a sinistra
    this.fill(tone === "amber" ? BRAND.amber : tone === "green" ? BRAND.green : BRAND.navy);
    doc.rect(MARGIN, this.y, 1.5, boxH, "F");
    this.ink(BRAND.navy);
    this.font("bold", 10);
    doc.text(title, MARGIN + 5, this.y + 7);
    this.ink(BRAND.ink);
    this.font("normal", 9.5);
    doc.text(bodyLines, MARGIN + 5, this.y + 13);
    this.y += boxH + 6;
  }

  get jsdoc(): jsPDF {
    return this.doc;
  }

  /** Disegna footer su tutte le pagine e finalizza. */
  paginate() {
    const total = this.doc.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      this.doc.setPage(p);
      this.footer(p, total);
    }
  }
}

/* ────────────────────────────── SEZIONI ────────────────────────────── */

/** 1 — Copertina: banda brand, titolo, destinatario, data. */
function coverPage(p: PdfDoc, cliente: string) {
  const doc = p.jsdoc;
  // Banda superiore piena navy
  doc.setFillColor(...BRAND.navy);
  doc.rect(0, 0, A4.w, 92, "F");
  // Accenti orange (riga sottile + blocco)
  doc.setFillColor(...BRAND.orange);
  doc.rect(0, 92, A4.w, 2.5, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(30);
  doc.text(BRAND.name, MARGIN, 38);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(157, 180, 214);
  doc.text(BRAND.tagline, MARGIN, 47);

  doc.setFillColor(...BRAND.orange);
  doc.rect(MARGIN, 60, 30, 1.4, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Proposta di valore", MARGIN, 74);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(190, 205, 228);
  doc.text("Analisi del ritorno sull'investimento", MARGIN, 83);

  // Blocco destinatario + data sotto la banda
  let y = 116;
  doc.setTextColor(...BRAND.orange);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("PREPARATA PER", MARGIN, y);
  y += 9;
  doc.setTextColor(...BRAND.navy);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  const nameLines = doc.splitTextToSize(cliente, CONTENT_W);
  doc.text(nameLines, MARGIN, y);
  y += nameLines.length * 9 + 4;
  doc.setTextColor(...BRAND.grey);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Documento del ${format(new Date(), "d MMMM yyyy", { locale: it })}`, MARGIN, y);

  // Frase guida in basso
  doc.setDrawColor(...BRAND.hair);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, 250, A4.w - MARGIN, 250);
  doc.setTextColor(...BRAND.navy);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("EdiliziaInCloud non è un costo: si ripaga da solo.", MARGIN, 262);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...BRAND.grey);
  doc.text(
    "Nelle pagine seguenti trovi la tua situazione attuale, quanto ti costa non cambiare e il valore",
    MARGIN,
    269,
  );
  doc.text("che recuperi ogni anno con il controllo di gestione e le funzioni di EdiliziaInCloud.", MARGIN, 273.5);
}

/** 2 — La tua situazione oggi: riepilogo input. */
function situationSection(p: PdfDoc, inputs: RoiInputs, results: RoiResults) {
  p.sectionTitle(
    "01 · Punto di partenza",
    "La tua situazione oggi",
    "Ecco cosa ci hai raccontato della tua impresa. Sono questi i numeri su cui costruiamo l'analisi.",
  );

  p.kvRow("Fatturato annuo", `${eur(inputs.fatturatoAnnuo)} / anno`, { zebra: true });
  p.kvRow(
    "Software e gestionali oggi",
    `${eur(inputs.softwareMensile)}/mese · ${eur(results.softwareEliminato)}/anno`,
  );
  let zebra = true;
  for (const [key, label] of HOUR_LABELS) {
    const h = Number(inputs[key]);
    p.kvRow(`Ore perse — ${label}`, `${num(Number.isFinite(h) ? h : 0)} h/sett.`, { zebra });
    zebra = !zebra;
  }
  p.kvRow("Totale tempo perso", `${num(results.oreSettimana)} h/settimana`, { bold: true });
  p.kvRow("Costo orario medio del personale", `${eur(inputs.costoOrario)} / h`, { zebra: true });
  p.kvRow("Errori, sanzioni e ritardi stimati", `${eur(inputs.erroriAnnui)} / anno`);
  p.y += 4;
}

/** 3 — Quanto ti costa NON cambiare: il costo dell'inazione. */
function inactionSection(p: PdfDoc, results: RoiResults) {
  const doc = p.jsdoc;
  p.sectionTitle(
    "02 · Il costo dell'inazione",
    "Quanto ti costa non cambiare",
    "Ogni anno che rimandi è valore che lasci sul tavolo: tempo, margine e rischi che restano dove sono.",
  );

  // Hero ambra con il numero grande
  const heroH = 40;
  p.ensure(heroH + 2);
  doc.setFillColor(...BRAND.amberSoft);
  doc.rect(MARGIN, p.y, CONTENT_W, heroH, "F");
  doc.setFillColor(...BRAND.amber);
  doc.rect(MARGIN, p.y, 1.8, heroH, "F");
  doc.setTextColor(...BRAND.amber);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("RESTARE COM'È OGGI TI COSTA", MARGIN + 6, p.y + 10);
  doc.setTextColor(...BRAND.red);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(30);
  const costoStr = eur(results.costoInazioneAnnuo);
  doc.text(costoStr, MARGIN + 6, p.y + 25);
  const costoW = doc.getTextWidth(costoStr); // a 30pt, prima di rimpicciolire
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...BRAND.grey);
  doc.text(" / anno", MARGIN + 6 + costoW + 1.5, p.y + 25);

  // Equivalenti mese / giorno a destra-basso
  const perMese = results.costoInazioneAnnuo / 12;
  const perGiorno = results.costoInazioneAnnuo / 365;
  doc.setTextColor(...BRAND.grey);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    `Sono ${eur(perMese)} al mese, ${eur(perGiorno)} al giorno.`,
    MARGIN + 6,
    p.y + 34,
  );
  p.y += heroH + 6;

  p.panel(
    "Perché è un costo, non un'ipotesi",
    "Non è denaro che esce dal conto: è margine che non recuperi, ore che continui a pagare e " +
      "rischi che resti a sostenere. Più rimandi, più questo importo si accumula anno dopo anno.",
    "amber",
  );
}

/** 4 — Cosa ottieni: tabella delle leve di valore. */
function leveSection(p: PdfDoc, results: RoiResults) {
  const doc = p.jsdoc;
  p.sectionTitle(
    "03 · Da dove arriva il valore",
    "Cosa ottieni con EdiliziaInCloud",
    "Ogni leva è collegata a una funzione reale della piattaforma. La principale è il controllo di gestione: margine che oggi ti sfugge.",
  );

  // Header tabella
  const headH = 8;
  const colLeva = MARGIN + 2;
  const colFun = MARGIN + 74;
  const colVal = A4.w - MARGIN - 2;
  p.ensure(headH + 10);
  doc.setFillColor(...BRAND.navy);
  doc.rect(MARGIN, p.y, CONTENT_W, headH, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("LEVA DI VALORE", colLeva, p.y + 5.3);
  doc.text("FUNZIONE EDILIZIAINCLOUD", colFun, p.y + 5.3);
  doc.text("€ / ANNO", colVal, p.y + 5.3, { align: "right" });
  p.y += headH;

  // Righe leve (results.leve già ordinato per valore desc)
  let zebra = false;
  for (const leva of results.leve) {
    const principale = leva.key === "margine";
    const funLines = doc.splitTextToSize(leva.funzione, colVal - colFun - 22);
    const rowH = Math.max(9, 4 + funLines.length * 4);
    p.ensure(rowH);
    if (principale) {
      doc.setFillColor(...BRAND.greenSoft);
      doc.rect(MARGIN, p.y, CONTENT_W, rowH, "F");
      doc.setFillColor(...BRAND.green);
      doc.rect(MARGIN, p.y, 1.5, rowH, "F");
    } else if (zebra) {
      doc.setFillColor(...BRAND.zebra);
      doc.rect(MARGIN, p.y, CONTENT_W, rowH, "F");
    }
    const midY = p.y + rowH / 2 + 1.4;
    doc.setTextColor(...(principale ? BRAND.green : BRAND.ink));
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(leva.label, colLeva, midY);
    if (principale) {
      const lw = doc.getTextWidth(leva.label); // a 9pt
      const badgeX = colLeva + lw + 2.5;
      // Badge solo se sta tutto prima della colonna funzione (niente sovrapposizioni).
      if (badgeX + 16 <= colFun - 2) {
        doc.setFillColor(...BRAND.green);
        doc.rect(badgeX, midY - 3.2, 16, 4.4, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6);
        doc.text("PRINCIPALE", badgeX + 1.5, midY);
      }
    }
    doc.setTextColor(...BRAND.grey);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(funLines, colFun, p.y + rowH / 2 - (funLines.length - 1) * 2 + 0.8);
    doc.setTextColor(...(principale ? BRAND.green : BRAND.ink));
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.text(eur(leva.valore), colVal, midY, { align: "right" });
    p.y += rowH;
    zebra = !zebra;
  }

  // Totale valore generato
  p.ensure(11);
  doc.setDrawColor(...BRAND.navy);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, p.y + 1, A4.w - MARGIN, p.y + 1);
  p.y += 7;
  doc.setTextColor(...BRAND.navy);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Valore generato ogni anno", colLeva, p.y);
  doc.setFontSize(13);
  doc.text(eur(results.costoInazioneAnnuo), colVal, p.y, { align: "right" });
  p.y += 6;
}

/** 5 — Il confronto: barre disegnate + hero guadagno + badge ROI/payback. */
function comparisonSection(p: PdfDoc, results: RoiResults) {
  const doc = p.jsdoc;
  const guadagna = results.guadagnoNettoAnnuo > 0;
  p.sectionTitle(
    "04 · Il confronto",
    "Restare com'è oggi vs investire in EdiliziaInCloud",
    "Da una parte il costo di non cambiare. Dall'altra, il canale di EdiliziaInCloud: la differenza torna in cassa.",
  );

  // ── Due barre orizzontali disegnate (rect), in scala sul max ──
  const barsTop = p.y;
  const labelW = 52;
  const barX = MARGIN + labelW;
  const barMaxW = A4.w - MARGIN - barX - 30; // spazio per il valore a destra
  const maxVal = Math.max(results.costoInazioneAnnuo, results.canoneAnno, 1);
  const barH = 11;
  const gap = 9;
  p.ensure(barH * 2 + gap + 8);

  const drawBar = (
    rowY: number,
    label: string,
    value: number,
    color: readonly [number, number, number],
    track: readonly [number, number, number],
  ) => {
    doc.setTextColor(...BRAND.ink);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    const ll = doc.splitTextToSize(label, labelW - 3);
    doc.text(ll, MARGIN, rowY + barH / 2 - (ll.length - 1) * 1.8 + 1);
    // track
    doc.setFillColor(...track);
    doc.rect(barX, rowY, barMaxW, barH, "F");
    // valore in scala (min 2mm per visibilità)
    const w = Math.max(2, (value / maxVal) * barMaxW);
    doc.setFillColor(...color);
    doc.rect(barX, rowY, w, barH, "F");
    // etichetta valore
    doc.setTextColor(...color);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.text(eur(value), barX + barMaxW + 2, rowY + barH / 2 + 1.6);
  };

  drawBar(barsTop, "Restare com'è oggi", results.costoInazioneAnnuo, BRAND.amber, BRAND.amberSoft);
  drawBar(
    barsTop + barH + gap,
    "Investimento EdiliziaInCloud",
    results.canoneAnno,
    BRAND.green,
    BRAND.greenSoft,
  );
  p.y = barsTop + barH * 2 + gap + 8;

  // ── Hero guadagno netto (navy) ──
  const heroH = 34;
  p.ensure(heroH + 4);
  doc.setFillColor(...BRAND.navy);
  doc.rect(MARGIN, p.y, CONTENT_W, heroH, "F");
  doc.setTextColor(157, 180, 214);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text(guadagna ? "GUADAGNO NETTO CON EDILIZIAINCLOUD" : "STIMA DEL GUADAGNO NETTO", MARGIN + 6, p.y + 10);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  const guad = eur(Math.max(0, results.guadagnoNettoAnnuo));
  doc.text(guad, MARGIN + 6, p.y + 24);
  const guadW = doc.getTextWidth(guad); // a 28pt, prima di rimpicciolire
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(" / anno", MARGIN + 6 + guadW + 1.5, p.y + 24);
  if (guadagna) {
    doc.setTextColor(157, 180, 214);
    doc.setFontSize(8.5);
    doc.text(
      `circa ${eur(results.guadagnoNettoMensile)}/mese · ${eur(results.guadagnoNettoGiornaliero)}/giorno che tornano in cassa.`,
      MARGIN + 6,
      p.y + 31,
    );
  }
  p.y += heroH + 6;

  // ── Due badge: ROI × e payback giorni ──
  if (guadagna && (results.roiMultiplo > 0 || results.paybackGiorni > 0)) {
    const badgeH = 18;
    const badgeW = (CONTENT_W - 6) / 2;
    p.ensure(badgeH + 2);
    // ROI
    doc.setFillColor(...BRAND.greenSoft);
    doc.setDrawColor(...BRAND.green);
    doc.setLineWidth(0.3);
    doc.rect(MARGIN, p.y, badgeW, badgeH, "FD");
    doc.setTextColor(...BRAND.green);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    const roiTxt = results.roiMultiplo > 0 ? `${results.roiMultiplo.toFixed(1)}×` : "—";
    doc.text(roiTxt, MARGIN + 6, p.y + 11);
    const roiW = doc.getTextWidth(roiTxt); // a 16pt, prima di rimpicciolire
    doc.setTextColor(...BRAND.grey);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text("di ROI su ogni euro investito", MARGIN + 6 + roiW + 2.5, p.y + 11);
    // Payback
    const bx = MARGIN + badgeW + 6;
    doc.setFillColor(...BRAND.panel);
    doc.setDrawColor(...BRAND.navySoft);
    doc.rect(bx, p.y, badgeW, badgeH, "FD");
    doc.setTextColor(...BRAND.navy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    const pb = results.paybackGiorni > 0 ? num(results.paybackGiorni) : "—";
    doc.text(pb, bx + 6, p.y + 11);
    const pbW = doc.getTextWidth(pb); // a 16pt, prima di rimpicciolire
    doc.setTextColor(...BRAND.grey);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(
      results.paybackGiorni > 0 ? "giorni per ripagarsi" : "si ripaga col tempo",
      bx + 6 + pbW + 2.5,
      p.y + 11,
    );
    p.y += badgeH + 6;
  }
}

/** 6 — Le funzioni incluse: moduli su 2 colonne. */
function modulesSection(p: PdfDoc) {
  const doc = p.jsdoc;
  p.sectionTitle(
    "05 · Tutto in un'unica piattaforma",
    "Le funzioni incluse",
    "Un solo strumento al posto di fogli, gestionali separati e doppie immissioni. Tutto parla con tutto.",
  );

  const colGap = 8;
  const colW = (CONTENT_W - colGap) / 2;
  const rowH = 11;
  const rows = Math.ceil(MODULES.length / 2);
  p.ensure(rows * rowH + 2);
  const startY = p.y;

  MODULES.forEach(([name, desc], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = MARGIN + col * (colW + colGap);
    const y = startY + row * rowH;
    // checkmark accento
    doc.setFillColor(...BRAND.green);
    doc.circle(x + 2, y + 2.3, 1.8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.text("✓", x + 1.05, y + 3.15);
    // testo
    doc.setTextColor(...BRAND.navy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.2);
    doc.text(name, x + 6, y + 2.3);
    doc.setTextColor(...BRAND.grey);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.6);
    const dl = doc.splitTextToSize(desc, colW - 6);
    doc.text(dl[0] ?? "", x + 6, y + 6.6);
  });
  p.y = startY + rows * rowH + 4;
}

/** 7 — L'investimento + CTA. */
function investmentSection(p: PdfDoc, inputs: RoiInputs, results: RoiResults) {
  const doc = p.jsdoc;
  const guadagna = results.guadagnoNettoAnnuo > 0;
  p.sectionTitle("06 · L'investimento", "Quanto costa, quanto rende");

  p.kvRow("Canone EdiliziaInCloud", `${eur(inputs.abbonamentoMensile)} / mese`, { zebra: true, bold: true });
  p.kvRow("Equivalente annuo", `${eur(results.canoneAnno)} / anno`);
  if (results.paybackGiorni > 0) {
    p.kvRow("Si ripaga in", giorni(results.paybackGiorni), { zebra: true, accent: BRAND.green, bold: true });
  }
  if (guadagna) {
    p.kvRow("Guadagno netto stimato", `${eur(results.guadagnoNettoAnnuo)} / anno`, { accent: BRAND.green, bold: true });
  }
  p.y += 4;

  // Box CTA navy
  const ctaH = 34;
  p.ensure(ctaH + 2);
  doc.setFillColor(...BRAND.navy);
  doc.rect(MARGIN, p.y, CONTENT_W, ctaH, "F");
  doc.setFillColor(...BRAND.orange);
  doc.rect(MARGIN, p.y, CONTENT_W, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Attiva EdiliziaInCloud e inizia a recuperare margine da subito.", MARGIN + 6, p.y + 13, {
    maxWidth: CONTENT_W - 12,
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(190, 205, 228);
  doc.text(
    "Attivazione immediata, supporto incluso, nessun vincolo pluriennale. Restiamo a disposizione per ogni chiarimento.",
    MARGIN + 6,
    p.y + 21,
    { maxWidth: CONTENT_W - 12 },
  );
  doc.setTextColor(...BRAND.orange);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text(`${BRAND.email}  ·  ${BRAND.phone}`, MARGIN + 6, p.y + 29);
  p.y += ctaH + 4;
}

/* ────────────────────────────── ENTRYPOINT ────────────────────────────── */

/**
 * Genera la proposta di valore ROI. Di default scarica il PDF; con
 * `mode:"datauristring"` ritorna la data-URI (per l'allegato email), con
 * `mode:"blob"` un Blob. Documento multi-pagina (≥ 2 pagine).
 */
export function generateRoiPdf(
  inputs: RoiInputs,
  results: RoiResults,
  clientName: string,
  opts: GenerateRoiPdfOptions = {},
): string | Blob | void {
  const cliente = (clientName || "").trim() || "La tua impresa";
  const p = new PdfDoc(cliente);

  // 1 — Copertina (pagina 1, senza running header)
  coverPage(p, cliente);

  // 2..7 — Sezioni contenuto (header+footer ripetuti)
  p.newContentPage();
  situationSection(p, inputs, results);
  inactionSection(p, results);
  leveSection(p, results);
  comparisonSection(p, results);
  modulesSection(p);
  investmentSection(p, inputs, results);

  // Footer su tutte le pagine + numerazione corretta
  p.paginate();

  const mode = opts.mode ?? opts.output ?? "save";
  if (mode === "datauristring") return p.doc.output("datauristring");
  if (mode === "blob") return p.doc.output("blob");
  p.doc.save(opts.fileName ?? roiPdfFileName(clientName));
}

/**
 * Estrae il payload base64 puro (senza prefisso `data:...;base64,`) dal data-URI
 * prodotto da jsPDF, pronto per `sendEmailUnified({ attachments: [{ content }] })`.
 */
export function roiPdfBase64(inputs: RoiInputs, results: RoiResults, clientName: string): string {
  const dataUri = generateRoiPdf(inputs, results, clientName, { mode: "datauristring" }) as string;
  const comma = dataUri.indexOf(",");
  return comma >= 0 ? dataUri.slice(comma + 1) : dataUri;
}
