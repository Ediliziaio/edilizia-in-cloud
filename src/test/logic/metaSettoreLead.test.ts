import { describe, expect, it } from "vitest";
import { campoSettore, eDomandaSettore, settoreDaRisposte } from "../../../supabase/functions/_shared/metaSettoreLead";

// 19/09/2026: «tra le domande del lead form c'è anche il settore di
// appartenenza, che è importante» — deve arrivare sul contatto e
// sull'opportunità, non solo nelle note.
describe("il settore dal modulo Facebook", () => {
  it("riconosce la domanda comunque sia scritta", () => {
    expect(settoreDaRisposte({ full_name: "Mario Rossi", "settore_di_appartenenza": "serramenti" })).toBe("Serramenti");
    expect(settoreDaRisposte({ "In che settore lavori?": "Bagni e ristrutturazioni" })).toBe("Bagni e ristrutturazioni");
    expect(settoreDaRisposte({ "Settore attività": "fotovoltaico" })).toBe("Fotovoltaico");
  });

  // Le chiavi vere dei moduli del titolare (19/09/2026), come le manda Meta.
  it("riconosce le domande dei moduli veri: «di cosa si occupa / ti occupi»", () => {
    expect(settoreDaRisposte({
      "stai_già_facendo_attività_di_marketing?": "no",
      "di_cosa_si_occupa_la_tua_azienda?": "commercializzazione_infissi",
    })).toBe("Commercializzazione infissi");
    expect(settoreDaRisposte({ "città": "Trani", "di_cosa_ti_occupi?": "serramenti" })).toBe("Serramenti");
    expect(eDomandaSettore("Tipo di attività")).toBe(true);
    expect(eDomandaSettore("tipologia_azienda")).toBe(true);
  });

  it("«Stai già facendo attività di marketing?» non è la domanda sul settore", () => {
    expect(eDomandaSettore("stai_già_facendo_attività_di_marketing?")).toBe(false);
    expect(settoreDaRisposte({ "stai_già_facendo_attività_di_marketing?": "si" })).toBeNull();
    expect(eDomandaSettore("inbox_url")).toBe(false);
  });

  it("ripulisce le risposte a scelta di Meta", () => {
    expect(settoreDaRisposte({ settore: "serramenti_e_infissi" })).toBe("Serramenti e infissi");
    expect(settoreDaRisposte({ settore: ["tetti", "fotovoltaico"] })).toBe("Tetti, fotovoltaico");
  });

  it("non inventa: niente domanda sul settore, o risposta vuota", () => {
    expect(settoreDaRisposte({ full_name: "Mario", email: "m@x.it" })).toBeNull();
    expect(settoreDaRisposte({ settore: "  " })).toBeNull();
    expect(settoreDaRisposte(null)).toBeNull();
    // «Sottosettore» o parole che contengono «settore» a metà non sono la domanda.
    expect(settoreDaRisposte({ assettore: "x" })).toBeNull();
  });

  it("trova il campo «Settore» dell'azienda, senza badare a maiuscole e spazi", () => {
    expect(campoSettore([{ id: "a", name: "Fonte del dato" }, { id: "b", name: " settore " }])).toBe("b");
    expect(campoSettore([{ id: "a", name: "Settore di appartenenza" }])).toBeNull();
    expect(campoSettore([])).toBeNull();
  });
});
