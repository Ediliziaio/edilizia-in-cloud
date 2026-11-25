import { describe, expect, it } from "vitest";
import { dataLetta, normalizzaOrdineFornitore, numeroLetto } from "../../../supabase/functions/_shared/estrazioneOrdineFornitore";
import { confrontoTotaleDocumento, fornitoreDaDocumento, propostaDaLettura } from "@/lib/orders/letturaOdaDocumento";
import { righeDagliArticoli } from "@/lib/orders/nuovoOdaCommessa";

const RISPOSTA: Record<string, unknown> = {
  fornitore: { ragione_sociale: "Edil Forniture S.r.l.", partita_iva: "IT 01234567890", codice_fiscale: null as string | null },
  numero_documento: "ORD 2026/145",
  data_documento: "20/11/2026",
  data_consegna: "2026-12-03",
  righe: [
    { codice_articolo: "MF8", descrizione: "Mattoni forati 8x25x25", quantita: "180", unita: "nr.", prezzo_unitario: "0,75", iva_percentuale: 22 },
    { codice_articolo: null as string | null, descrizione: "Trasporto in cantiere", quantita: 1, unita: null as string | null, prezzo_unitario: null as number | null, importo: "45,00", iva_percentuale: "22" },
    { codice_articolo: "CEM", descrizione: "Cemento 32,5", quantita: 10, unita: "sacchi", prezzo_unitario: 8, sconto_percentuale: 10, importo: 72, iva_percentuale: 22 },
    { descrizione: "", quantita: 3 },
  ],
  totale: "1.234,50",
  avvisi: ["Pagina 2 sfocata"],
};

describe("lettura di un ordine d'acquisto su carta", () => {
  it("normalizza numeri italiani, date, importi di riga e sconti", () => {
    expect(numeroLetto("1.234,50")).toBe(1234.5);
    expect(numeroLetto("1.000")).toBe(1000);
    expect(dataLetta("31/02/2026")).toBeNull();
    expect(dataLetta("2026-13-01")).toBeNull();
    expect(dataLetta("3.12.26")).toBe("2026-12-03");
    const o = normalizzaOrdineFornitore(RISPOSTA);
    expect(o.numero).toBe("ORD 2026/145");
    expect(o.data).toBe("2026-11-20");
    expect(o.consegna).toBe("2026-12-03");
    expect(o.totale).toBe(1234.5);
    expect(o.righe).toHaveLength(3);
    expect(o.righe[0]).toMatchObject({ quantita: 180, prezzo_unitario: 0.75, iva: 22, unita: "nr." });
    // Solo l'importo di riga: il prezzo unitario si ricava.
    expect(o.righe[1].prezzo_unitario).toBe(45);
    // Prezzo di listino con sconto che torna con l'importo: si prende lo scontato.
    expect(o.righe[2].prezzo_unitario).toBe(7.2);
    expect(o.avvisi).toEqual(["Pagina 2 sfocata"]);
  });

  it("abbina fornitore per partita IVA e righe agli articoli della commessa; il resto diventa righe libere", () => {
    const articoli = righeDagliArticoli([
      { id: "a1", name: "Mattoni forati", quantity: 200, purchase_price: 0.8, vat_rate: 22, supplier_id: "s1", unita_misura: "pz" },
      { id: "a2", name: "Pittura lavabile", quantity: 4, purchase_price: 30, vat_rate: 22, supplier_id: "s2", unita_misura: "secchi" },
    ] as never, null);
    const p = propostaDaLettura(normalizzaOrdineFornitore(RISPOSTA), [
      { id: "s1", name: "Edil Forniture", vat_number: "01234567890" },
      { id: "s2", name: "Colorificio Rossi", vat_number: "09876543210" },
    ], articoli);
    expect(p.fornitore).toEqual({ id: "s1", motivo: "partita IVA" });
    expect(p.riferimento).toBe("ORD 2026/145 del 20/11/2026");
    expect(p.consegna).toBe("2026-12-03");
    expect(p.modificheArticoli["art:a1"]).toMatchObject({ scelta: true, quantity: 180, unit_price: 0.75, vat_rate: 22, price_pending: false });
    // Non è nel documento: resta in elenco, non spuntato.
    expect(p.modificheArticoli["art:a2"]).toEqual({ scelta: false });
    expect(p.libere.map((r) => [r.description, r.quantity, r.unit_of_measure, r.unit_price])).toEqual([
      ["Trasporto in cantiere", 1, "pz", 45],
      ["Cemento 32,5 (CEM)", 10, "conf", 7.2],
    ]);
    expect(p.abbinate).toBe(1);
  });

  it("un fornitore che non è in rubrica non si indovina: si dice cosa c'è scritto", () => {
    const p = propostaDaLettura(normalizzaOrdineFornitore(RISPOSTA), [{ id: "s9", name: "Altro", vat_number: "11111111111" }], []);
    expect(p.fornitore).toBeNull();
    expect(p.fornitoreLetto).toBe("Edil Forniture S.r.l. · P.IVA IT 01234567890");
  });

  it("il totale del documento si confronta con quello delle righe, con tolleranza sugli arrotondamenti", () => {
    expect(confrontoTotaleDocumento({ imponibile: 1000, iva: 220, totale: 1220 }, { imponibile: 999.4, totale: 1219.3 }))
      .toEqual({ voce: "imponibile", documento: 1000, righe: 999.4, torna: true });
    expect(confrontoTotaleDocumento({ imponibile: null, iva: 220, totale: 1220 }, { imponibile: 900, totale: 1098 }))
      .toMatchObject({ voce: "imponibile", documento: 1000, torna: false });
    expect(confrontoTotaleDocumento({ imponibile: null, iva: null, totale: 1220 }, { imponibile: 1000, totale: 1220 }))
      .toMatchObject({ voce: "totale", torna: true });
    expect(confrontoTotaleDocumento({ imponibile: null, iva: null, totale: null }, { imponibile: 1, totale: 1 })).toBeNull();
  });

  it("il fornitore che manca nasce dai soli dati scritti sul documento", () => {
    expect(fornitoreDaDocumento(normalizzaOrdineFornitore(RISPOSTA), "co")).toEqual({
      company_id: "co", name: "Edil Forniture S.r.l.", vat_number: "01234567890", fiscal_code: null,
    });
    expect(fornitoreDaDocumento({ fornitore: { nome: null, partita_iva: "123", codice_fiscale: null } }, "co")).toBeNull();
  });
});
