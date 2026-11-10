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

// supabase/functions/_shared/personalizzazioneDocumenti.ts
var SENZA_PERSONALIZZAZIONE = Object.freeze({
  logoAltezza: null,
  logoLarghezzaMax: null,
  logoCopertinaAltezza: null,
  logoCopertinaLarghezzaMax: null,
  piedeFont: null,
  piedeColore: null,
  piedeRighe: null
});
var IMPRESA_VULCANO = "7c87c209-7868-42d0-ad98-6c95ac6de196";
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
  ])
});
function personalizzazioneDocumento(companyId) {
  return companyId === IMPRESA_VULCANO ? VESTE_VULCANO : SENZA_PERSONALIZZAZIONE;
}
var testoRigaPiede = (r) => r.parti.map((p) => p.testo).join("");
var LARGHEZZA_RIGA_LUNGA_A_CORPO_1 = 43.3;
function misurePiede(veste, larghezzaUtile) {
  const righe = veste.piedeRighe;
  if (!righe?.length) return null;
  const corpo = Math.min(9, Math.floor(larghezzaUtile / LARGHEZZA_RIGA_LUNGA_A_CORPO_1 * 4) / 4);
  const corpoTitolo = 13.5;
  const rigaTitolo = corpoTitolo * 1.15;
  const riga = corpo * 1.3;
  const altezza = righe.reduce((s, r) => s + (r.titolo ? rigaTitolo : riga), 0);
  const corpoPagina = 7.5;
  const cimaPaginaDalFondo = 24;
  const fondoRigheDalFondo = cimaPaginaDalFondo + 1;
  return { corpoTitolo, corpo, rigaTitolo, riga, altezza, corpoPagina, cimaPaginaDalFondo, fondoRigheDalFondo, ingombro: fondoRigheDalFondo + altezza };
}
var BIANCO_SOPRA_PIEDE = 8;
function disegnaPiedeJsPdf(pdf, veste, o) {
  const righe = veste.piedeRighe;
  const m = misurePiede(veste, o.larghezzaUtile * 72 / 25.4);
  if (!righe?.length || !m) return;
  const testo = (t) => o.pulisci ? o.pulisci(t) : t;
  const colore = veste.piedeColore ?? "#1C1650";
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
    const alta = righe[i].titolo ? m.rigaTitolo : corpo * 1.3;
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
      pdf.setTextColor(p.colore ?? colore);
      pdf.text(p.testo, x, basi[i]);
      if (p.sottolineato) {
        pdf.setDrawColor(p.colore ?? colore);
        pdf.setLineWidth(mm(c * 0.05));
        pdf.line(x, basi[i] + mm(c * 0.12), x + p.larghezza, basi[i] + mm(c * 0.12));
      }
      x += p.larghezza;
    }
  });
  pdf.setFontSize(m.corpoPagina);
  pdf.setTextColor(colore);
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
  const colors = { "#1e3a5f": [30, 58, 95], "#14532d": [20, 83, 45], "#9a3412": [154, 52, 18] };
  const navy = colors[context.primaryColor || ""] || [30, 58, 95];
  const INK = [35, 45, 60], GREY = [100, 110, 125], LINE = [215, 222, 232], PALE = [245, 247, 250];
  const veste = personalizzazioneDocumento(context.companyId);
  const piedeProprio = Boolean(veste.piedeRighe && context.societarie?.length);
  const LEFT = 15, RIGHT = 195, WIDTH = RIGHT - LEFT, BOTTOM = piedeProprio ? limiteContenutoJsPdf(veste, WIDTH, 272) : 272;
  const fontPiede = veste.piedeFont && context.societarie?.length ? await fontPiedeBase64() : null;
  if (fontPiede) {
    doc.addFileToVFS("EBGaramond-Regular.ttf", fontPiede);
    doc.addFont("EBGaramond-Regular.ttf", "EBGaramond", "normal");
  }
  let y = 14;
  const clean = (text) => text.replace(/[‐-―−]/g, "-").replace(/[  ]/g, " ");
  const money = (amount) => clean(new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: true }).format(amount));
  const number = (n) => clean(n.toLocaleString("it-IT", { maximumFractionDigits: 2, useGrouping: true }));
  const font = (size, bold = false, color = INK) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };
  const lines = (text, width) => doc.splitTextToSize(clean(text), width);
  const parts = context.parti;
  const heading = (context.documentHeading?.trim().slice(0, 120) || (mode === "proposta" ? "Variante al contratto" : "Lavori extra e varianti")).toUpperCase();
  const number_odv = context.proposalNumber;
  if (number_odv !== void 0 && (!Number.isSafeInteger(number_odv) || number_odv < 1)) throw new Error("Numero OdV non valido.");
  const registeredDate = variationEventDate(context.proposalRegisteredAt);
  const continuation = () => {
    doc.addPage();
    font(8, true, navy);
    doc.text(lines(context.companyName || heading, 110)[0], LEFT, 12);
    font(8, false, GREY);
    doc.text(clean([context.orderCode, number_odv !== void 0 ? `OdV #${number_odv}` : ""].filter(Boolean).join(" - ")), RIGHT, 12, { align: "right" });
    doc.setDrawColor(...navy);
    doc.line(LEFT, 14.5, RIGHT, 14.5);
    y = 21;
  };
  const room = (height) => {
    if (y + height > BOTTOM) continuation();
  };
  function write(text, size = 9, color = INK, bold = false, lineHeight = size * 0.46) {
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
    room(11);
    y += 2;
    font(9, true, navy);
    doc.text(title.toUpperCase(), LEFT, y);
    y += 1.5;
    doc.setDrawColor(...navy);
    doc.setLineWidth(0.3);
    doc.line(LEFT, y, RIGHT, y);
    doc.setLineWidth(0.2);
    y += 4.5;
  };
  let textX = LEFT, altezzaLogoGrande = 0;
  if (context.logo) {
    try {
      const image = doc.getImageProperties(context.logo);
      const scale = Math.min((veste.logoLarghezzaMax ? puntiInMm(veste.logoLarghezzaMax) : 48) / image.width, (veste.logoAltezza ? puntiInMm(veste.logoAltezza) : 15) / image.height), width = image.width * scale, height = image.height * scale;
      doc.addImage(context.logo, image.fileType, LEFT, y - 4, width, height);
      if (veste.logoAltezza) altezzaLogoGrande = height;
      else textX = LEFT + width + 5;
    } catch {
    }
  }
  if (altezzaLogoGrande) {
    y += altezzaLogoGrande;
    font(7.5, false, GREY);
    const dati = lines(context.companyDetails ?? "", WIDTH).slice(0, 3);
    dati.forEach((line, i) => doc.text(line, LEFT, y + i * 3.3));
    y += dati.length * 3.3 + 3;
  } else {
    font(11, true, navy);
    doc.text(lines(context.companyName || "Impresa", RIGHT - textX)[0], textX, y + 1);
    font(7.5, false, GREY);
    lines(context.companyDetails ?? "", RIGHT - textX).slice(0, 3).forEach((line, i) => doc.text(line, textX, y + 5 + i * 3.3));
    y += 16;
  }
  doc.setFillColor(...navy);
  doc.rect(LEFT, y, WIDTH, 9, "F");
  font(10, true, [255, 255, 255]);
  doc.text(lines(heading, 120)[0], LEFT + 3, y + 6);
  const today = (/* @__PURE__ */ new Date()).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" });
  font(8.5, true, [255, 255, 255]);
  doc.text(clean(number_odv !== void 0 ? `OdV #${number_odv} del ${registeredDate ?? today}` : `del ${today}`), RIGHT - 3, y + 6, { align: "right" });
  y += 13.5;
  write(mode === "proposta" ? "DA APPROVARE - Documento non firmato" : "ANTEPRIMA BOZZA - Non salvata, non inviata, non firmata", 8, [154, 88, 10], true);
  if (number_odv !== void 0 && !context.archivedOriginal) {
    write(registeredDate ? `Proposta registrata il: ${registeredDate}` : "Data di registrazione non disponibile.", 7.5, GREY);
    write("Ristampa della proposta dai dati registrati e dall'anagrafica attuale. Non e' una copia dell'originale inviato, ne' un documento firmato.", 7.5, GREY);
  }
  if (mode === "proposta" || context.customerName) {
    const box = (x, width, label, name, detail) => {
      const detailLines = lines(detail, width - 6).slice(0, 4);
      const height = 12 + detailLines.length * 3.4;
      doc.setDrawColor(...LINE);
      doc.roundedRect(x, y, width, height, 1, 1);
      font(6.5, true, GREY);
      doc.text(label.toUpperCase(), x + 3, y + 4.2);
      font(9.5, true);
      doc.text(lines(name, width - 6)[0] ?? "", x + 3, y + 8.6);
      font(8, false);
      detailLines.forEach((line, i) => doc.text(line, x + 3, y + 12.2 + i * 3.4));
      return height;
    };
    const half = (WIDTH - 4) / 2;
    const a = box(LEFT, half, "Impresa", context.companyName || "-", context.companyDetails ?? "");
    const b = box(LEFT + half + 4, half, "Committente", context.customerName || "-", context.customerAddress ?? "");
    y += Math.max(a, b) + 3;
  }
  const refs = [["Commessa", context.orderCode], ["Cantiere", context.siteAddress], ["Contratto di riferimento", parts?.riferimento], ["Lavorazione", parts?.fase], ["Richiesto da", variation.richiesto_da]].filter((r) => !!r[1]?.trim());
  if (refs.length) {
    const perRow = Math.min(refs.length, 3), cell = WIDTH / perRow, rows2 = Math.ceil(refs.length / perRow);
    doc.setFillColor(...PALE);
    doc.rect(LEFT, y, WIDTH, rows2 * 10.5 + 1, "F");
    refs.forEach(([label, value], i) => {
      const x = LEFT + 3 + i % perRow * cell, top = y + 4 + Math.floor(i / perRow) * 10.5;
      font(6.5, false, GREY);
      doc.text(label, x, top);
      font(8.5, true);
      doc.text(lines(value, cell - 5)[0], x, top + 4);
    });
    y += rows2 * 10.5 + 5;
  }
  section(`Oggetto${parts ? ` - ${parts.tipo}` : ""}`);
  write(variation.titolo, 10.5, INK, true, 5);
  write(parts ? parts.lavori : variation.descrizione);
  if (variation.motivazione) {
    write("Motivazione", 8, GREY, true);
    write(variation.motivazione);
  }
  if (!parts && variation.impatto_giorni !== void 0 && !/Tempo aggiuntivo richiesto:|Nessuna estensione dei tempi richiesta\./.test(variation.descrizione)) {
    write(variation.impatto_giorni ? `Tempo aggiuntivo richiesto: ${variation.impatto_giorni} giorni. Il dato registrato non specifica se lavorativi o di calendario: concordarlo prima di firmare.` : "Nessuna estensione dei tempi richiesta.");
  }
  const rows = parts?.righe ?? [{ descrizione: variation.titolo, quantita: null, unita: "a corpo", prezzo: null, importo: variation.impatto_economico }];
  const col = { n: LEFT + 2, desc: LEFT + 9, qty: 133, um: 136, price: 167, amount: RIGHT - 2 };
  const tableHead = () => {
    doc.setFillColor(...PALE);
    doc.rect(LEFT, y, WIDTH, 6.5, "F");
    doc.setDrawColor(...navy);
    doc.setLineWidth(0.4);
    doc.line(LEFT, y, RIGHT, y);
    doc.setLineWidth(0.2);
    font(7, true, navy);
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
    font(8.5);
    const description = lines(row.descrizione, col.qty - col.desc - 13);
    const height = Math.max(6.5, description.length * 3.8 + 2.8);
    if (y + height > BOTTOM) {
      continuation();
      tableHead();
    }
    font(8, false, GREY);
    doc.text(String(i + 1), col.n, y + 4.4);
    font(8.5);
    description.forEach((line, l) => doc.text(line, col.desc, y + 4.4 + l * 3.8));
    if (row.quantita !== null) doc.text(number(row.quantita), col.qty, y + 4.4, { align: "right" });
    font(8, false, GREY);
    doc.text(clean(row.unita), col.um, y + 4.4);
    font(8.5);
    if (row.prezzo !== null) doc.text(money(row.prezzo), col.price, y + 4.4, { align: "right" });
    font(8.5, true);
    doc.text(money(row.importo), col.amount, y + 4.4, { align: "right" });
    y += height;
    doc.setDrawColor(...LINE);
    doc.line(LEFT, y, RIGHT, y);
  });
  y += 4;
  const totalRows = [["Variazione netta, IVA esclusa", money(variation.impatto_economico)]];
  if (impact?.vat !== null && impact?.vat !== void 0) totalRows.push([`IVA stimata (${impact.rate}%)`, money(impact.vat)]);
  const final = impact?.grossDelta !== null && impact?.grossDelta !== void 0 ? ["Differenza IVA inclusa", money(impact.grossDelta)] : null;
  room(totalRows.length * 5 + 14);
  const totalX = 112;
  let totalY = y;
  totalRows.forEach(([label, value]) => {
    font(8.5, false, GREY);
    doc.text(label, totalX, totalY + 3.5);
    font(8.5, true);
    doc.text(value, RIGHT - 2, totalY + 3.5, { align: "right" });
    totalY += 5;
  });
  if (final) {
    doc.setFillColor(...navy);
    doc.rect(totalX - 2, totalY, RIGHT - totalX + 2, 7.5, "F");
    font(9, true, [255, 255, 255]);
    doc.text(final[0], totalX, totalY + 5);
    doc.text(final[1], RIGHT - 2, totalY + 5, { align: "right" });
    totalY += 7.5;
  }
  if (impact?.revisedNet !== null && impact?.revisedNet !== void 0) {
    font(7.5, false, GREY);
    doc.text("Valore concordato prima della proposta, IVA esclusa", LEFT, y + 3.5);
    font(9, true);
    doc.text(money(context.currentNet), LEFT, y + 8);
    font(7.5, false, GREY);
    doc.text("Nuovo contratto netto, solo se approvata", LEFT, y + 13);
    font(9, true, navy);
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
        font(8.5, true, navy);
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
    font(8, false, GREY);
    doc.text("Firma cliente per approvazione", LEFT, y + 13);
    doc.text("Firma impresa", 110, y + 13);
    doc.setDrawColor(110);
    doc.line(LEFT, y + 27, 95, y + 27);
    doc.line(110, y + 27, RIGHT, y + 27);
    y += 30;
  } else write("Nessuna variazione di date, assegnazioni o pagamenti viene eseguita da questa anteprima.", 8, GREY);
  const count = doc.getNumberOfPages();
  for (let page = 1; page <= count; page++) {
    doc.setPage(page);
    const stato = mode === "proposta" ? "Proposta non firmata" : "Anteprima non firmata";
    if (piedeProprio) {
      disegnaPiedeJsPdf(doc, veste, { font: fontPiede ? "EBGaramond" : "helvetica", pulisci: fontPiede ? void 0 : clean, larghezzaUtile: WIDTH, pagina: `Pagina ${page} di ${count} - ${stato}` });
      continue;
    }
    doc.setDrawColor(...LINE);
    doc.line(LEFT, 280, RIGHT, 280);
    const societarie = context.societarie?.length ? context.societarie : null;
    if (societarie) {
      font(6.5, false, GREY);
      if (fontPiede) {
        doc.setFont("EBGaramond", "normal");
        doc.setTextColor(veste.piedeColore);
      }
      const righe = societarie.flatMap((r) => lines(r, WIDTH)).slice(0, 3);
      righe.forEach((r, i) => doc.text(r, 105, 283.5 + i * 3, { align: "center" }));
      doc.text(`Pagina ${page} di ${count} - ${stato}`, 105, 284 + righe.length * 3, { align: "center" });
    } else {
      font(7.5, false, GREY);
      doc.text(clean(`${context.companyName ? `${context.companyName} - ` : ""}${stato}`), LEFT, 284);
      doc.text(`Pagina ${page} di ${count}`, RIGHT, 284, { align: "right" });
    }
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
