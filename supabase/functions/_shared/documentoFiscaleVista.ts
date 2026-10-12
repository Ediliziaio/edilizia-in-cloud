/**
 * documentoFiscaleVista.ts — l'aspetto della copia di cortesia dei documenti
 * fiscali (fattura, nota di credito, proforma…), in un posto solo (12/10/2026).
 *
 * Lo usano il PDF (generate-native-pdf, stampato dal browser) e l'anteprima
 * nell'app (PreviewFattura): stesse classi, stessi colori, stesse misure e la
 * stessa scelta delle voci dei totali, così quello che si vede a schermo è
 * quello che riceve il cliente. Ogni regola del foglio sta sotto `.fd-foglio`:
 * dentro l'app non tocca nient'altro.
 *
 * Modulo puro (niente Deno, niente DOM): lo importano funzioni, app e test.
 */

import { normalizzaHex, schiarisci, testoSuChiaro } from "./temaColori.ts";

/** Il colore delle fatture quando l'azienda non ne ha scelto uno (Impostazioni → Fatturazione → Template PDF). */
export const COLORE_FATTURA_DI_SERIE = "#0EA5E9";

export interface TemaFattura {
  /** Il colore scelto dall'azienda: filetti e bordi. */
  accento: string;
  /** Lo stesso colore, scurito quanto basta per leggersi come testo su bianco. */
  accentoTesto: string;
  /** Una tinta chiarissima del colore: fondo dell'intestazione tabella e del totale. */
  tinta: string;
  /** Una tinta chiara del colore: bordo dei riquadri colorati. */
  tintaBordo: string;
}

export function temaFattura(colore: unknown): TemaFattura {
  const accento = normalizzaHex(colore) ?? COLORE_FATTURA_DI_SERIE;
  return {
    accento,
    accentoTesto: testoSuChiaro(accento),
    tinta: schiarisci(accento, 0.92),
    tintaBordo: schiarisci(accento, 0.7),
  };
}

// ─── Testi e formati ────────────────────────────────────────────────────────

export const ETICHETTA_TIPO_DOCUMENTO: Record<string, string> = {
  fattura: "FATTURA",
  fattura_pa: "FATTURA PA",
  nota_credito: "NOTA DI CREDITO",
  nota_debito: "NOTA DI DEBITO",
  autofattura: "AUTOFATTURA",
  fattura_riepilogativa: "FATTURA RIEPILOGATIVA",
  proforma: "PROFORMA",
  preventivo: "PREVENTIVO",
  ddt: "DOCUMENTO DI TRASPORTO",
  parcella: "PARCELLA",
  fattura_accompagnatoria: "FATTURA ACCOMPAGNATORIA",
  integrazione_servizi_estero: "AUTOFATTURA TD17",
  integrazione_beni_ue: "INTEGRAZIONE TD18",
  integrazione_beni_extra_ue: "INTEGRAZIONE TD19",
};

export function etichettaTipoDocumento(tipo: unknown): string {
  return ETICHETTA_TIPO_DOCUMENTO[String(tipo ?? "")] ?? "DOCUMENTO";
}

/** Le modalità di pagamento della FatturaPA, con il nome che legge il cliente (non il codice MP). */
export const MODALITA_PAGAMENTO: Record<string, string> = {
  MP01: "Contanti",
  MP02: "Assegno",
  MP03: "Assegno circolare",
  MP04: "Contanti presso Tesoreria",
  MP05: "Bonifico",
  MP06: "Vaglia cambiario",
  MP07: "Bollettino bancario",
  MP08: "Carta di pagamento",
  MP09: "RID",
  MP10: "RID utenze",
  MP11: "RID veloce",
  MP12: "RIBA",
  MP13: "MAV",
  MP14: "Quietanza erario",
  MP15: "Giroconto su conti di contabilità speciale",
  MP16: "Domiciliazione bancaria",
  MP17: "Domiciliazione postale",
  MP18: "Bollettino di c/c postale",
  MP19: "SEPA Direct Debit",
  MP20: "SEPA Direct Debit CORE",
  MP21: "SEPA Direct Debit B2B",
  MP22: "Trattenuta su somme già riscosse",
  MP23: "PagoPA",
};

/** Il nome della modalità: quello scritto sul documento, altrimenti quello standard del codice. */
export function nomeModalitaPagamento(codice: unknown, nome: unknown): string {
  const scritto = String(nome ?? "").trim();
  if (scritto) return scritto;
  const c = String(codice ?? "").trim().toUpperCase();
  return MODALITA_PAGAMENTO[c] ?? c;
}

const pulito = (v: unknown): string => String(v ?? "").trim();

/** "1.220,00 €": il separatore delle migliaia sempre, anche sotto le 5 cifre (come formatCurrency dell'app). */
export function euro(n: unknown): string {
  const valore = Number(n);
  const numero = Number.isFinite(valore) ? valore : 0;
  return `${numero.toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: "always" as unknown as boolean,
  })} €`;
}

/** Un importo con il segno meno tipografico davanti se è negativo: «−160,00 €». */
export function euroConSegno(n: number): string {
  return n < 0 ? `\u2212${euro(-n)}` : euro(n);
}

/** "2026-10-02" (o un timestamp) → "02/10/2026". */
export function dataBreve(d: unknown): string {
  const s = pulito(d).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

/** 13 → "13"; 1.5 → "1,5". */
export function quantitaLeggibile(q: unknown): string {
  const n = Number(q);
  if (!Number.isFinite(n)) return pulito(q);
  return n.toLocaleString("it-IT", { maximumFractionDigits: 4 });
}

/** L'IBAN a gruppi di quattro, come si scrive su carta. */
export function ibanLeggibile(iban: unknown): string {
  return pulito(iban).replace(/\s+/g, "").toUpperCase().replace(/(.{4})(?=.)/g, "$1 ");
}

/** L'importo di una riga: l'imponibile (prezzo × quantità − sconto), come nella FatturaPA. */
export function importoRiga(r: Record<string, unknown>): number {
  if (r.imponibile != null && r.imponibile !== "") return Number(r.imponibile) || 0;
  return (Number(r.totale_riga) || 0) - (Number(r.imposta) || 0);
}

/** La forma giuridica si ripete solo se la ragione sociale non la dice già («… S.R.L.» e «SRL»). */
export function formaGiuridicaDaMostrare(ragioneSociale: unknown, forma: unknown): string {
  const f = pulito(forma);
  if (!f) return "";
  if (f.toLowerCase() === "altro") return "";
  const compatta = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return compatta(pulito(ragioneSociale)).endsWith(compatta(f)) ? "" : f;
}

export function nomeDestinatario(snap: Record<string, unknown> | null | undefined): string {
  if (!snap) return "";
  return pulito(snap.ragione_sociale) || [pulito(snap.nome), pulito(snap.cognome)].filter(Boolean).join(" ");
}

/** "Via Roma 1, 33170 Pordenone (PN)"; il paese solo se non è l'Italia. */
export function indirizzoInRiga(a: Record<string, unknown> | null | undefined): string {
  if (!a) return "";
  const via = [pulito(a.indirizzo_via), pulito(a.indirizzo_numero_civico)].filter(Boolean).join(", ");
  const provincia = pulito(a.indirizzo_provincia);
  const luogo = [pulito(a.indirizzo_cap), pulito(a.indirizzo_comune)].filter(Boolean).join(" ")
    + (provincia ? ` (${provincia})` : "");
  const nazione = pulito(a.indirizzo_nazione).toUpperCase();
  return [via, luogo.trim(), nazione && nazione !== "IT" ? nazione : ""].filter(Boolean).join(", ");
}

// ─── Totali ─────────────────────────────────────────────────────────────────

export interface VoceTotale {
  voce: string;
  importo: number;
  /** "totale": il totale del documento quando sotto seguono ritenute; "finale": la cifra da pagare. */
  tipo?: "totale" | "finale";
}

const n = (v: unknown): number => Number(v) || 0;
const arrotonda = (v: number): number => Math.round(v * 100) / 100;

function inScissione(doc: Record<string, unknown>): boolean {
  const riepilogo = Array.isArray(doc.riepilogo_iva) ? (doc.riepilogo_iva as Array<Record<string, unknown>>) : [];
  return doc.esigibilita_iva === "S" || riepilogo.some((r) => r.esigibilita === "S");
}

/**
 * Le voci del riquadro dei totali, dai soli importi salvati sul documento.
 * Ogni voce che c'è si vede, e i conti tornano: Imponibile + cassa + IVA + bollo
 * = Totale; poi, se il cliente paga una cifra diversa (ritenute, rivalsa,
 * scissione dei pagamenti), le voci che la spiegano e il Netto a pagare.
 */
export function vociTotali(doc: Record<string, unknown>): VoceTotale[] {
  const voci: VoceTotale[] = [];
  const imponibile = n(doc.imponibile_totale);
  const sconto = n(doc.sconto_globale_valore);
  if (sconto > 0) {
    const percentuale = n(doc.sconto_globale_percentuale);
    voci.push({ voce: "Totale righe", importo: n(doc.subtotale) > 0 ? n(doc.subtotale) : arrotonda(imponibile + sconto) });
    voci.push({ voce: percentuale > 0 ? `Sconto ${quantitaLeggibile(percentuale)}%` : "Sconto", importo: -sconto });
  }
  voci.push({ voce: "Imponibile", importo: imponibile });
  if (n(doc.cassa_importo) > 0) voci.push({ voce: "Cassa previdenziale", importo: n(doc.cassa_importo) });
  voci.push({ voce: "IVA", importo: n(doc.iva_totale) });
  if (doc.bollo_virtuale) voci.push({ voce: "Imposta di bollo", importo: n(doc.bollo_importo) || 2 });
  if (Math.abs(n(doc.arrotondamento)) >= 0.005) voci.push({ voce: "Arrotondamento", importo: n(doc.arrotondamento) });

  const totale = n(doc.totale_documento);
  const daPagare = doc.totale_da_pagare == null || doc.totale_da_pagare === "" ? totale : n(doc.totale_da_pagare);
  if (Math.abs(daPagare - totale) < 0.005) {
    voci.push({ voce: "Totale", importo: totale, tipo: "finale" });
    return voci;
  }

  voci.push({ voce: "Totale documento", importo: totale, tipo: "totale" });
  const rivalsa = n(doc.rivalsa_importo);
  const ritenuta = n(doc.ritenuta_importo);
  const altra = n(doc.altra_ritenuta_importo);
  if (rivalsa > 0) voci.push({ voce: "Rivalsa INPS", importo: rivalsa });
  if (ritenuta > 0) voci.push({ voce: "Ritenuta d'acconto", importo: -ritenuta });
  if (altra > 0) voci.push({ voce: "Altra ritenuta", importo: -altra });
  const scissione = arrotonda(totale + rivalsa - ritenuta - altra - daPagare);
  if (scissione >= 0.005 && inScissione(doc)) voci.push({ voce: "IVA in scissione pagamenti", importo: -scissione });
  voci.push({ voce: "Netto a pagare", importo: daPagare, tipo: "finale" });
  return voci;
}

/** I documenti che chiedono un pagamento al cliente. */
const TIPI_DA_PAGARE = [
  "fattura", "fattura_pa", "nota_debito", "parcella", "fattura_accompagnatoria", "fattura_riepilogativa", "proforma",
];

/** La cifra in evidenza accanto al destinatario. */
export function importoInEvidenza(doc: Record<string, unknown>): { etichetta: string; importo: number } {
  const tipo = String(doc.tipo ?? "fattura");
  const totale = n(doc.totale_documento);
  if (TIPI_DA_PAGARE.includes(tipo)) {
    const daPagare = doc.totale_da_pagare == null || doc.totale_da_pagare === "" ? totale : n(doc.totale_da_pagare);
    return { etichetta: "Totale da pagare", importo: daPagare };
  }
  if (tipo === "nota_credito") return { etichetta: "Totale nota di credito", importo: totale };
  if (tipo === "preventivo") return { etichetta: "Totale preventivo", importo: totale };
  return { etichetta: "Totale documento", importo: totale };
}

// ─── Fogli di stile ─────────────────────────────────────────────────────────

/**
 * Le regole del foglio A4. Il respiro attorno al testo (14 mm sopra e sotto,
 * 16 mm ai lati) è il padding del foglio: `box-decoration-break: clone` lo
 * ripete su ogni pagina quando la fattura ne occupa più di una.
 *
 * Gli estremi (Numero, Data, …) sono una griglia e non una tabella: in stampa
 * Chrome allinea le celle di tabella in alto anche con `vertical-align:
 * baseline`, e l'etichetta piccola finiva 3 punti sopra il valore grande.
 */
export function cssFoglio(t: TemaFattura): string {
  return `
.fd-foglio { box-sizing: border-box; width: 210mm; padding: 14mm 16mm; -webkit-box-decoration-break: clone; box-decoration-break: clone; background: #ffffff; color: #1e293b; font-family: Inter, "Helvetica Neue", Helvetica, Arial, sans-serif; font-size: 9pt; line-height: 1.45; font-variant-numeric: tabular-nums; text-align: left; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.fd-foglio *, .fd-foglio *::before, .fd-foglio *::after { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.fd-foglio table { border-collapse: collapse; border-spacing: 0; }
.fd-foglio th, .fd-foglio td { vertical-align: top; }
.fd-testata { display: flex; justify-content: space-between; align-items: flex-start; gap: 8mm; }
.fd-emittente { flex: 1 1 auto; min-width: 0; }
.fd-foglio .fd-logo { display: block; height: 22mm; width: auto; max-width: 70mm; object-fit: contain; object-position: left center; margin: 0 0 3mm; }
.fd-ragione { font-size: 13pt; font-weight: 700; line-height: 1.2; color: #0f172a; }
.fd-forma { margin-top: 0.4mm; font-size: 8pt; color: #64748b; }
.fd-dati { margin-top: 1.4mm; font-size: 7.8pt; line-height: 1.55; color: #475569; }
.fd-documento { flex: 0 0 82mm; min-width: 0; text-align: right; }
.fd-tipo { font-size: 19pt; font-weight: 800; line-height: 1.08; letter-spacing: 0.04em; color: ${t.accentoTesto}; }
.fd-estremi { display: grid; grid-template-columns: auto auto; justify-content: end; align-items: baseline; column-gap: 4mm; row-gap: 0.9mm; margin-top: 2.6mm; }
.fd-voce { text-align: right; font-size: 7.8pt; font-weight: 500; color: #64748b; white-space: nowrap; }
.fd-valore { text-align: right; font-size: 9pt; font-weight: 600; color: #0f172a; white-space: nowrap; }
.fd-valore.fd-numero { font-size: 11pt; font-weight: 700; }
.fd-voce.fd-evidenza { font-weight: 600; color: #475569; }
.fd-valore.fd-evidenza { font-size: 11pt; font-weight: 800; color: ${t.accentoTesto}; }
.fd-riquadro { border: 1px solid #e2e8f0; border-radius: 2mm; padding: 3.4mm 4.2mm; }
.fd-destinatario { margin-top: 4mm; text-align: left; }
.fd-etichetta { margin-bottom: 1.2mm; font-size: 6.8pt; font-weight: 600; line-height: 1.3; letter-spacing: 0.08em; text-transform: uppercase; color: #64748b; }
.fd-cliente { margin-bottom: 0.8mm; font-size: 10.5pt; font-weight: 700; line-height: 1.25; color: #0f172a; }
.fd-cliente-dati { font-size: 8pt; line-height: 1.55; color: #475569; }
.fd-filetto { height: 0; margin: 5mm 0; border: 0; border-top: 2px solid ${t.accento}; }
.fd-riferimenti { margin: 0 0 5mm; padding: 2.4mm 4.5mm; border: 1px solid #e2e8f0; border-radius: 2mm; background: #f8fafc; font-size: 8pt; color: #334155; }
.fd-avviso { margin: 0 0 5mm; padding: 2.4mm 4.5mm; border: 1px solid #fde68a; border-radius: 2mm; background: #fffbeb; font-size: 8pt; color: #92400e; }
.fd-voci { width: 100%; font-size: 8.6pt; }
.fd-voci th { padding: 2mm 2mm; border-bottom: 1.5px solid ${t.accento}; background: ${t.tinta}; text-align: left; font-size: 6.8pt; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #475569; white-space: nowrap; }
.fd-voci td { padding: 1.9mm 2mm; border-bottom: 1px solid #e2e8f0; color: #1e293b; }
.fd-voci tr { break-inside: avoid; page-break-inside: avoid; }
.fd-voci .fd-n { width: 7mm; color: #94a3b8; }
.fd-voci .fd-descrizione { overflow-wrap: anywhere; }
.fd-foglio .fd-d { text-align: right; white-space: nowrap; }
.fd-foglio .fd-c { text-align: center; white-space: nowrap; }
.fd-voci td.fd-importo { font-weight: 600; color: #0f172a; }
.fd-sotto { margin-top: 0.6mm; font-size: 7.4pt; color: #64748b; }
.fd-sotto-nota { font-style: italic; }
.fd-conti { display: flex; justify-content: space-between; align-items: flex-start; gap: 8mm; margin-top: 5mm; break-inside: avoid; page-break-inside: avoid; }
.fd-riepilogo { flex: 1 1 auto; min-width: 0; }
.fd-riepilogo table { width: 100%; font-size: 8.2pt; }
.fd-riepilogo th { padding: 1.3mm 2mm; border-bottom: 1px solid #cbd5e1; text-align: left; font-size: 6.8pt; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #64748b; }
.fd-riepilogo td { padding: 1.5mm 2mm; border-bottom: 1px solid #eef2f6; color: #334155; }
.fd-totali { flex: 0 0 82mm; margin-left: auto; }
.fd-totali table { width: 100%; font-size: 9pt; }
.fd-totali td { padding: 1.3mm 2.5mm; color: #334155; white-space: nowrap; }
.fd-totali td.fd-d { color: #0f172a; }
.fd-totali .fd-totale td { padding-top: 2.2mm; border-top: 1.5px solid #0f172a; font-size: 10pt; font-weight: 700; color: #0f172a; }
.fd-totali .fd-finale td { padding-top: 2.4mm; padding-bottom: 2.4mm; background: ${t.tinta}; font-size: 12pt; font-weight: 800; color: ${t.accentoTesto}; }
.fd-totali .fd-finale td:first-child { border-radius: 1.5mm 0 0 1.5mm; }
.fd-totali .fd-finale td:last-child { border-radius: 0 1.5mm 1.5mm 0; }
.fd-totali .fd-stacco td { height: 1.6mm; padding: 0; }
.fd-info { display: flex; align-items: stretch; gap: 6mm; margin-top: 6mm; break-inside: avoid; page-break-inside: avoid; }
.fd-info > .fd-riquadro { flex: 1 1 0; min-width: 0; font-size: 8.2pt; line-height: 1.55; color: #334155; }
.fd-metodo { margin-bottom: 1mm; font-size: 9pt; font-weight: 600; color: #0f172a; }
.fd-iban { font-family: "SF Mono", Menlo, Consolas, "Liberation Mono", monospace; font-size: 8.6pt; font-weight: 600; letter-spacing: 0.02em; color: #0f172a; }
.fd-rate { width: 100%; margin-top: 2mm; font-size: 8pt; }
.fd-rate th { padding: 1mm 2mm 1mm 0; border-bottom: 1px solid #e2e8f0; text-align: left; font-size: 6.8pt; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #64748b; }
.fd-rate td { padding: 1mm 2mm 1mm 0; border-bottom: 1px solid #f1f5f9; }
.fd-testo { white-space: pre-wrap; overflow-wrap: anywhere; }
.fd-avvertenze { margin-top: 5mm; font-size: 7.6pt; line-height: 1.5; color: #475569; break-inside: avoid; page-break-inside: avoid; }
.fd-avvertenze .fd-etichetta { margin-bottom: 0.8mm; }
.fd-forfettario { margin-top: 3mm; font-size: 7.2pt; line-height: 1.5; font-style: italic; color: #64748b; }
.fd-cortesia { margin-top: 3mm; font-size: 7.2pt; line-height: 1.5; color: #94a3b8; }
.fd-piede { display: flex; justify-content: space-between; gap: 6mm; margin-top: 7mm; padding-top: 2.6mm; border-top: 1px solid #e2e8f0; font-size: 7pt; color: #94a3b8; break-inside: avoid; page-break-inside: avoid; }
`;
}

/**
 * Le regole della PAGINA, solo per il documento che si stampa (mai dentro l'app).
 *
 * Margine di pagina ZERO: Chrome offre «Intestazioni e piè di pagina» (data e
 * ora, titolo della scheda, indirizzo dell'app, «1/1») solo quando il documento
 * lascia un margine di pagina sopra o sotto; con margine zero l'opzione non
 * compare e il PDF esce pulito. Verificato sull'anteprima di stampa di Chrome
 * 154 il 12/10/2026. Il respiro lo dà il foglio (vedi cssFoglio).
 *
 * Inter arriva dai file dell'app (`/fonts`): il documento si stampa da una
 * pagina dell'app, quindi l'indirizzo relativo porta lì. Altrove vale il
 * carattere di sistema.
 */
export const CSS_PAGINA_STAMPA = `
@font-face { font-family: "Inter"; font-style: normal; font-weight: 100 900; font-display: block; src: url("/fonts/inter-latin-wght-normal.woff2") format("woff2"); unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD; }
@font-face { font-family: "Inter"; font-style: normal; font-weight: 100 900; font-display: block; src: url("/fonts/inter-latin-ext-wght-normal.woff2") format("woff2"); unicode-range: U+0100-02AF,U+0304,U+0308,U+0329,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF; }
@page { size: A4; margin: 0; }
html, body { margin: 0; padding: 0; background: #ffffff; }
@media print { .fd-foglio { width: auto; } }
@media screen { body { background: #e5e7eb; } .fd-foglio { margin: 24px auto; min-height: 297mm; box-shadow: 0 1px 3px rgba(15, 23, 42, 0.12), 0 10px 30px rgba(15, 23, 42, 0.1); } }
`;
