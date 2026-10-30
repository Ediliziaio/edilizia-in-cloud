import { describe, expect, it } from "vitest";
import {
  CAUSALI_TRASPORTO,
  causalePerDestinatario,
  codiceCausale,
  etichettaCausale,
} from "@/lib/ddt/causaliTrasporto";
import { datiTrasportoDdt, destinatarioLabel } from "@/lib/magazzino/usciteDdt";

describe("Causali di trasporto del DDT", () => {
  it("il materiale portato su un proprio cantiere viaggia come trasferimento, non come vendita", () => {
    expect(causalePerDestinatario("cantiere")).toBe("trasferimento_cantiere");
    expect(causalePerDestinatario("cliente")).toBe("vendita");
    expect(causalePerDestinatario("libero")).toBe("vendita");
  });

  it("sul PDF va l'etichetta, non il codice", () => {
    expect(etichettaCausale("conto_lavoro")).toBe("Conto lavoro");
    expect(etichettaCausale("trasferimento_cantiere")).toBe("Trasferimento a cantiere");
  });

  it("una causale salvata come etichetta (i DDT vecchi) si riconosce lo stesso", () => {
    expect(codiceCausale("Vendita")).toBe("vendita");
    expect(codiceCausale("Trasferimento a cantiere")).toBe("trasferimento_cantiere");
    expect(etichettaCausale("Vendita")).toBe("Vendita");
  });

  it("un testo libero resta com'è; il vuoto resta vuoto", () => {
    expect(etichettaCausale("Prestito d'uso")).toBe("Prestito d'uso");
    expect(codiceCausale("Prestito d'uso")).toBe("Prestito d'uso");
    expect(etichettaCausale(null)).toBe("");
  });

  it("i codici sono unici", () => {
    const codici = CAUSALI_TRASPORTO.map((c) => c.value);
    expect(new Set(codici).size).toBe(codici.length);
  });
});

describe("Dati di trasporto per create_ddt_from_uscita", () => {
  it("manda solo quello che è stato scritto", () => {
    expect(datiTrasportoDdt({ causale: "vendita", porto: "Franco", colli: "", aspetto: " ", peso: "" }))
      .toEqual({ causale_trasporto: "vendita", porto: "Franco" });
  });

  it("colli interi e positivi, aspetto e peso ripuliti", () => {
    expect(datiTrasportoDdt({ causale: "conto_lavoro", porto: "Assegnato", colli: "3", aspetto: " Bancale ", peso: "120,5" }))
      .toEqual({ causale_trasporto: "conto_lavoro", porto: "Assegnato", numero_colli: "3", aspetto_beni: "Bancale", peso: "120,5" });
    expect(datiTrasportoDdt({ causale: "vendita", porto: "Franco", colli: "0", aspetto: "", peso: "" }).numero_colli).toBeUndefined();
    expect(datiTrasportoDdt({ causale: "vendita", porto: "Franco", colli: "abc", aspetto: "", peso: "" }).numero_colli).toBeUndefined();
  });

  it("il destinatario si legge dallo snapshot, poi dai dati liberi", () => {
    expect(destinatarioLabel({ destinatario_tipo: "cantiere", cliente_snapshot: { ragione_sociale: "Rossi" }, destinatario_libero: null })).toBe("Rossi");
    expect(destinatarioLabel({ destinatario_tipo: "libero", cliente_snapshot: null, destinatario_libero: { ragione_sociale: "Bianchi" } })).toBe("Bianchi");
    expect(destinatarioLabel({ destinatario_tipo: "cantiere", cliente_snapshot: null, destinatario_libero: null })).toBe("Cantiere/commessa");
  });
});
