/// <reference types="node" />
/**
 * «Duplica» di una riga del preventivo (QuoteBuilder): la copia è una riga NUOVA.
 *
 * La copia teneva l'identificativo temporaneo dell'originale (client_temp_id). Due
 * conseguenze: cambiando la quantità della copia si scalava anche la posa legata
 * all'ORIGINALE (updateItem cerca i figli per quell'identificativo), e al salvataggio
 * la funzione che ricostruisce i legami (save_quote_items_atomic) vedeva due righe con
 * lo stesso identificativo e agganciava la posa alla copia.
 *
 * Il gestore vero si prende dal sorgente e si esegue con lo stato in memoria.
 */
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import type { QuoteItemPro } from "@/types/quoteItem";

const BUILDER = "src/pages/azienda/marketing/QuoteBuilder.tsx";

function gestoriVeri(nomi: string[], contesto: Record<string, unknown>) {
  const sorgente = ts.createSourceFile(BUILDER, readFileSync(BUILDER, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const trovati = new Map<string, ts.Expression>();
  const visita = (nodo: ts.Node) => {
    if (ts.isVariableDeclaration(nodo) && nodo.initializer && nomi.includes(nodo.name.getText(sorgente))) trovati.set(nodo.name.getText(sorgente), nodo.initializer);
    ts.forEachChild(nodo, visita);
  };
  visita(sorgente);
  vm.createContext(contesto);
  for (const nome of nomi) {
    const inizializzatore = trovati.get(nome);
    if (!inizializzatore) throw new Error(`Gestore mancante: ${nome}`);
    const codice = ts.transpileModule(`globalThis[${JSON.stringify(nome)}] = ${inizializzatore.getText(sorgente)}`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText;
    vm.runInContext(codice, contesto);
  }
  return contesto as Record<string, (...args: unknown[]) => unknown>;
}

const riga = (extra: Record<string, unknown>) => ({
  item_type: "product", item_category: "prodotto", name: "Voce", description: "", quantity: 1, unit_price: 100, discount_percent: 0, vat_rate: 22,
  unit_of_measure: "pz", sort_order: 0, prezzo_acquisto: 0, mostra_nel_pdf: true, is_optional: false, ...extra,
}) as unknown as QuoteItemPro;

function preventivoConPosaLegata() {
  const stato = {
    items: [
      // Riletti dal database: l'identificativo temporaneo è l'id della riga.
      riga({ id: "db-1", name: "Finestra", quantity: 2, client_temp_id: "db-1", parent_temp_id: null, parent_item_id: null }),
      riga({ id: "db-2", name: "Posa finestra", item_category: "posa", item_type: "service", quantity: 2, client_temp_id: "db-2", parent_temp_id: "db-1", parent_item_id: "db-1" }),
    ] as QuoteItemPro[],
  };
  let n = 0;
  const contesto: Record<string, unknown> = {
    get items() { return stato.items; },
    setItems: (v: QuoteItemPro[] | ((p: QuoteItemPro[]) => QuoteItemPro[])) => { stato.items = typeof v === "function" ? v(stato.items) : v; },
    crypto: { randomUUID: () => `nuovo-${++n}` },
    Math,
  };
  const g = gestoriVeri(["duplicaRiga", "updateItem"], contesto);
  return {
    stato,
    duplica: (i: number) => g.duplicaRiga(i) as void,
    aggiorna: (i: number, campo: string, valore: unknown) => g.updateItem(i, campo, valore) as void,
  };
}

describe("QuoteBuilder: Duplica riga", () => {
  it("la copia di un prodotto ha un identificativo suo e nessun legame", () => {
    const p = preventivoConPosaLegata();
    p.duplica(0);
    const [originale, , copia] = p.stato.items;
    expect(copia.id).toBeUndefined();
    expect(copia.name).toBe("Finestra");
    expect(copia.client_temp_id).toBeTruthy();
    expect(copia.client_temp_id).not.toBe(originale.client_temp_id);
    expect(copia.sort_order).toBe(2);
  });

  it("cambiare la quantità della copia non tocca la posa dell'originale", () => {
    const p = preventivoConPosaLegata();
    p.duplica(0);
    p.aggiorna(2, "quantity", 5);
    expect(p.stato.items.map((r) => r.quantity)).toEqual([2, 2, 5]);
  });

  it("cambiare la quantità dell'originale scala ancora la sua posa (e solo quella)", () => {
    const p = preventivoConPosaLegata();
    p.duplica(0);
    p.aggiorna(0, "quantity", 4);
    expect(p.stato.items.map((r) => r.quantity)).toEqual([4, 4, 2]);
  });

  it("la copia di una posa resta legata allo stesso prodotto, con un identificativo suo", () => {
    const p = preventivoConPosaLegata();
    p.duplica(1);
    const copiaPosa = p.stato.items[2];
    expect(copiaPosa).toMatchObject({ parent_temp_id: "db-1", parent_item_id: "db-1", item_category: "posa" });
    expect(copiaPosa.client_temp_id).not.toBe("db-2");
    // Raddoppiando il prodotto, scalano le DUE pose.
    p.aggiorna(0, "quantity", 4);
    expect(p.stato.items.map((r) => r.quantity)).toEqual([4, 4, 4]);
  });
});
