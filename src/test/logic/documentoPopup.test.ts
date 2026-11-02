import { describe, expect, it } from "vitest";
import { chiudeIlPopup, documentoDaPercorso } from "@/lib/orders/documentoPopup";

describe("documenti in popup", () => {
  it("riconosce bolle, ordini e richieste", () => {
    expect(documentoDaPercorso("/azienda/ddt/a1")).toEqual({ tipo: "ddt", id: "a1", percorso: "/azienda/ddt/a1" });
    expect(documentoDaPercorso("/azienda/ordini-acquisto/b2?x=1")).toMatchObject({ tipo: "oda", id: "b2", percorso: "/azienda/ordini-acquisto/b2" });
    expect(documentoDaPercorso("/azienda/richieste-offerta/c3")).toMatchObject({ tipo: "rdo", id: "c3" });
  });
  it("un documento emesso si apre nella sua pagina di lettura; le pagine di «documenti» no", () => {
    const id = "95746f5d-4dd6-465c-a5ec-2a8a8e80109f";
    expect(documentoDaPercorso(`/azienda/documenti/${id}`)).toEqual({ tipo: "documento", id, percorso: `/azienda/documenti/${id}/dettaglio` });
    expect(documentoDaPercorso("/azienda/documenti/fatture-ricevute")).toBeNull();
    expect(documentoDaPercorso("/azienda/documenti/tipi-fornitori")).toBeNull();
  });
  it("il resto non si apre in popup", () => {
    for (const p of ["/azienda/ordini/x", "/azienda/ordini-acquisto", "/azienda/ddt/a/b", "https://x.it/azienda/ddt/a", "/azienda/magazzino"]) expect(documentoDaPercorso(p)).toBeNull();
  });
  it("dal popup, le liste e la commessa stessa chiudono; un'altra commessa no", () => {
    expect(chiudeIlPopup("/azienda/ordini?tab=ddt", "o1")).toBe(true);
    expect(chiudeIlPopup("/azienda/ordini/o1", "o1")).toBe(true);
    expect(chiudeIlPopup("/azienda/ordini/o1?tab=finanza", "o1")).toBe(true);
    expect(chiudeIlPopup("/azienda/ordini/o2", "o1")).toBe(false);
    expect(chiudeIlPopup("/azienda/magazzino", "o1")).toBe(false);
  });
});
