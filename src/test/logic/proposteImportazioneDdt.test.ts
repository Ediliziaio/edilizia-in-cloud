import { describe, expect, it } from "vitest";
import {
  proponiCollegamenti,
  confrontaRighe,
  unitaComparabile,
} from "@/lib/ddt/proposteImportazione";
import type { DDTRigaNuova } from "@/hooks/useDDTRicezione";
import type { RigaOrdine } from "@/lib/ddt/abbinaRigheOrdine";
const riga = (patch: Partial<DDTRigaNuova> = {}) =>
  ({
    descrizione: "Finestra PVC completa",
    codice_articolo: "A1",
    quantita: 2,
    unita_misura: "pz",
    ...patch,
  }) as DDTRigaNuova;
const ordinata = (patch: Partial<RigaOrdine> = {}): RigaOrdine => ({
  id: "o",
  description: "Finestra PVC completa",
  sku: "A1",
  quantity: 5,
  quantity_received: 2,
  unit_of_measure: "pz",
  ...patch,
});
describe("Proposte di commessa e OdA", () => {
  it("preferisce il riferimento esatto del fornitore, senza confondere ODA-1 con ODA-10", () => {
    const p = proponiCollegamenti(
      { riferimenti: { ordine_acquisto: "Rif. ODA-10" } },
      "s",
      [],
      [
        { id: "a", oda_number: "ODA-1", supplier_id: "s", order_id: null },
        { id: "b", oda_number: "ODA-10", supplier_id: "s", order_id: null },
        { id: "c", oda_number: "ODA-10", supplier_id: "altro", order_id: null },
      ],
    );
    expect(p.oda.map((o) => o.id)).toEqual(["b", "a"]);
    expect(p.oda[0].riferimento).toBe(true);
    expect(p.oda[1].riferimento).toBe(false);
  });
  it("usa il codice commessa o l’indirizzo intero, non il solo nome della via", () => {
    const commesse = [
      { id: "a", order_code: "ORD-1", indirizzo_lavori: "Via Dante 68, Lodi" },
      { id: "b", order_code: "ORD-2", indirizzo_lavori: "Via Dante 69, Lodi" },
    ];
    expect(
      proponiCollegamenti(
        { luogo_destinazione: { indirizzo: "Via Dante 68, Lodi" } },
        null,
        commesse,
        [],
      ).commesse.map((c) => c.id),
    ).toEqual(["a"]);
    expect(
      proponiCollegamenti(
        { luogo_destinazione: { indirizzo: "Via Dante" } },
        null,
        commesse,
        [],
      ).commesse,
    ).toEqual([]);
  });
  it("non propone OdA di altri fornitori o senza un fornitore scelto", () => {
    expect(
      proponiCollegamenti(
        null,
        null,
        [],
        [{ id: "a", oda_number: "ODA-1", supplier_id: "s", order_id: null }],
      ).oda,
    ).toEqual([]);
  });
});
describe("Confronto quantità della bolla con residuo ordine", () => {
  it("distingue consegna parziale, completa ed eccesso considerando quanto già ricevuto", () => {
    expect(confrontaRighe([riga()], [ordinata()])[0].esito).toMatch(/parziale/);
    expect(
      confrontaRighe([riga({ quantita: 3 })], [ordinata()])[0].esito,
    ).toMatch(/coerente/);
    expect(
      confrontaRighe([riga({ quantita: 4 })], [ordinata()])[0].esito,
    ).toMatch(/Eccesso di 1/);
  });
  it("non confronta mq con pezzi o con una unità mancante", () => {
    expect(unitaComparabile("cad", "pz")).toBe(true);
    expect(unitaComparabile(null, "pz")).toBe(false);
    expect(
      confrontaRighe([riga({ unita_misura: "mq" })], [ordinata()])[0].esito,
    ).toMatch(/non confrontabili/);
  });
  it("somma le righe confermate sullo stesso articolo", () => {
    const righe = [
      riga({ quantita: 2, purchase_order_item_id: "o" }),
      riga({ quantita: 2, purchase_order_item_id: "o" }),
    ];
    expect(
      confrontaRighe(righe, [ordinata()]).every((r) =>
        r.esito.includes("Eccesso di 1"),
      ),
    ).toBe(true);
  });
  it("non presenta una proposta come associazione già confermata", () => {
    const [c] = confrontaRighe([riga()], [ordinata()]);
    expect(c.propostaId).toBe("o");
    expect(c.confermata).toBe(false);
  });
});
it("non propone una commessa eliminata o non accessibile collegata a un vecchio OdA", () => {
  expect(
    proponiCollegamenti(
      { riferimenti: { ordine_acquisto: "ODA-10" } },
      "s",
      [],
      [
        {
          id: "o",
          oda_number: "ODA-10",
          supplier_id: "s",
          order_id: "eliminata",
        },
      ],
    ).oda,
  ).toEqual([]);
});
