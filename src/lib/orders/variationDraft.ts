export type VariationKind = "aggiunta" | "modifica" | "riduzione";
export interface VariationLine { id: string; description: string; quantity: string; price: string }
export interface VariationDraft {
  kind: VariationKind; title: string; description: string; phase: string;
  phaseId?: string;
  pricing: "corpo" | "voci"; amount: string; lines: VariationLine[];
  days: string; dayUnit: "calendario" | "lavorativi";
  reason: string; requester: string; internalNotes: string; estimatedCost: string;
  contractReference?: string; paymentTerms?: string;
  documentCompanyName?: string; documentCompanyDetails?: string;
  documentCustomerName?: string; documentCustomerDetails?: string;
  documentHeading?: string; documentColor?: string; documentIntro?: string; additionalTerms?: string;
  templateId?: string; templateRevision?: number; attachmentIds?: string[];
}
export const VARIATION_KINDS: Record<VariationKind, string> = {
  aggiunta: "Lavori aggiuntivi", modifica: "Modifica o sostituzione", riduzione: "Riduzione dei lavori",
};
export function emptyVariationDraft(): VariationDraft {
  return { kind: "aggiunta", title: "", description: "", phase: "", pricing: "corpo", amount: "",
    lines: [], days: "0", dayUnit: "calendario", reason: "", requester: "", internalNotes: "", estimatedCost: "",
    contractReference:"",paymentTerms:"",documentCompanyName:"",documentCompanyDetails:"",documentCustomerName:"",documentCustomerDetails:"" };
}
/** No parseFloat truncation, blank-as-zero or ambiguous thousands separators. */
export function variationDecimal(raw: string): number | null {
  const text = raw.trim();
  if (!/^-?\d+(?:[.,]\d{1,2})?$/.test(text)) return null;
  const value = Number(text.replace(",", "."));
  return Number.isFinite(value) && Math.abs(value) <= 99_999_999.99 ? value : null;
}
const round = (n: number) => Math.sign(n) * Math.round((Math.abs(n) + Number.EPSILON) * 100) / 100;
const euro = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
export interface PreparedVariation {
  titolo: string; descrizione: string; motivazione: string | null; impatto_economico: number;
  impatto_giorni: number; richiesto_da: string | null; note_interne: null;
}
export function prepareVariation(draft: VariationDraft): PreparedVariation {
  if (!draft.title.trim()) throw new Error("Scrivi il titolo della variante.");
  if (!draft.description.trim()) throw new Error("Descrivi cosa cambia rispetto al contratto.");
  let amount = variationDecimal(draft.amount);
  const detail: string[] = [];
  if (draft.pricing === "voci") {
    if (!draft.lines.length) throw new Error("Aggiungi almeno una voce oppure scegli il prezzo a corpo.");
    amount = 0;
    for (const [i, line] of draft.lines.entries()) {
      const quantity = variationDecimal(line.quantity), price = variationDecimal(line.price);
      if (!line.description.trim() || quantity === null || quantity <= 0 || price === null)
        throw new Error(`Completa descrizione, quantità e prezzo della voce ${i + 1}.`);
      if (draft.kind !== "modifica" && price < 0) throw new Error("Per aggiunte e riduzioni inserisci prezzi positivi.");
      const subtotal = round(quantity * price);
      amount = round(amount + subtotal);
      detail.push(`${i + 1}. ${line.description.trim()} - ${quantity} x ${euro(price)} = ${euro(subtotal)}`);
    }
  }
  if (amount === null || !Number.isFinite(amount) || Math.abs(amount) > 99_999_999.99)
    throw new Error("Inserisci un importo valido, con al massimo due decimali.");
  if (draft.kind !== "modifica" && amount < 0) throw new Error("Inserisci un importo positivo: la riduzione viene sottratta automaticamente.");
  const signedAmount = draft.kind === "riduzione" ? -amount : amount;
  if (!/^\d+$/.test(draft.days.trim()) || !Number.isSafeInteger(Number(draft.days)) || Number(draft.days) > 3650)
    throw new Error("Indica da 0 a 3650 giorni interi aggiuntivi.");
  const days = Number(draft.days);
  const estimatedCost = draft.estimatedCost?.trim() ? variationDecimal(draft.estimatedCost) : null;
  if (draft.estimatedCost?.trim() && estimatedCost === null) throw new Error("Controlla la variazione di costo prevista.");
  const description = [VARIATION_KINDS[draft.kind], draft.phase.trim() ? `Lavorazione di riferimento: ${draft.phase.trim()}` : "",
    draft.contractReference?.trim() ? `Preventivo / contratto di riferimento: ${draft.contractReference.trim()}` : "",
    draft.documentIntro?.trim() || "", draft.description.trim(), detail.length ? `Dettaglio economico (IVA esclusa):\n${detail.join("\n")}` : "",
    draft.additionalTerms?.trim() ? `Condizioni specifiche della variante:\n${draft.additionalTerms.trim()}` : "",
    draft.paymentTerms?.trim() ? `Pagamento dei lavori extra: ${draft.paymentTerms.trim()}` : "",
    days ? `Tempo aggiuntivo richiesto: ${days} giorni ${draft.dayUnit}. Le date saranno ripianificate separatamente dopo l'approvazione.` : "Nessuna estensione dei tempi richiesta."]
    .filter(Boolean).join("\n\n");
  return { titolo: draft.title.trim(), descrizione: description, motivazione: draft.reason.trim() || null,
    impatto_economico: round(signedAmount), impatto_giorni: days,
    // Existing customer SELECT policy exposes the whole row, including note_interne.
    // Until private storage is separated server-side, do not persist private draft data here.
    richiesto_da: draft.requester.trim() || null, note_interne: null };
}
/** Preview only. Working-day projection excludes weekends, NOT public holidays or company closures. */
export function variationDatePreview(endDate: string | null | undefined, days: string, unit: VariationDraft["dayUnit"]) {
  if (!endDate || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || !/^\d+$/.test(days) || Number(days) > 3650) return null;
  const date = new Date(`${endDate}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== endDate) return null;
  for (let left = Number(days); left > 0;) {
    date.setUTCDate(date.getUTCDate()+1);
    if (unit === "calendario" || (date.getUTCDay() !== 0 && date.getUTCDay() !== 6)) left--;
  }
  return date.toISOString().slice(0,10);
}
export function variationImpact(currentNet: number | undefined, delta: number, vatRate: number | undefined) {
  if (!Number.isFinite(delta)) return null;
  const rate = vatRate !== undefined && Number.isFinite(vatRate) && vatRate >= 0 && vatRate <= 100 ? vatRate : null;
  const current = currentNet !== undefined && Number.isFinite(currentNet) ? currentNet : null;
  return { delta, vat: rate === null ? null : round(delta * rate / 100),
    grossDelta: rate === null ? null : round(delta * (1 + rate / 100)),
    revisedNet: current === null ? null : round(current + delta), rate };
}
