/**
 * Un preventivo di soli materiali non fa nascere una commessa senza fasi (07/11/2026).
 * crea_commessa_preventivo_atomic crea le fasi solo dai capitoli di un computo o dalle
 * voci di lavoro (posa, trasporto, ...): per un preventivo di sole forniture non ne
 * creava nessuna, e la pagina nascondeva le fasi di partenza. Trovato con una
 * simulazione sulla Demo 2 (preventivo OFF-2026-010, 23 righe, 0 fasi).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { prefillDaPreventivo } from "@/lib/preventivi/prefillPreventivo";

const preventivo = (source: string | null) => ({ id: "q", source, status: "accettata", version: 1, quote_number: "P-1", title: "Prova" });
const materiale = { id: "a", name: "Finestra PVC", quantity: 2, unit_price: 500, line_total: 1000, item_type: "product", item_category: "serramento" };
const posa = { id: "b", name: "Posa", quantity: 2, unit_price: 100, line_total: 200, item_type: "service", item_category: "posa" };

describe("da quale parte vengono le fasi della commessa nata da un preventivo", () => {
  it("soli materiali: il server non crea fasi, le mette il modello", () => {
    expect(prefillDaPreventivo(preventivo("whatsapp"), [materiale]).fasiDalServer).toBe(false);
  });
  it("con una voce di lavoro le crea il server", () => {
    expect(prefillDaPreventivo(preventivo("manual"), [materiale, posa]).fasiDalServer).toBe(true);
  });
  it("da un computo le crea il server dai capitoli, anche se le voci sono materiali", () => {
    expect(prefillDaPreventivo(preventivo("modulo:computo:x"), [materiale]).fasiDalServer).toBe(true);
  });
  it("la pagina usa il modello quando il server non crea fasi, e non prima di aver letto il preventivo", () => {
    const pagina = readFileSync(join(__dirname, "../../pages/azienda/CreateOrder.tsx"), "utf8");
    expect(pagina).toContain("const fasiDalModello = !selectedQuoteId || quotePrefill?.fasiDalServer === false;");
    expect(pagina).not.toContain("!selectedQuoteId && fasiDaCreare");
    expect(pagina).toContain("{fasiDalModello && <div");
  });
});
