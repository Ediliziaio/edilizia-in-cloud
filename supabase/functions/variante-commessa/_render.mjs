// src/lib/orders/variationDraft.ts
var VARIATION_KINDS = {
  aggiunta: "Lavori aggiuntivi",
  modifica: "Modifica o sostituzione",
  riduzione: "Riduzione dei lavori"
};
function emptyVariationDraft() {
  return {
    kind: "aggiunta",
    title: "",
    description: "",
    phase: "",
    pricing: "corpo",
    amount: "",
    lines: [],
    days: "0",
    dayUnit: "calendario",
    reason: "",
    requester: "",
    internalNotes: "",
    estimatedCost: "",
    contractReference: "",
    paymentTerms: "",
    documentCompanyName: "",
    documentCompanyDetails: "",
    documentCustomerName: "",
    documentCustomerDetails: ""
  };
}
function variationDecimal(raw) {
  const text = raw.trim();
  if (!/^-?\d+(?:[.,]\d{1,2})?$/.test(text)) return null;
  const value = Number(text.replace(",", "."));
  return Number.isFinite(value) && Math.abs(value) <= 9999999999e-2 ? value : null;
}
var round = (n) => Math.sign(n) * Math.round((Math.abs(n) + Number.EPSILON) * 100) / 100;
var euro = (n) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
function prepareVariation(draft) {
  if (!draft.title.trim()) throw new Error("Scrivi il titolo della variante.");
  if (!draft.description.trim()) throw new Error("Descrivi cosa cambia rispetto al contratto.");
  let amount = variationDecimal(draft.amount);
  const detail = [];
  if (draft.pricing === "voci") {
    if (!draft.lines.length) throw new Error("Aggiungi almeno una voce oppure scegli il prezzo a corpo.");
    amount = 0;
    for (const [i, line] of draft.lines.entries()) {
      const quantity = variationDecimal(line.quantity), price = variationDecimal(line.price);
      if (!line.description.trim() || quantity === null || quantity <= 0 || price === null)
        throw new Error(`Completa descrizione, quantit\xE0 e prezzo della voce ${i + 1}.`);
      if (draft.kind !== "modifica" && price < 0) throw new Error("Per aggiunte e riduzioni inserisci prezzi positivi.");
      const subtotal = round(quantity * price);
      amount = round(amount + subtotal);
      detail.push(`${i + 1}. ${line.description.trim()} - ${quantity}${line.unit?.trim() ? ` ${line.unit.trim()}` : ""} x ${euro(price)} = ${euro(subtotal)}`);
    }
  }
  if (amount === null || !Number.isFinite(amount) || Math.abs(amount) > 9999999999e-2)
    throw new Error("Inserisci un importo valido, con al massimo due decimali.");
  if (draft.kind !== "modifica" && amount < 0) throw new Error("Inserisci un importo positivo: la riduzione viene sottratta automaticamente.");
  const signedAmount = draft.kind === "riduzione" ? -amount : amount;
  if (!/^\d+$/.test(draft.days.trim()) || !Number.isSafeInteger(Number(draft.days)) || Number(draft.days) > 3650)
    throw new Error("Indica da 0 a 3650 giorni interi aggiuntivi.");
  const days = Number(draft.days);
  const estimatedCost = draft.estimatedCost?.trim() ? variationDecimal(draft.estimatedCost) : null;
  if (draft.estimatedCost?.trim() && estimatedCost === null) throw new Error("Controlla la variazione di costo prevista.");
  const description = [
    VARIATION_KINDS[draft.kind],
    draft.phase.trim() ? `Lavorazione di riferimento: ${draft.phase.trim()}` : "",
    draft.contractReference?.trim() ? `Preventivo / contratto di riferimento: ${draft.contractReference.trim()}` : "",
    draft.documentIntro?.trim() || "",
    draft.description.trim(),
    detail.length ? `Dettaglio economico (IVA esclusa):
${detail.join("\n")}` : "",
    draft.additionalTerms?.trim() ? `Condizioni specifiche della variante:
${draft.additionalTerms.trim()}` : "",
    draft.paymentTerms?.trim() ? `Pagamento dei lavori extra: ${draft.paymentTerms.trim()}` : "",
    days ? `Tempo aggiuntivo richiesto: ${days} giorni ${draft.dayUnit}. Le date saranno ripianificate separatamente dopo l'approvazione.` : "Nessuna estensione dei tempi richiesta."
  ].filter(Boolean).join("\n\n");
  return {
    titolo: draft.title.trim(),
    descrizione: description,
    motivazione: draft.reason.trim() || null,
    impatto_economico: round(signedAmount),
    impatto_giorni: days,
    // Existing customer SELECT policy exposes the whole row, including note_interne.
    // Until private storage is separated server-side, do not persist private draft data here.
    richiesto_da: draft.requester.trim() || null,
    note_interne: null
  };
}
var CONDIZIONI_STANDARD_VARIANTE = [
  "La presente variante integra il contratto di riferimento: per tutto ci\xF2 che non modifica restano valide le condizioni gi\xE0 concordate.",
  "Ha effetto solo con la firma delle parti: fino ad allora non cambia n\xE9 l'importo del contratto n\xE9 i tempi dei lavori.",
  "Sono compresi solo i lavori descritti qui. Ogni ulteriore modifica richiede una nuova variante scritta.",
  "Gli importi sono IVA esclusa, salvo dove indicato. L'IVA \xE8 applicata con l'aliquota di legge alla data della fattura."
];
function variationDocumentParts(draft) {
  const prepared = prepareVariation(draft);
  const segno = draft.kind === "riduzione" ? -1 : 1;
  const righe = draft.pricing === "voci" ? draft.lines.map((line) => {
    const quantita = variationDecimal(line.quantity), prezzo = variationDecimal(line.price);
    return { descrizione: line.description.trim(), quantita, unita: line.unit?.trim() ?? "", prezzo, importo: segno * round(quantita * prezzo) };
  }) : [{ descrizione: draft.title.trim(), quantita: null, unita: "a corpo", prezzo: null, importo: prepared.impatto_economico }];
  const giorni = prepared.impatto_giorni;
  return {
    tipo: VARIATION_KINDS[draft.kind],
    riferimento: draft.contractReference?.trim() ?? "",
    fase: draft.phase.trim(),
    lavori: [draft.documentIntro?.trim(), draft.description.trim()].filter(Boolean).join("\n\n"),
    righe,
    condizioni: draft.additionalTerms?.trim() ?? "",
    pagamento: draft.paymentTerms?.trim() ?? "",
    tempi: giorni ? `Tempo aggiuntivo richiesto: ${giorni} giorni ${draft.dayUnit}. Le date saranno ripianificate separatamente dopo l'approvazione.` : "Nessuna estensione dei tempi richiesta."
  };
}
function variationImpact(currentNet, delta, vatRate) {
  if (!Number.isFinite(delta)) return null;
  const rate = vatRate !== void 0 && Number.isFinite(vatRate) && vatRate >= 0 && vatRate <= 100 ? vatRate : null;
  const current = currentNet !== void 0 && Number.isFinite(currentNet) ? currentNet : null;
  return {
    delta,
    vat: rate === null ? null : round(delta * rate / 100),
    grossDelta: rate === null ? null : round(delta * (1 + rate / 100)),
    revisedNet: current === null ? null : round(current + delta),
    rate
  };
}

// src/lib/orders/pendingVariationDocument.ts
function variationEventDate(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)) return null;
  const day = value.slice(0, 10);
  const calendarDate = /* @__PURE__ */ new Date(`${day}T12:00:00Z`);
  if (!Number.isFinite(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== day) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" }) : null;
}

// supabase/functions/_shared/logoCopertinaRenova.ts
var LOGO_COPERTINA_RENOVA = "data:image/png;base64,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";

// supabase/functions/_shared/personalizzazioneDocumenti.ts
var SENZA_PERSONALIZZAZIONE = Object.freeze({
  logoAltezza: null,
  logoLarghezzaMax: null,
  logoCopertinaAltezza: null,
  logoCopertinaLarghezzaMax: null,
  piedeFont: null,
  piedeColore: null,
  piedeRighe: null,
  logoCopertinaUrl: null,
  copertina: null
});
var IMPRESA_VULCANO = "7c87c209-7868-42d0-ad98-6c95ac6de196";
var RENOVA_SOLUTION = "f2a16dd8-36c3-4d92-8d78-267d6374dcb5";
var FONT_EB_GARAMOND = "EB Garamond";
var VESTE_VULCANO = Object.freeze({
  logoAltezza: 55,
  logoLarghezzaMax: 340,
  logoCopertinaAltezza: 75,
  logoCopertinaLarghezzaMax: 460,
  piedeFont: FONT_EB_GARAMOND,
  piedeColore: "#1C1650",
  // Dall'esempio del titolare (10/11/2026), parola per parola: «–» nelle sedi, «/» fra le due, quattro spazi fra
  // P.IVA e telefono. L'email in azzurro sottolineata, come nell'esempio; il resto nel blu del piè.
  piedeRighe: Object.freeze([
    { titolo: true, parti: [{ testo: "Impresa Vulcano s.r.l." }] },
    { parti: [{ testo: "Sede Legale: Via Marconi, 35 \u2013 Lonate Pozzolo (VA) / Sede Operativa: Via dei Mille, 3 \u2013 Vanzaghello (MI)" }] },
    { parti: [{ testo: "info@impresavulcano.it", colore: "#3B82C4", sottolineato: true }, { testo: " - www.impresavulcano.it" }] },
    { parti: [{ testo: "C.F./P.IVA 06923340969    tel. 0331/1409144" }] }
  ]),
  logoCopertinaUrl: null,
  copertina: null
});
var VESTE_RENOVA = Object.freeze({
  ...SENZA_PERSONALIZZAZIONE,
  logoCopertinaAltezza: 100,
  logoCopertinaLarghezzaMax: 260,
  logoCopertinaUrl: LOGO_COPERTINA_RENOVA,
  copertina: Object.freeze({ fondo: "#FFFFFF", testo: "#1F2937", titolo: "#111827", occhiello: "#5A7300", sottotitolo: "#374151" })
});
function personalizzazioneDocumento(companyId) {
  if (companyId === IMPRESA_VULCANO) return VESTE_VULCANO;
  if (companyId === RENOVA_SOLUTION) return VESTE_RENOVA;
  return SENZA_PERSONALIZZAZIONE;
}
var testoRigaPiede = (r) => r.parti.map((p) => p.testo).join("");
var LARGHEZZA_RIGA_LUNGA_A_CORPO_1 = 43.3;
function misurePiede(veste, larghezzaUtile) {
  const righe = veste.piedeRighe;
  if (!righe?.length) return null;
  const corpo = Math.min(7, Math.floor(larghezzaUtile / LARGHEZZA_RIGA_LUNGA_A_CORPO_1 * 4) / 4);
  const corpoTitolo = 10.5;
  const rigaTitolo = corpoTitolo * 1.15;
  const riga = corpo * 1.25;
  const altezza = righe.reduce((s, r) => s + (r.titolo ? rigaTitolo : riga), 0);
  const corpoPagina = 6.5;
  const cimaPaginaDalFondo = 20;
  const fondoRigheDalFondo = cimaPaginaDalFondo + 1;
  return { corpoTitolo, corpo, rigaTitolo, riga, altezza, corpoPagina, cimaPaginaDalFondo, fondoRigheDalFondo, ingombro: fondoRigheDalFondo + altezza };
}
var BIANCO_SOPRA_PIEDE = 8;
function disegnaPiedeJsPdf(pdf, veste, o) {
  const righe = veste.piedeRighe;
  const m = misurePiede(veste, o.larghezzaUtile * 72 / 25.4);
  if (!righe?.length || !m) return;
  const testo = (t) => o.pulisci ? o.pulisci(t) : t;
  const colore2 = veste.piedeColore ?? "#1C1650";
  pdf.setFont(o.font, "normal");
  let corpo = m.corpo;
  pdf.setFontSize(corpo);
  const piuLunga = Math.max(...righe.filter((r) => !r.titolo).map((r) => pdf.getTextWidth(testo(testoRigaPiede(r)))));
  if (piuLunga > o.larghezzaUtile) corpo = corpo * o.larghezzaUtile / piuLunga;
  const mm = (punti) => punti * 25.4 / 72;
  const fondoFoglio = 297;
  let fondo = fondoFoglio - mm(m.fondoRigheDalFondo);
  const basi = [];
  for (let i = righe.length - 1; i >= 0; i--) {
    const alta = righe[i].titolo ? m.rigaTitolo : corpo * 1.25;
    basi[i] = fondo - mm(alta * 0.27);
    fondo -= mm(alta);
  }
  righe.forEach((r, i) => {
    const c = r.titolo ? m.corpoTitolo : corpo;
    pdf.setFontSize(c);
    const pezzi = r.parti.map((p) => ({ ...p, testo: testo(p.testo), larghezza: 0 }));
    for (const p of pezzi) p.larghezza = pdf.getTextWidth(p.testo);
    let x = 105 - pezzi.reduce((s, p) => s + p.larghezza, 0) / 2;
    for (const p of pezzi) {
      pdf.setTextColor(p.colore ?? colore2);
      pdf.text(p.testo, x, basi[i]);
      if (p.sottolineato) {
        pdf.setDrawColor(p.colore ?? colore2);
        pdf.setLineWidth(mm(c * 0.05));
        pdf.line(x, basi[i] + mm(c * 0.12), x + p.larghezza, basi[i] + mm(c * 0.12));
      }
      x += p.larghezza;
    }
  });
  pdf.setFontSize(m.corpoPagina);
  pdf.setTextColor(colore2);
  pdf.text(testo(o.pagina), 105, fondoFoglio - mm(m.cimaPaginaDalFondo) + mm(m.corpoPagina * 0.8), { align: "center" });
}
function limiteContenutoJsPdf(veste, larghezzaUtileMm, limite) {
  const m = misurePiede(veste, larghezzaUtileMm * 72 / 25.4);
  if (!m) return limite;
  return Math.min(limite, 297 - (m.ingombro + BIANCO_SOPRA_PIEDE) * 25.4 / 72);
}
var puntiInMm = (punti) => punti * 25.4 / 72;
var PERCORSO_FONT_PIEDE = "/fonts/EBGaramond-Regular.ttf?v=2";
function urlFontPiede() {
  try {
    const origine = globalThis.location?.origin;
    if (origine && /^https?:/.test(origine)) return `${origine}${PERCORSO_FONT_PIEDE}`;
  } catch {
  }
  return `https://app.ediliziaincloud.com${PERCORSO_FONT_PIEDE}`;
}
var fontBase64 = null;
function fontPiedeBase64() {
  fontBase64 ??= (async () => {
    try {
      const risposta = await fetch(urlFontPiede(), { signal: AbortSignal.timeout(8e3) });
      if (!risposta.ok) throw new Error(String(risposta.status));
      const byte = new Uint8Array(await risposta.arrayBuffer());
      if (byte[0] !== 0 || byte[1] !== 1) throw new Error("non \xE8 un TTF");
      let binario = "";
      for (let i = 0; i < byte.length; i += 8192) binario += String.fromCharCode(...byte.subarray(i, i + 8192));
      return btoa(binario);
    } catch {
      fontBase64 = null;
      return null;
    }
  })();
  return fontBase64;
}

// supabase/functions/_shared/stileDocumenti.ts
var colore = Object.freeze({
  /** Testo principale. */
  inchiostro: "#1F2933",
  /** Etichette, note, intestazioni di tabella. */
  testoTenue: "#6B7280",
  /** Filetti e bordi. */
  linea: "#E3E6EB",
  /** Fondo di riquadri e righe di raggruppamento. */
  fondoTenue: "#F7F8FA",
  /** Fondo dell'intestazione delle tabelle. */
  fondoIntestazione: "#EEF1F5",
  /** Stato positivo (firmato, approvato). */
  positivo: "#1F7A4D",
  /** Avviso (fuori contratto, da verificare). */
  avviso: "#B45309",
  /** Accento predefinito, se l'azienda non ne ha uno. */
  accentoPredefinito: "#1E3A5F"
});
var pagina = Object.freeze({
  margineLaterale: 40,
  margineAlto: 36,
  corpo: 9.5,
  interlinea: 1.4,
  nota: 8
});
var testata = Object.freeze({
  /** Logo senza veste: alto fino a 44 pt, largo fino a 200 pt, proporzioni conservate. */
  logoAltezza: 44,
  logoLarghezzaMax: 200,
  ragioneSocialeCorpo: 13,
  titoloCorpo: 14,
  sottotitoloCorpo: 9,
  filettoSpessore: 1.5,
  filettoDistanza: 10,
  spazioDopo: 16
});
var sezione = Object.freeze({ corpo: 8, spaziatura: 1, spazioPrima: 14, spazioDopo: 6, filetto: 0.75 });
var tabella = Object.freeze({
  intestazioneCorpo: 7.5,
  corpo: 9,
  altezzaRigaMin: 18,
  filetto: 0.5,
  filettoTotale: 0.75,
  paddingOrizzontale: 6
});
var riquadro = Object.freeze({ bordo: 0.75, raggio: 3, padding: 10, etichettaCorpo: 7.5, valoreCorpo: 10, numeroCorpo: 14 });
function esadecimale(v) {
  const s = (v ?? "").trim();
  return /^#[0-9a-f]{6}$/i.test(s) ? s.toUpperCase() : null;
}
function luminanza(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function accentoDocumento(opz) {
  for (const c of [esadecimale(opz.coloreVeste), esadecimale(opz.coloreAzienda)]) {
    if (c && 1.05 / (luminanza(c) + 0.05) >= 4.5) return c;
  }
  return colore.accentoPredefinito;
}
function rgb255(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

// src/lib/orders/variationPreviewPdf.ts
function variationPdfFilename(orderCode, title) {
  const part = (value) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 65);
  return `variante-${part(orderCode || "commessa")}-${part(title) || "lavori-extra"}.pdf`;
}
function variationProposalPdf(variation, context) {
  if (!context.companyName?.trim() || !context.customerName?.trim()) throw new Error("Completa impresa e cliente in \xABDati del documento e pagamento\xBB prima di preparare il PDF.");
  return buildVariationPdf(variation, context, "proposta");
}
async function buildVariationPdf(variation, context, mode) {
  if (!variation.titolo.trim() || !variation.descrizione.trim() || !Number.isFinite(variation.impatto_economico)) throw new Error("Controlla titolo, descrizione e importo del documento.");
  if (variation.impatto_giorni !== void 0 && (!Number.isSafeInteger(variation.impatto_giorni) || variation.impatto_giorni < 0 || variation.impatto_giorni > 3650)) throw new Error("Giorni aggiuntivi non validi.");
  if (variation.impatto_giorni !== void 0 && ([...variation.descrizione.matchAll(/Tempo aggiuntivo richiesto: (\d+) giorni/g)].some((match) => Number(match[1]) !== variation.impatto_giorni) || variation.impatto_giorni > 0 && variation.descrizione.includes("Nessuna estensione dei tempi richiesta."))) throw new Error("Tempi incoerenti tra descrizione e giorni registrati: verifica la variante.");
  const impact = variationImpact(context.currentNet, variation.impatto_economico, context.vatRate);
  if (impact?.revisedNet !== null && impact?.revisedNet !== void 0 && (context.currentNet < 0 || impact.revisedNet < 0)) throw new Error("La riduzione supera il valore del contratto: verifica l'importo.");
  const { jsPDF } = await import("npm:jspdf@4.2.1");
  const doc = new jsPDF({ compress: !!context.logo });
  const veste = personalizzazioneDocumento(context.companyId);
  const accent = rgb255(accentoDocumento({ coloreVeste: veste.piedeColore, coloreAzienda: context.primaryColor }));
  const INK = rgb255(colore.inchiostro), GREY = rgb255(colore.testoTenue), LINE = rgb255(colore.linea), PALE = rgb255(colore.fondoTenue), HEAD = rgb255(colore.fondoIntestazione);
  const mm = puntiInMm;
  const piedeProprio = Boolean(veste.piedeRighe && context.societarie?.length);
  const LEFT = mm(pagina.margineLaterale), RIGHT = 210 - LEFT, WIDTH = RIGHT - LEFT;
  const righePiede = (context.societarie?.length ? context.societarie : [context.companyName, ...(context.companyDetails ?? "").split("\n")]).map((r) => (r ?? "").trim()).filter(Boolean).slice(0, 4);
  const cimaPiede = 297 - mm(32 + 5 + righePiede.length * 9.5) - mm(12);
  const BOTTOM = piedeProprio ? limiteContenutoJsPdf(veste, WIDTH, cimaPiede) : cimaPiede;
  const fontPiede = veste.piedeFont && context.societarie?.length ? await fontPiedeBase64() : null;
  if (fontPiede) {
    doc.addFileToVFS("EBGaramond-Regular.ttf", fontPiede);
    doc.addFont("EBGaramond-Regular.ttf", "EBGaramond", "normal");
  }
  let y = mm(pagina.margineAlto);
  const clean = (text) => text.replace(/[‐-―−]/g, "-").replace(/[  ]/g, " ");
  const money = (amount) => clean(new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: true }).format(amount));
  const number = (n) => clean(n.toLocaleString("it-IT", { maximumFractionDigits: 2, useGrouping: true }));
  const font = (size, bold = false, color = INK) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };
  const lines = (text, width) => doc.splitTextToSize(clean(text), width);
  const parts = context.parti;
  const heading = context.documentHeading?.trim().slice(0, 120) || (mode === "proposta" ? "Variante al contratto" : "Lavori extra e varianti");
  const number_odv = context.proposalNumber;
  if (number_odv !== void 0 && (!Number.isSafeInteger(number_odv) || number_odv < 1)) throw new Error("Numero OdV non valido.");
  const registeredDate = variationEventDate(context.proposalRegisteredAt);
  const today = (/* @__PURE__ */ new Date()).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" });
  const continuation = () => {
    doc.addPage();
    const top2 = mm(pagina.margineAlto);
    font(8, true);
    doc.text(lines(context.companyName || heading, 110)[0], LEFT, top2);
    font(8, false, GREY);
    doc.text(clean([heading, context.orderCode, number_odv !== void 0 ? `OdV #${number_odv}` : ""].filter(Boolean).join(" - ")), RIGHT, top2, { align: "right" });
    doc.setDrawColor(...accent);
    doc.setLineWidth(mm(testata.filettoSpessore));
    doc.line(LEFT, top2 + 2.5, RIGHT, top2 + 2.5);
    doc.setLineWidth(0.2);
    y = top2 + 2.5 + mm(testata.spazioDopo);
  };
  const room = (height) => {
    if (y + height > BOTTOM) continuation();
  };
  function write(text, size = pagina.corpo, color = INK, bold = false, lineHeight = mm(size * pagina.interlinea)) {
    font(size, bold, color);
    for (const line of lines(text, WIDTH)) {
      room(lineHeight);
      font(size, bold, color);
      doc.text(line, LEFT, y);
      y += lineHeight;
    }
    y += 1.5;
  }
  const section = (title) => {
    room(14);
    y += mm(sezione.spazioPrima);
    font(sezione.corpo, true, accent);
    doc.text(clean(title.toUpperCase()), LEFT, y, { charSpace: mm(sezione.spaziatura) });
    y += 1.6;
    doc.setDrawColor(...LINE);
    doc.setLineWidth(mm(sezione.filetto));
    doc.line(LEFT, y, RIGHT, y);
    doc.setLineWidth(0.2);
    y += mm(sezione.spazioDopo) + 2.6;
  };
  const etichetta = (testo, xDestra, base) => {
    font(7, true, GREY);
    const t = clean(testo.toUpperCase());
    const w = doc.getTextWidth(t) + 4;
    doc.setFillColor(...PALE);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(mm(0.75));
    doc.roundedRect(xDestra - w, base - 3.2, w, 4.6, 1, 1, "FD");
    doc.setLineWidth(0.2);
    doc.text(t, xDestra - 2, base, { align: "right" });
  };
  const top = y;
  let fondoSinistra = top;
  let conLogo = false;
  if (context.logo) {
    try {
      const image = doc.getImageProperties(context.logo);
      const scale = Math.min(mm(veste.logoLarghezzaMax ?? testata.logoLarghezzaMax) / image.width, mm(veste.logoAltezza ?? testata.logoAltezza) / image.height), width = image.width * scale, height = image.height * scale;
      doc.addImage(context.logo, image.fileType, LEFT, top, width, height);
      fondoSinistra = top + height;
      conLogo = true;
    } catch {
    }
  }
  if (!conLogo) {
    font(testata.ragioneSocialeCorpo, true);
    doc.text(lines(context.companyName || "Impresa", WIDTH * 0.55)[0], LEFT, top + mm(testata.ragioneSocialeCorpo));
    fondoSinistra = top + mm(testata.ragioneSocialeCorpo) + 1.5;
  }
  let yd = top + mm(testata.titoloCorpo) * 0.85;
  font(testata.titoloCorpo, true);
  const titoloRighe = lines(heading, WIDTH * 0.5);
  titoloRighe.forEach((r, i) => doc.text(r, RIGHT, yd + i * mm(testata.titoloCorpo * 1.2), { align: "right" }));
  yd += (titoloRighe.length - 1) * mm(testata.titoloCorpo * 1.2) + mm(testata.sottotitoloCorpo) * 1.5;
  font(testata.sottotitoloCorpo, false, GREY);
  doc.text(clean(number_odv !== void 0 ? `OdV #${number_odv} del ${registeredDate ?? today}` : `del ${today}`), RIGHT, yd, { align: "right" });
  yd += 5.2;
  etichetta(mode === "proposta" ? "Da approvare - Documento non firmato" : "Anteprima bozza - Non salvata, non inviata, non firmata", RIGHT, yd);
  yd += 1.6;
  y = Math.max(fondoSinistra, yd) + mm(testata.filettoDistanza);
  doc.setDrawColor(...accent);
  doc.setLineWidth(mm(testata.filettoSpessore));
  doc.line(LEFT, y, RIGHT, y);
  doc.setLineWidth(0.2);
  y += mm(testata.spazioDopo) + 1;
  if (number_odv !== void 0 && !context.archivedOriginal) {
    write(registeredDate ? `Proposta registrata il: ${registeredDate}` : "Data di registrazione non disponibile.", pagina.nota, GREY);
    write("Ristampa della proposta dai dati registrati e dall'anagrafica attuale. Non e' una copia dell'originale inviato, ne' un documento firmato.", pagina.nota, GREY);
  }
  const pad = mm(riquadro.padding), raggio = mm(riquadro.raggio);
  if (mode === "proposta" || context.customerName) {
    const half = (WIDTH - mm(10)) / 2;
    const dettagli = (detail) => {
      font(9);
      return lines(detail, half - pad * 2).slice(0, 4);
    };
    const impresa = dettagli(context.companyDetails ?? ""), cliente = dettagli(context.customerAddress ?? "");
    const height = pad * 2 + 3 + 4.6 + Math.max(impresa.length, cliente.length) * 3.9;
    const box = (x, label, name, detailLines) => {
      doc.setFillColor(...PALE);
      doc.setDrawColor(...LINE);
      doc.setLineWidth(mm(riquadro.bordo));
      doc.roundedRect(x, y, half, height, raggio, raggio, "FD");
      doc.setLineWidth(0.2);
      font(riquadro.etichettaCorpo, false, GREY);
      doc.text(label.toUpperCase(), x + pad, y + pad + 1.8);
      font(riquadro.valoreCorpo, true);
      doc.text(lines(name, half - pad * 2)[0] ?? "", x + pad, y + pad + 6.6);
      font(9);
      detailLines.forEach((line, i) => doc.text(line, x + pad, y + pad + 10.6 + i * 3.9));
      return height;
    };
    const a = box(LEFT, "Impresa", context.companyName || "-", impresa);
    const b = box(LEFT + half + mm(10), "Committente", context.customerName || "-", cliente);
    y += Math.max(a, b) + 3.5;
  }
  const refs = [["Commessa", context.orderCode], ["Cantiere", context.siteAddress], ["Contratto di riferimento", parts?.riferimento], ["Lavorazione", parts?.fase], ["Richiesto da", variation.richiesto_da]].filter((r) => !!r[1]?.trim());
  if (refs.length) {
    const perRow = Math.min(refs.length, 3), cell = (WIDTH - pad * 2) / perRow, rows2 = Math.ceil(refs.length / perRow);
    const h = pad * 2 + rows2 * 9 - 2;
    doc.setFillColor(...PALE);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(mm(riquadro.bordo));
    doc.roundedRect(LEFT, y, WIDTH, h, raggio, raggio, "FD");
    doc.setLineWidth(0.2);
    refs.forEach(([label, value], i) => {
      const x = LEFT + pad + i % perRow * cell, t = y + pad + 1.8 + Math.floor(i / perRow) * 9;
      font(riquadro.etichettaCorpo, false, GREY);
      doc.text(label.toUpperCase(), x, t);
      font(9);
      doc.text(lines(value, cell - 4)[0], x, t + 4.2);
    });
    y += h + 2;
  }
  section(`Oggetto${parts ? ` - ${parts.tipo}` : ""}`);
  write(variation.titolo, 10.5, INK, true, 5);
  write(parts ? parts.lavori : variation.descrizione);
  if (variation.motivazione) {
    write("Motivazione", pagina.nota, GREY, true);
    write(variation.motivazione);
  }
  if (!parts && variation.impatto_giorni !== void 0 && !/Tempo aggiuntivo richiesto:|Nessuna estensione dei tempi richiesta\./.test(variation.descrizione)) {
    write(variation.impatto_giorni ? `Tempo aggiuntivo richiesto: ${variation.impatto_giorni} giorni. Il dato registrato non specifica se lavorativi o di calendario: concordarlo prima di firmare.` : "Nessuna estensione dei tempi richiesta.");
  }
  const rows = parts?.righe ?? [{ descrizione: variation.titolo, quantita: null, unita: "a corpo", prezzo: null, importo: variation.impatto_economico }];
  const col = { n: LEFT + 2, desc: LEFT + 9, qty: 133, um: 136, price: 167, amount: RIGHT - 2 };
  const RIGA_MIN = mm(tabella.altezzaRigaMin);
  const tableHead = () => {
    doc.setFillColor(...HEAD);
    doc.rect(LEFT, y, WIDTH, 6.5, "F");
    font(tabella.intestazioneCorpo, true, GREY);
    doc.text("N.", col.n, y + 4.4);
    doc.text("DESCRIZIONE", col.desc, y + 4.4);
    doc.text("Q.TA", col.qty, y + 4.4, { align: "right" });
    doc.text("U.M.", col.um, y + 4.4);
    doc.text("PREZZO", col.price, y + 4.4, { align: "right" });
    doc.text("IMPORTO", col.amount, y + 4.4, { align: "right" });
    y += 6.5;
  };
  room(22);
  y += 2;
  tableHead();
  rows.forEach((row, i) => {
    font(tabella.corpo);
    const description = lines(row.descrizione, col.qty - col.desc - 13);
    const height = Math.max(RIGA_MIN, description.length * 3.9 + 3);
    if (y + height > BOTTOM) {
      continuation();
      tableHead();
    }
    const base = y + Math.max(4.4, (height - description.length * 3.9) / 2 + 3);
    font(8, false, GREY);
    doc.text(String(i + 1), col.n, base);
    font(tabella.corpo);
    description.forEach((line, l) => doc.text(line, col.desc, base + l * 3.9));
    if (row.quantita !== null) doc.text(number(row.quantita), col.qty, base, { align: "right" });
    font(8, false, GREY);
    doc.text(clean(row.unita), col.um, base);
    font(tabella.corpo);
    if (row.prezzo !== null) doc.text(money(row.prezzo), col.price, base, { align: "right" });
    font(tabella.corpo, true);
    doc.text(money(row.importo), col.amount, base, { align: "right" });
    y += height;
    doc.setDrawColor(...LINE);
    doc.setLineWidth(mm(tabella.filetto));
    doc.line(LEFT, y, RIGHT, y);
    doc.setLineWidth(0.2);
  });
  y += 4;
  const totalRows = [["Variazione netta, IVA esclusa", money(variation.impatto_economico)]];
  if (impact?.vat !== null && impact?.vat !== void 0) totalRows.push([`IVA stimata (${impact.rate}%)`, money(impact.vat)]);
  const final = impact?.grossDelta !== null && impact?.grossDelta !== void 0 ? ["Differenza IVA inclusa", money(impact.grossDelta)] : null;
  room(totalRows.length * 5 + 14);
  const totalX = 112;
  let totalY = y;
  totalRows.forEach(([label, value]) => {
    font(tabella.corpo);
    doc.text(label, totalX, totalY + 3.8);
    font(tabella.corpo, true);
    doc.text(value, RIGHT - 2, totalY + 3.8, { align: "right" });
    totalY += 5.5;
    doc.setDrawColor(...LINE);
    doc.setLineWidth(mm(tabella.filetto));
    doc.line(totalX - 2, totalY, RIGHT, totalY);
    doc.setLineWidth(0.2);
  });
  if (final) {
    doc.setDrawColor(...INK);
    doc.setLineWidth(mm(tabella.filettoTotale));
    doc.line(totalX - 2, totalY, RIGHT, totalY);
    doc.setLineWidth(0.2);
    font(tabella.corpo + 0.5, true);
    doc.text(final[0], totalX, totalY + 5.6);
    font(riquadro.valoreCorpo + 2, true, accent);
    doc.text(final[1], RIGHT - 2, totalY + 5.8, { align: "right" });
    totalY += 8;
  }
  if (impact?.revisedNet !== null && impact?.revisedNet !== void 0) {
    font(riquadro.etichettaCorpo, false, GREY);
    doc.text("Valore concordato prima della proposta, IVA esclusa", LEFT, y + 3.5);
    font(riquadro.valoreCorpo, true);
    doc.text(money(context.currentNet), LEFT, y + 8);
    font(riquadro.etichettaCorpo, false, GREY);
    doc.text("Nuovo contratto netto, solo se approvata", LEFT, y + 13);
    font(riquadro.valoreCorpo, true);
    doc.text(money(impact.revisedNet), LEFT, y + 17.5);
    totalY = Math.max(totalY, y + 18);
  }
  y = totalY + 4;
  section("Condizioni contrattuali");
  const conditions = [
    ...CONDIZIONI_STANDARD_VARIANTE,
    // Un paragrafo, un punto: le clausole dell'azienda arrivano separate da una riga vuota.
    ...parts?.condizioni ? parts.condizioni.split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean) : [],
    ...parts?.pagamento ? [`Pagamento dei lavori extra: ${parts.pagamento}`] : [],
    ...parts ? [parts.tempi] : []
  ];
  conditions.forEach((text, i) => {
    font(8.5);
    const wrapped = lines(text, WIDTH - 6);
    wrapped.forEach((line, l) => {
      room(3.9);
      font(8.5);
      if (l === 0) {
        font(8.5, true);
        doc.text(`${i + 1}.`, LEFT, y);
        font(8.5);
      }
      doc.text(line, LEFT + 6, y);
      y += 3.9;
    });
    y += 1;
  });
  if (mode === "proposta") {
    const acceptance = "Il cliente dichiara di aver letto la variazione e di accettare i lavori, la variazione economica e le condizioni sopra riportate. La proposta non modifica il contratto fino all'approvazione.";
    font(8.5);
    const approvalHeight = 14 + lines(acceptance, WIDTH).length * 3.9 + 40;
    if (y + approvalHeight > BOTTOM) continuation();
    section("Approvazione della proposta");
    write(acceptance, 8.5, INK, false, 3.9);
    y += 1;
    font(8.5);
    doc.text("Luogo e data: ______________________________", LEFT, y + 3);
    doc.text("Nome e cognome cliente: ______________________", 110, y + 3);
    doc.setDrawColor(...INK);
    doc.setLineWidth(mm(0.5));
    doc.line(LEFT, y + 24, 95, y + 24);
    doc.line(110, y + 24, RIGHT, y + 24);
    doc.setLineWidth(0.2);
    font(pagina.nota, false, GREY);
    doc.text("Firma cliente per approvazione", (LEFT + 95) / 2, y + 27.5, { align: "center" });
    doc.text("Firma impresa", (110 + RIGHT) / 2, y + 27.5, { align: "center" });
    y += 30;
  } else write("Nessuna variazione di date, assegnazioni o pagamenti viene eseguita da questa anteprima.", pagina.nota, GREY);
  const count = doc.getNumberOfPages();
  for (let page = 1; page <= count; page++) {
    doc.setPage(page);
    const stato = mode === "proposta" ? "Proposta non firmata" : "Anteprima non firmata";
    if (piedeProprio) {
      disegnaPiedeJsPdf(doc, veste, { font: fontPiede ? "EBGaramond" : "helvetica", pulisci: fontPiede ? void 0 : clean, larghezzaUtile: WIDTH, pagina: `Pag. ${page} / ${count} - ${stato}` });
      continue;
    }
    font(6.5, false, GREY);
    doc.text(stato, 105, cimaPiede + mm(5), { align: "center" });
    const cima = 297 - mm(32 + 5 + righePiede.length * 9.5);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(mm(0.5));
    doc.line(LEFT, cima, RIGHT, cima);
    doc.setLineWidth(0.2);
    font(7, false, GREY);
    const righe = righePiede.flatMap((r) => lines(r, WIDTH)).slice(0, 4);
    righe.forEach((r, i) => doc.text(r, 105, cima + mm(5 + 7) + i * mm(9.5), { align: "center" }));
    doc.text(`Pag. ${page} / ${count}`, 105, 297 - mm(29) + mm(6), { align: "center" });
  }
  return doc;
}

// src/lib/orders/variationDocumentContext.ts
function variationDocumentContext(draft, context) {
  return {
    ...context,
    companyName: draft.documentCompanyName?.trim() ?? context.companyName,
    companyDetails: draft.documentCompanyDetails?.trim() ?? context.companyDetails,
    customerName: draft.documentCustomerName?.trim() ?? context.customerName,
    customerAddress: draft.documentCustomerDetails?.trim() ?? context.customerAddress,
    documentHeading: draft.documentHeading,
    primaryColor: draft.documentColor
  };
}

// src/lib/orders/variationWorkspace.ts
var isVariationUuid = (value) => typeof value === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
function validateVariationWorkspace(raw, rawContext) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Bozza non valida.");
  const source = raw;
  const content = emptyVariationDraft();
  const bounds = {
    title: 120,
    description: 15e3,
    phase: 180,
    amount: 30,
    days: 10,
    reason: 3e3,
    requester: 200,
    internalNotes: 3e3,
    estimatedCost: 30,
    contractReference: 500,
    paymentTerms: 3e3,
    documentCompanyName: 300,
    documentCompanyDetails: 4e3,
    documentCustomerName: 300,
    documentCustomerDetails: 4e3,
    documentHeading: 120,
    documentIntro: 3e3,
    additionalTerms: 1e4
  };
  for (const [key, max] of Object.entries(bounds)) {
    const value = source[key] ?? content[key] ?? "";
    if (typeof value !== "string" || value.length > max) throw new Error("Un campo della bozza non \xE8 valido o \xE8 troppo lungo.");
    content[key] = value;
  }
  if (!["aggiunta", "modifica", "riduzione"].includes(String(source.kind)) || !["corpo", "voci"].includes(String(source.pricing)) || !["calendario", "lavorativi"].includes(String(source.dayUnit))) throw new Error("Tipo di variante, prezzo o giorni non valido.");
  content.kind = source.kind;
  content.pricing = source.pricing;
  content.dayUnit = source.dayUnit;
  if (source.documentColor !== void 0) {
    if (!["#1e3a5f", "#14532d", "#9a3412"].includes(String(source.documentColor))) throw new Error("Colore del documento non valido.");
    content.documentColor = String(source.documentColor);
  }
  for (const key of ["phaseId", "templateId"]) {
    if (source[key]) {
      if (!isVariationUuid(source[key])) throw new Error("Riferimento della bozza non valido.");
      content[key] = source[key];
    }
  }
  if (source.templateRevision !== void 0) {
    if (!Number.isSafeInteger(source.templateRevision) || Number(source.templateRevision) < 1) throw new Error("Versione del modello non valida.");
    content.templateRevision = Number(source.templateRevision);
  }
  if (!Array.isArray(source.lines) || source.lines.length > 100) throw new Error("Aggiungi al massimo 100 voci.");
  content.lines = source.lines.map((line) => {
    if (!line || typeof line !== "object" || !isVariationUuid(line.id) || typeof line.description !== "string" || line.description.length > 1e3 || typeof line.quantity !== "string" || line.quantity.length > 30 || typeof line.price !== "string" || line.price.length > 30) throw new Error("Voce della variante non valida.");
    if (line.unit !== void 0 && (typeof line.unit !== "string" || line.unit.length > 20)) throw new Error("Unit\xE0 di misura della voce non valida.");
    return { id: line.id, description: line.description, quantity: line.quantity, price: line.price, ...line.unit ? { unit: line.unit } : {} };
  });
  if (source.destinazione !== void 0) {
    if (!["nuova", "fase"].includes(String(source.destinazione))) throw new Error("Destinazione del lavoro non valida.");
    content.destinazione = source.destinazione;
  }
  if (source.chi !== void 0) {
    if (!Array.isArray(source.chi) || source.chi.length > 20) throw new Error("Al massimo 20 persone o ditte per il lavoro extra.");
    content.chi = source.chi.map((c) => {
      const x = c ?? {};
      if (!["persona", "ditta"].includes(String(x.tipo)) || !isVariationUuid(x.id) || typeof x.nome !== "string" || x.nome.length > 200) throw new Error("Chi fa il lavoro extra non \xE8 valido.");
      return { tipo: x.tipo, id: x.id, nome: x.nome };
    });
  }
  const ids = source.attachmentIds ?? [];
  if (!Array.isArray(ids) || ids.length > 10 || ids.some((id) => !isVariationUuid(id)) || new Set(ids).size !== ids.length) throw new Error("Seleziona al massimo 10 allegati diversi.");
  content.attachmentIds = ids;
  if (ids.length && !content.templateId) throw new Error("Gli allegati devono appartenere a un modello selezionato.");
  const input = rawContext && typeof rawContext === "object" && !Array.isArray(rawContext) ? rawContext : {};
  const context = {};
  for (const key of ["companyName", "companyDetails", "customerName", "customerAddress", "orderCode", "siteAddress"]) {
    if (input[key] !== void 0) {
      if (typeof input[key] !== "string" || input[key].length > 4e3) throw new Error("Dati del documento non validi.");
      context[key] = input[key];
    }
  }
  return { content, context: variationDocumentContext(content, context) };
}
function variationDraftPublicTerms(content) {
  try {
    return prepareVariation(content);
  } catch {
    return { titolo: content.title.trim() || "Bozza variante", descrizione: content.description.trim() || "Bozza da completare", motivazione: null, impatto_economico: 0, impatto_giorni: 0, richiesto_da: null, note_interne: null };
  }
}
export {
  prepareVariation,
  validateVariationWorkspace,
  variationDocumentParts,
  variationDraftPublicTerms,
  variationPdfFilename,
  variationProposalPdf
};
