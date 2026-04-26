/**
 * Policy di risoluzione match lato client.
 * Mirror della logica in RPC warehouse_scan_lookup.
 *
 * Usato per:
 *   - test unitari senza Supabase (vedi src/test/lib/scanMatchLogic.test.ts),
 *   - decidere UI in base al match type ritornato dall'RPC.
 */

export type MatchType = "unit" | "item" | "item_ambiguous" | "none";

export interface RawMatchRow {
  match_type: MatchType;
  stock_unit_id: string | null;
  stock_item_id: string | null;
  item_name: string | null;
  item_tracking_mode: "fungible" | "serialized" | null;
  supplier_id: string | null;
  supplier_name: string | null;
}

export type UiAction =
  | { kind: "accept_unit"; unitId: string; itemId: string }
  | { kind: "accept_item"; itemId: string }
  | { kind: "confirm_ambiguous"; rows: RawMatchRow[] }
  | { kind: "offer_create_new" };

/**
 * Decide l'azione UI da mostrare in base alle righe ritornate dall'RPC.
 *
 * Regole:
 *   1 row type="unit"           → accept_unit (match seriale = univoco, no ambiguità)
 *   1 row type="item"           → accept_item (match barcode con supplier atteso)
 *   N rows "item_ambiguous"     → confirm_ambiguous (user sceglie o crea nuovo)
 *   0 rows valide / type="none" → offer_create_new
 */
export function decideUiAction(rows: RawMatchRow[]): UiAction {
  const valid = rows.filter((r) => r.match_type !== "none");
  if (valid.length === 0) return { kind: "offer_create_new" };

  // Unit match ha priorità assoluta: il seriale è univoco per definizione.
  const unitMatch = valid.find((r) => r.match_type === "unit");
  if (unitMatch && unitMatch.stock_unit_id && unitMatch.stock_item_id) {
    return { kind: "accept_unit", unitId: unitMatch.stock_unit_id, itemId: unitMatch.stock_item_id };
  }

  // Tutte le righe item-level (incluse quelle con supplier mismatch).
  const itemRows = valid.filter(
    (r) => r.match_type === "item" || r.match_type === "item_ambiguous",
  );

  // ≥ 2 righe (qualunque mix di item/item_ambiguous) → l'utente deve scegliere.
  if (itemRows.length >= 2) {
    return { kind: "confirm_ambiguous", rows: itemRows };
  }

  // 1 sola riga item-level → accetta (anche se è item_ambiguous: è l'unica candidata).
  if (itemRows.length === 1 && itemRows[0].stock_item_id) {
    return { kind: "accept_item", itemId: itemRows[0].stock_item_id };
  }

  return { kind: "offer_create_new" };
}
