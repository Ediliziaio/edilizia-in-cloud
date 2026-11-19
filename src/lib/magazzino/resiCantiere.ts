import { consumiPerArticolo, unitaConsumoConfrontabile, type RapportinoConMateriali } from "@/lib/distinta/consumiMateriali";

export interface ReturnArticle { id: string; name: string; quantity: number; unita_misura: string | null; stock_item_id: string | null }
export interface ReturnMovement { order_item_id: string | null; stock_item_id: string; movement_type: string; quantity: number; notes: string | null; rientro_commessa: boolean | null }
export interface ReturnStock { id: string; tracking_mode: string; warehouse_id: string | null; unita_misura: string | null }
export interface ReturnCandidate {
  protocolVersion?: 2; orderItemId?: string | null; stockItemId?: string;
  trackingMode?: "fungible" | "serialized"; serials?: { id: string; serial_number: string }[];
  id: string; nome: string; unita: string; quantita: number; usciti: number; posati: number;
  rientrati: number; avanzano: number; daGiacenza: boolean; warehouseId: string | null; blocked: string | null; verified?: boolean; historicalMovements?: number;
}

/** Il reso parte da scarichi reali della riga, mai dalla sola quantità ordinata. */
export function returnCandidates(articles: ReturnArticle[], movements: ReturnMovement[], reports: RapportinoConMateriali[], stock: ReturnStock[]): ReturnCandidate[] {
  const consumption = consumiPerArticolo(reports, new Map(articles.map((a) => [a.id, { unita: a.unita_misura, stock: a.stock_item_id }])));
  const stockById = new Map(stock.map((item) => [item.id, item]));
  return articles.flatMap((article): ReturnCandidate[] => {
    const historicalOut = movements.filter((m) => m.order_item_id === article.id && m.movement_type === "scarico" && !(m.notes ?? "").startsWith("Divisione tra le fasi:"));
    if (historicalOut.length > 0 && (!article.stock_item_id || !historicalOut.some((m) => m.stock_item_id === article.stock_item_id))) {
      const origins = [...new Set(historicalOut.map((m) => m.stock_item_id))];
      const origin = origins.length === 1 ? stockById.get(origins[0]) : undefined;
      return [{ id: article.id, nome: article.name, unita: article.unita_misura || "unità", quantita: Number(article.quantity), usciti: origins.length === 1 ? historicalOut.reduce((sum, m) => sum + Number(m.quantity), 0) : 0, posati: 0, rientrati: 0, avanzano: 0, daGiacenza: false, warehouseId: origin?.warehouse_id ?? null, verified: false, historicalMovements: historicalOut.length, blocked: "Prelievo storico senza collegamento coerente alla scheda della riga: verifica i materiali della commessa prima del reso." }];
    }
    if (!article.stock_item_id) return [];
    const movementsForItem = movements.filter((m) => m.order_item_id === article.id && m.stock_item_id === article.stock_item_id && !(m.notes ?? "").startsWith("Divisione tra le fasi:"));
    const usciti = movementsForItem.filter((m) => m.movement_type === "scarico").reduce((sum, m) => sum + Number(m.quantity), 0);
    if (usciti <= 0) return [];
    const rientrati = movementsForItem.filter((m) => m.movement_type === "carico" && m.rientro_commessa).reduce((sum, m) => sum + Number(m.quantity), 0);
    const posati = consumption.get(article.id)?.posati ?? 0;
    const remaining = Math.max(0, Math.min(Number(article.quantity), usciti) - posati - rientrati);
    const avanzano = Math.round(remaining * 1e6) / 1e6;
    const item = stockById.get(article.stock_item_id);
    const unit = article.unita_misura || "unità";
    const blocked = !item ? "Articolo di magazzino non disponibile."
      : item.tracking_mode === "serialized" ? "Per questo articolo serve un rientro con selezione dei seriali, non disponibile nel servizio attuale."
      : unitaConsumoConfrontabile(article.unita_misura) === "a corpo" ? "Articolo a corpo: verifica i singoli prodotti della commessa."
      : item.unita_misura && article.unita_misura && unitaConsumoConfrontabile(item.unita_misura) !== unitaConsumoConfrontabile(article.unita_misura) ? "Unità di misura diverse: verifica la riga prima del reso."
      : avanzano <= 0 ? "Nessuna quantità residua da restituire."
      : avanzano < 1 ? "Il servizio attuale accetta resi interi: questa frazione non viene arrotondata." : null;
    return [{ id: article.id, nome: article.name, unita: unit, quantita: Number(article.quantity), usciti, posati, rientrati, avanzano, daGiacenza: true, warehouseId: item?.warehouse_id ?? null, blocked }];
  });
}
