import { describe, expect, it } from "vitest";
import { abbinamentiCerti, abbinamentiCertiPiuOrdini, ordinateNonInBolla, ordiniDellaBolla, righeOrdinePerRiga, type RigaBollaDaAbbinare, type RigaOrdine } from "@/lib/ddt/abbinaRigheOrdine";

const bolla = (c: Partial<RigaBollaDaAbbinare> & { id: string; descrizione: string }): RigaBollaDaAbbinare => ({ codice_articolo: null, quantita: null, ...c });
const ordine = (c: Partial<RigaOrdine> & { id: string; description: string }): RigaOrdine => ({ sku: null, unit_of_measure: "pz", quantity: 1, quantity_received: 0, ...c });

describe("abbinamento bolla ↔ ordine", () => {
  it("il codice uguale basta", () => {
    expect(abbinamentiCerti([bolla({ id: "b", codice_articolo: " ab-12", descrizione: "Articolo" })],
      [ordine({ id: "o", sku: "AB-12", description: "Altra descrizione" }), ordine({ id: "x", description: "Viti" })])).toEqual({ b: "o" });
  });
  it("la descrizione simile abbina, quella lontana no", () => {
    const o = [ordine({ id: "c", description: "Cemento 32.5 sacco 25 kg" }), ordine({ id: "v", description: "Viti legno 4x40" })];
    expect(abbinamentiCerti([bolla({ id: "b", descrizione: "SACCO CEMENTO 32.5" })], o)).toEqual({ b: "c" });
    expect(abbinamentiCerti([bolla({ id: "b", descrizione: "Guaina bituminosa" })], o)).toEqual({});
  });
  it("due finestre uguali si distinguono dalle misure, altrimenti decide una persona", () => {
    const o = [
      ordine({ id: "cucina", description: "Finestra PVC 2 ante", misure: { larghezza: 1195, altezza: 1400 } }),
      ordine({ id: "bagno", description: "Finestra PVC 2 ante", misure: { larghezza: 800, altezza: 1200 } }),
    ];
    expect(abbinamentiCerti([bolla({ id: "b", descrizione: "Finestra PVC 2 ante 800x1200" })], o)).toEqual({ b: "bagno" });
    expect(abbinamentiCerti([bolla({ id: "b", descrizione: "Finestra PVC 2 ante" })], o)).toEqual({});
  });
  it("il riferimento distingue le posizioni", () => {
    const o = [
      ordine({ id: "c", description: "Finestra PVC — Cucina", riferimento: "Cucina" }),
      ordine({ id: "b", description: "Finestra PVC — Bagno", riferimento: "Bagno" }),
    ];
    expect(abbinamentiCerti([bolla({ id: "r", descrizione: "Finestra PVC bagno piano terra" })], o)).toEqual({ r: "b" });
  });
  it("non tocca le scelte di una persona e non riusa una riga già presa", () => {
    const o = [ordine({ id: "o", sku: "A1", description: "Tubo" })];
    expect(abbinamentiCerti([bolla({ id: "b", codice_articolo: "A1", descrizione: "Tubo", abbinamento: "manuale" })], o)).toEqual({});
    expect(abbinamentiCerti([
      bolla({ id: "gia", descrizione: "Tubo", purchase_order_item_id: "o", abbinamento: "manuale" }),
      bolla({ id: "b", codice_articolo: "A1", descrizione: "Tubo" }),
    ], o)).toEqual({});
  });
  it("due righe della bolla sulla stessa riga dell'ordine: non ne sceglie una a caso", () => {
    const o = [ordine({ id: "o", sku: "A1", description: "Tubo" })];
    expect(abbinamentiCerti([bolla({ id: "a", codice_articolo: "A1", descrizione: "Tubo" }), bolla({ id: "b", codice_articolo: "A1", descrizione: "Tubo" })], o)).toEqual({});
  });
  it("la tendina mette prima la più probabile; dice cosa manca senza contare il già arrivato", () => {
    const o = [ordine({ id: "v", description: "Viti legno" }), ordine({ id: "c", description: "Cemento sacco" }), ordine({ id: "fatto", description: "Malta", quantity: 2, quantity_received: 2 })];
    expect(righeOrdinePerRiga(bolla({ id: "b", descrizione: "cemento sacco 25" }), o)[0].id).toBe("c");
    expect(ordinateNonInBolla([bolla({ id: "b", descrizione: "x", purchase_order_item_id: "c" })], o).map((x) => x.id)).toEqual(["v"]);
  });
  describe("una bolla, più ordini", () => {
    const a = (c: Parameters<typeof ordine>[0]) => ordine({ purchase_order_id: "A", oda_number: "ODA-1", ...c });
    const b = (c: Parameters<typeof ordine>[0]) => ordine({ purchase_order_id: "B", oda_number: "ODA-2", ...c });
    it("trova la merce anche sull'altro ordine del fornitore", () => {
      const o = [a({ id: "fin", description: "Finestra PVC bianca" }), b({ id: "gua", description: "Guaina bituminosa rotolo" })];
      expect(abbinamentiCertiPiuOrdini([
        bolla({ id: "1", descrizione: "Finestra PVC bianca" }),
        bolla({ id: "2", descrizione: "Guaina bituminosa rotolo" }),
      ], o, "A")).toEqual({ "1": "fin", "2": "gua" });
    });
    it("a parità vince l'ordine collegato alla bolla", () => {
      const o = [a({ id: "su-a", description: "Tubo rame 12" }), b({ id: "su-b", description: "Tubo rame 12" })];
      expect(abbinamentiCertiPiuOrdini([bolla({ id: "1", descrizione: "Tubo rame 12" })], o, "A")).toEqual({ "1": "su-a" });
    });
    it("lo stesso articolo su due ordini che non sono quello della bolla: decide una persona", () => {
      const o = [a({ id: "x", description: "Viti legno" }), b({ id: "su-b", description: "Tubo rame 12" }), ordine({ purchase_order_id: "C", id: "su-c", description: "Tubo rame 12" })];
      expect(abbinamentiCertiPiuOrdini([bolla({ id: "1", descrizione: "Tubo rame 12" })], o, "A")).toEqual({});
    });
    it("dice quali ordini tocca e non elenca gli ordini estranei come mancanti", () => {
      const o = [a({ id: "1a", description: "Finestra" }), a({ id: "2a", description: "Porta" }), b({ id: "1b", description: "Guaina" }), ordine({ purchase_order_id: "C", oda_number: "ODA-3", id: "1c", description: "Estranea" })];
      const righe = [bolla({ id: "r", descrizione: "x", purchase_order_item_id: "1a" }), bolla({ id: "s", descrizione: "y", purchase_order_item_id: "1b" })];
      expect(ordiniDellaBolla(righe, o, "A").map((x) => x.numero)).toEqual(["ODA-1", "ODA-2"]);
      expect(ordinateNonInBolla(righe, o, "A").map((x) => x.id)).toEqual(["2a"]);
    });
  });
});
