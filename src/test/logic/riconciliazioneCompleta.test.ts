import { describe, it, expect } from "vitest";
import { scenarioRiconciliazione } from "../../../supabase/functions/_shared/riconciliazioneFattureScenari";
import {
  pianificaLotti,
  contestoLotto,
  unisciLotti,
} from "../../../supabase/functions/_shared/lottiRiconciliazione";
import {
  preparaQuote,
  quoteDaSalvare,
  equivalenzeConfermate,
  identitaFornitore,
} from "../../../supabase/functions/_shared/ripartizioneFatture";
import {
  esitiRiconciliazione,
  datiRiconciliazione,
  type PropostaRiconciliazione,
} from "../../../supabase/functions/_shared/riconciliazioneFattureAI";
import { trovaRighePdf } from "@/lib/fatturazione/rigaPdf";
const scenario = () => scenarioRiconciliazione("due-ddt")!;
const proposta = (c = scenario()): PropostaRiconciliazione => ({
  righe: datiRiconciliazione(c).fattura.map((f) => ({
    fattura: f.id,
    ddt: ["d1-r1", "d2-r1"],
    oda: ["o1-r1"],
    affidabilita: "alta",
    motivo: "Stesso articolo",
  })),
  avvisi: [],
});
describe("riconciliazione completa", () => {
  it("ripartisce una fattura tra due consegne senza riutilizzare quantità", () => {
    const c = scenario(),
      quote = preparaQuote(c, proposta(c), { "1": "accettata" });
    expect(quote.map((q) => q.quantita_fattura)).toEqual(["30", "15"]);
    expect(quoteDaSalvare(quote).map((q) => q.quantita_fattura)).toEqual([
      30, 15,
    ]);
  });
  it("sottrae quantità già riconciliate, senza sommarle alla vecchia valorizzazione", () => {
    const c = scenario();
    c.consumi = [
      { fattura_id: "altra", ddt_id: "d1", riga_id: "d1-r1", quantita: 20 },
    ];
    c.valorizzazioni = [
      { fattura_id: "altra", ddt_id: "d1", riga_id: "d1-r1", quantita: 20 },
    ];
    expect(datiRiconciliazione(c).bolle[0].giaFatturata).toBe(20);
    expect(esitiRiconciliazione(c, proposta(c))[0].quantitaDisponibile).toBe(
      30,
    );
  });
  it("un precedente collegamento incompleto impedisce una falsa conferma del residuo", () => {
    const c = scenario();
    c.consumi = [
      { fattura_id: "altra", ddt_id: "d1", riga_id: "d1-r1", quantita: 5 },
    ];
    c.altre_fatture = [
      { ddt_ricezione_id: "d1", fattura_ricevuta_id: "altra", completa: false },
    ];
    expect(esitiRiconciliazione(c, proposta(c))[0].stato).toBe(
      "da_controllare",
    );
    const quote = preparaQuote(c, proposta(c), { "1": "accettata" });
    expect(quote[0].quantita_fattura).toBe("");
    expect(quote[0].conferma_residuo).toBe(false);
  });
  it("rifiuta una quantità scritta male senza cancellare silenziosamente la ripartizione", () => {
    const c = scenario();
    const quote = preparaQuote(c, proposta(c), { "1": "accettata" });
    quote[0].quantita_fattura = "non numerico";
    expect(() => quoteDaSalvare(quote)).toThrow("Controlla quantità");
    quote[0].quantita_fattura = "";
    expect(quoteDaSalvare(quote)).toHaveLength(1);
  });
  it("non inventa una conversione, ma riusa il fattore confermato per articolo e fornitore", () => {
    const c = scenario();
    (c.fattura.righe as Record<string, unknown>[])[0] = {
      numero_linea: 1,
      descrizione: "Adesivo bianco",
      quantita: 2,
      unita_misura: "sacco",
      prezzo_unitario: 25,
      imponibile: 50,
    };
    for (const d of c.ddt)
      (d.righe as Record<string, unknown>[])[0].unita_misura = "kg";
    (c.oda[0].righe as Record<string, unknown>[])[0] = {
      id: "o1-r1",
      description: "Adesivo",
      unit_of_measure: "kg",
      quantity: 100,
      unit_price: 1,
      line_total: 100,
    };
    expect(esitiRiconciliazione(c, proposta(c))[0].stato).toBe(
      "da_controllare",
    );
    c.conversioni = [
      {
        descrizione_articolo: "adesivo bianco",
        codice_articolo: "",
        unita_fattura: "sacco",
        unita_ddt: "kg",
        fattore: 25,
      },
    ];
    expect(esitiRiconciliazione(c, proposta(c))[0].stato).toBe("coerente");
  });
  it("analizza 90 righe in tre lotti mantenendo gli identificativi originali", () => {
    const c = scenarioRiconciliazione("fattura-lunga")!,
      lotti = pianificaLotti(c);
    expect(lotti).toHaveLength(3);
    expect(datiRiconciliazione(contestoLotto(c, lotti[2])).fattura[0].id).toBe(
      "61",
    );
    const parti = lotti.map((l) => proposta(contestoLotto(c, l)));
    expect(unisciLotti(c, parti).righe).toHaveLength(90);
    expect(() => unisciLotti(c, parti.slice(0, 2))).toThrow("incompleta");
  });
  it("non taglia le righe sorgente quando ci sono più di 350 voci", () => {
    const c = scenario();
    c.ddt[0].righe = Array.from({ length: 450 }, (_, i) => ({
      id: `r${i}`,
      descrizione: "Prodotto",
      unita_misura: "pz",
      quantita: 1,
    }));
    const lotti = pianificaLotti(c);
    expect(lotti).toHaveLength(3);
    expect(new Set(lotti.flatMap((l) => l.ddt)).size).toBe(451);
  });
  it("le equivalenze appartengono al contesto del fornitore e richiedono identità esatta", () => {
    const c = scenario(),
      d = datiRiconciliazione(c);
    c.equivalenze = [
      {
        fattura_descrizione: identitaFornitore(d.fattura[0].descrizione),
        fattura_codice: "",
        documento_descrizione: identitaFornitore(d.bolle[0].descrizione),
        documento_codice: "",
        attiva: true,
      },
    ];
    expect(equivalenzeConfermate(c).righe[0].ddt).toEqual(["d1-r1"]);
    c.equivalenze[0].attiva = false;
    expect(equivalenzeConfermate(c).righe[0].ddt).toEqual([]);
  });
  it("evidenzia coordinate tratte dal PDF e non confonde una descrizione diversa", () => {
    const items = [
      {
        str: "Descrizione Quantità Prezzo",
        transform: [10, 0, 0, 10, 40, 720],
        width: 475,
        height: 10,
      },
      {
        str: "Malta adesiva A81 bianca 25 kg",
        transform: [10, 0, 0, 10, 40, 700],
        width: 180,
        height: 10,
      },
      { str: "45", transform: [10, 0, 0, 10, 500, 700], width: 15, height: 10 },
      {
        str: "Rete fibra 160 grammi",
        transform: [10, 0, 0, 10, 40, 650],
        width: 180,
        height: 10,
      },
    ];
    expect(
      trovaRighePdf(items, "Malta adesiva A81 bianca 25 kg")[0],
    ).toMatchObject({ x: 40, y: 697.5, larghezza: 475 });
    expect(trovaRighePdf(items, "Malta adesiva A81 bianca 25 kg")).toHaveLength(
      1,
    );
    expect(trovaRighePdf(items, "Cemento grigio 425 50kg")).toEqual([]);
    expect(trovaRighePdf([], "Malta adesiva A81")).toEqual([]);
  });
  it('trova la posizione P3 senza evidenziare P30',()=>{
    const items=[{str:'P3 Finestra PVC',transform:[10,0,0,10,40,700],width:180,height:10},{str:'P30 Finestra PVC',transform:[10,0,0,10,40,650],width:180,height:10}];
    expect(trovaRighePdf(items,'P3').map(r=>r.testo)).toEqual(['P3 Finestra PVC']);
  });
});
