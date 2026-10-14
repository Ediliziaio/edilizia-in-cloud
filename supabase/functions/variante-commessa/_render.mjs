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
      detail.push(`${i + 1}. ${line.description.trim()} - ${quantity} x ${euro(price)} = ${euro(subtotal)}`);
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
  const doc = new jsPDF();
  const colors = { "#1e3a5f": [30, 58, 95], "#14532d": [20, 83, 45], "#9a3412": [154, 52, 18] };
  const navy = colors[context.primaryColor || ""] || [30, 58, 95];
  let y = 22;
  const clean = (text) => text.replace(/[\u2010-\u2015\u2212]/g, "-").replace(/[\u00a0\u202f]/g, " ");
  const money = (amount) => clean(new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(amount));
  const header = () => {
    doc.setTextColor(...navy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(doc.splitTextToSize(clean(context.companyName || "LAVORI EXTRA E VARIANTI"), 105)[0], 19, 13);
    if (context.orderCode) doc.text(clean(context.orderCode).slice(0, 30), 191, 13, { align: "right" });
    doc.setDrawColor(...navy);
    doc.line(19, 17, 191, 17);
    y = 26;
  };
  function write(text, heading = false) {
    if (heading && y > 245) {
      doc.addPage();
      header();
    }
    doc.setFont("helvetica", heading ? "bold" : "normal");
    doc.setFontSize(heading ? 12 : 10);
    doc.setTextColor(...heading ? navy : [35, 45, 60]);
    const lines = doc.splitTextToSize(clean(text), 172);
    for (const line of lines) {
      if (y > 262) {
        doc.addPage();
        header();
        doc.setFont("helvetica", heading ? "bold" : "normal");
        doc.setFontSize(heading ? 12 : 10);
        doc.setTextColor(...heading ? navy : [35, 45, 60]);
      }
      doc.text(line, 19, y);
      y += heading ? 6 : 4.5;
    }
    y += heading ? 2.5 : 2;
  }
  header();
  write(context.documentHeading?.trim().slice(0, 120) || (mode === "proposta" ? "PROPOSTA DI VARIAZIONE - LAVORI EXTRA" : "LAVORI EXTRA E VARIANTI"), true);
  write(mode === "proposta" ? "DA APPROVARE - Documento non firmato" : "ANTEPRIMA BOZZA - Non salvata, non inviata, non firmata");
  write(`PDF generato il: ${(/* @__PURE__ */ new Date()).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}`);
  if (context.orderCode && !context.archivedOriginal) write(`Commessa di riferimento: ${context.orderCode}`);
  if (context.proposalNumber !== void 0) {
    if (!Number.isSafeInteger(context.proposalNumber) || context.proposalNumber < 1) throw new Error("Numero OdV non valido.");
    const registeredDate = variationEventDate(context.proposalRegisteredAt);
    if (context.archivedOriginal) {
      write(`OdV #${context.proposalNumber} | Commessa ${context.orderCode ?? "-"} | Registrata ${registeredDate ?? "data non disponibile"}`);
      write("Originale conservato in commessa con gli allegati di questa versione.");
    } else {
      write(`Variante registrata: OdV #${context.proposalNumber}`);
      write(registeredDate ? `Proposta registrata il: ${registeredDate}` : "Data di registrazione non disponibile.");
      write("Ristampa della proposta dai dati registrati e dall'anagrafica attuale. Non e' una copia dell'originale inviato, ne' un documento firmato.");
    }
  }
  if (mode === "proposta") {
    write("Impresa", true);
    write([context.companyName, context.companyDetails].filter(Boolean).join("\n"));
    write("Cliente / committente", true);
    write([context.customerName, context.customerAddress].filter(Boolean).join("\n"));
    if (context.siteAddress) write(`Cantiere: ${context.siteAddress}`);
  } else if (context.customerName) write(`Cliente: ${context.customerName}`);
  write(variation.titolo, true);
  write(variation.descrizione);
  if (variation.motivazione) {
    write("Motivazione", true);
    write(variation.motivazione);
  }
  if (variation.richiesto_da) write(`Richiesto da: ${variation.richiesto_da}`);
  if (variation.impatto_giorni !== void 0 && !/Tempo aggiuntivo richiesto:|Nessuna estensione dei tempi richiesta\./.test(variation.descrizione)) {
    write(variation.impatto_giorni ? `Tempo aggiuntivo richiesto: ${variation.impatto_giorni} giorni. Il dato registrato non specifica se lavorativi o di calendario: concordare l'unita' prima dell'accettazione.` : "Nessuna estensione dei tempi richiesta.");
  }
  write("Riepilogo economico", true);
  write(`Variazione netta, IVA esclusa: ${money(variation.impatto_economico)}`);
  if (impact?.vat !== null && impact?.vat !== void 0) {
    write(`IVA stimata (${impact.rate}%): ${money(impact.vat)}
Differenza IVA inclusa: ${money(impact.grossDelta)}`);
  }
  if (impact?.revisedNet !== null && impact?.revisedNet !== void 0) {
    write(`Valore concordato prima della proposta, IVA esclusa: ${money(context.currentNet)}`);
    write(`Nuovo contratto netto, solo se approvata: ${money(impact.revisedNet)}`);
  }
  write("Gli importi IVA inclusa sono una stima con l'aliquota della commessa. Verificare l'IVA applicabile e precisare nelle condizioni eventuali aliquote diverse prima dell'accettazione.");
  if (mode === "proposta") {
    const acceptance = "Il cliente dichiara di aver letto la variazione e di accettare i lavori, la variazione economica e le condizioni sopra riportate. La proposta non modifica le altre condizioni del contratto di riferimento.";
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const approvalHeight = 8.5 + doc.splitTextToSize(clean(acceptance), 172).length * 4.5 + 2 + 46;
    if (y + approvalHeight > 265) {
      doc.addPage();
      header();
    }
    write("Approvazione della proposta", true);
    write(acceptance);
    if (y + 46 > 265) {
      doc.addPage();
      header();
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(35, 45, 60);
    doc.text("Luogo e data: __________________________________", 19, y + 4);
    doc.text("Nome e cognome cliente: __________________________", 19, y + 15);
    doc.text("Firma cliente per approvazione", 19, y + 29);
    doc.text("Firma impresa", 111, y + 29);
    doc.setDrawColor(110);
    doc.line(19, y + 43, 98, y + 43);
    doc.line(111, y + 43, 190, y + 43);
  } else write("Nessuna variazione di date, assegnazioni o pagamenti viene eseguita da questa anteprima.");
  const count = doc.getNumberOfPages();
  for (let page = 1; page <= count; page++) {
    doc.setPage(page);
    doc.setDrawColor(210);
    doc.line(19, 280, 191, 280);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.setFontSize(8);
    doc.text(`${mode === "proposta" ? "Proposta non firmata" : "Anteprima non firmata"} | ${page} / ${count}`, 19, 286);
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
    return { id: line.id, description: line.description, quantity: line.quantity, price: line.price };
  });
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
  variationDraftPublicTerms,
  variationPdfFilename,
  variationProposalPdf
};
