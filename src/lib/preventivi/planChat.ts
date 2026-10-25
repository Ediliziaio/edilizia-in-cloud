import type { ChatDocument } from "./quoteChatDocument";
import type { PlanAttachment, PlanRectangle, PlanRoom } from "./planReading";
import type { QuoteChatProposal, QuoteChatResult } from "../../../supabase/functions/_shared/quoteConversation";
export function planLinePrefix(planId: string, roomId: string) { return `plan_${planId.slice(0, 12)}_${roomId}_`; }
export function recalculatePlanLines(document: ChatDocument, plan: PlanAttachment, fact: PlanRectangle): ChatDocument {
  const prefix = planLinePrefix(plan.id, fact.roomId);
  return { ...document, revision: document.revision + 1, lines: document.lines.map(row => {
    if (!row.id.startsWith(prefix)) return row;
    const floor = row.id.endsWith("_floor") || row.id.endsWith("_remove");
    const derived = !/^(Quantità (inserita|cancellata)|Unità modificata) manualmente/.test(row.quantityBasis);
    return { ...row, ...(floor && derived ? { quantity: fact.area, quantityBasis: fact.basis } : {}), included: false };
  }) };
}
export function planWorksResult(document: ChatDocument, plan: PlanAttachment, room: PlanRoom, fact: PlanRectangle | null, text: string, turnId: string): QuoteChatResult | null {
  const input = text.trim().toLowerCase();
  const custom = input.startsWith("aggiungi lavorazione ");
  if (!custom && !/^rifai (pavimento|tinteggiatura|pavimento e tinteggiatura)$/.test(input)) return null;
  const prefix = planLinePrefix(plan.id, room.id); const proposals: QuoteChatProposal[] = [];
  const row = (id: string, title: string, description: string, quantity: number | null, unit = "m²") => proposals.push({ id: prefix + id, title: `${room.label} · ${title}`, description, quantity, unit, quantityBasis: quantity == null ? `Quantità da definire, pagina ${plan.reading?.page ?? 1}.` : fact!.basis, referenceId: null });
  if (!custom && input.includes("pavimento")) {
    row("remove", "Rimozione pavimento", "Confermare materiale, strati, trasporto e smaltimento; evitare duplicazioni con il prezzario scelto.", fact?.area ?? null);
    row("floor", "Fornitura e posa pavimento", "Materiale, formato, sottofondo, battiscopa e sfrido da definire. La superficie netta non include sfrido automatico.", fact?.area ?? null);
  }
  if (!custom && input.includes("tinteggiatura")) row("paint", "Preparazione e tinteggiatura pareti", "Confermare altezza, aperture, preparazione e finitura. Soffitto da computare separatamente. Non deduco le pareti dalla superficie a pavimento.", null);
  if (custom) {
    const title = text.trim().slice("aggiungi lavorazione ".length).trim();
    if (!title || title.length > 120) return null;
    const existing = document.lines.find(r => r.id.startsWith(prefix) && r.original.title.toLowerCase() === `${room.label} · ${title}`.toLowerCase());
    row(existing ? existing.id.slice(prefix.length) : `custom${document.lines.length}`, title, "Lavorazione manuale da definire e quantificare.", null, "");
  }
  if (!proposals.length) return null;
  return { version: 1, turnId, revision: document.revision, references: [], model: "Regole locali · nessun LLM", simulated: true,
    turn: { version: 1, title: `Progetto · ${room.label}`, message: "Ho preparato le voci da verificare. Prezzi, IVA, costi interni e tempi non sono stati inventati. Completa i valori nella tabella oppure con i comandi in chat.",
      questions: ["Quali materiali, finiture e specifiche vuoi?", "Quali misure o lavorazioni mancano ancora?"], warnings: ["Queste sono voci operative locali, non corrispondenze tecniche certificate con un prezzario."], searches: [], proposals } };
}
