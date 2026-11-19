import type { Scadenza } from "@/hooks/useScadenzario";

export function percheScadenzaNonModificabile(s: Pick<Scadenza, "is_auto_generated" | "invoice_id" | "cost_id" | "order_item_id" | "prima_nota_entry_id" | "status" | "paid_amount">): string | null {
  if (s.status === "annullata") return "La scadenza è già annullata.";
  if (s.status === "pagata" || s.status === "parziale" || Number(s.paid_amount) > 0 || s.prima_nota_entry_id) return "La scadenza ha pagamenti registrati: usa il percorso di annullamento del pagamento.";
  if (s.is_auto_generated || s.invoice_id || s.cost_id || s.order_item_id) return "La scadenza viene da un documento: modifica il documento di origine.";
  return null;
}

export interface ModificaScadenza { description: string; amount: number; due_date: string; payment_method: string; notes: string }
