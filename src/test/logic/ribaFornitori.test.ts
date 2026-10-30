import { describe, expect, it } from "vitest";
import { riepilogoRiba, type RibaFornitore } from "@/lib/costi/ribaFornitori";
import { METODI_PAGAMENTO_COSTO, etichettaMetodoCosto } from "@/lib/costi/metodiPagamento";

const riba = (over: Partial<RibaFornitore>): RibaFornitore => ({
  rata_id: "r1",
  cost_id: "c1",
  fornitore: "Centrufficio S.p.A.",
  order_code: null,
  numero_fattura: "26VIT11181",
  numero_rata: 1,
  rate_riba_della_fattura: 4,
  scadenza: "2026-10-31",
  importo: 939.7,
  stato: "in_arrivo",
  giorni: 2,
  ...over,
});

// Il caso vero di renova, 29/10/2026: quattro RiBa Centrufficio e due passate.
const RENOVA: RibaFornitore[] = [
  riba({ numero_rata: 1, scadenza: "2026-10-31", stato: "in_arrivo", giorni: 2 }),
  riba({ numero_rata: 2, scadenza: "2026-11-30", stato: "futura", giorni: 32 }),
  riba({ numero_rata: 3, scadenza: "2027-01-10", stato: "futura", giorni: 73 }),
  riba({ numero_rata: 4, scadenza: "2027-01-31", stato: "futura", giorni: 94 }),
  riba({ cost_id: "c2", fornitore: "AFG TRASPORTI", numero_rata: 1, rate_riba_della_fattura: 1,
         scadenza: "2026-05-31", importo: 366, stato: "passata", giorni: -151 }),
  riba({ cost_id: "c3", fornitore: "CC ARCHITECTS", numero_rata: 1, rate_riba_della_fattura: 1,
         scadenza: "2026-03-12", importo: 1015.04, stato: "passata", giorni: -231 }),
];

describe("Il riquadro delle RiBa ai fornitori", () => {
  it("conta solo le RiBa dei prossimi 30 giorni come «in arrivo»", () => {
    const r = riepilogoRiba(RENOVA, 5000);
    expect(r.inArrivo).toHaveLength(1);
    expect(r.totaleInArrivo).toBeCloseTo(939.7, 2);
  });

  it("le passate non registrate stanno a parte, non si confondono con le pagate", () => {
    const r = riepilogoRiba(RENOVA, 5000);
    expect(r.passate).toHaveLength(2);
    expect(r.totalePassate).toBeCloseTo(1381.04, 2);
  });

  it("dice quanto manca quando il saldo non copre le RiBa in arrivo", () => {
    expect(riepilogoRiba(RENOVA, 500).scoperto).toBeCloseTo(439.7, 2);
    expect(riepilogoRiba(RENOVA, 5000).scoperto).toBe(0);
  });

  it("senza un conto collegato la copertura è sconosciuta, non «coperta»", () => {
    expect(riepilogoRiba(RENOVA, null).scoperto).toBeNull();
  });

  it("una RiBa avvisata dalla banca o da bloccare, entro 30 giorni, parte comunque", () => {
    // finché nessuno l'ha fermata davvero, la banca la addebiterà
    const r = riepilogoRiba([
      riba({ stato: "avvisata", giorni: 5 }),
      riba({ stato: "da_bloccare", giorni: 9, importo: 100 }),
      riba({ stato: "richiamata", giorni: 9, importo: 5000 }),
      riba({ stato: "avvisata", giorni: 45 }),
    ], 5000);
    expect(r.inArrivo).toHaveLength(2);
    expect(r.totaleInArrivo).toBeCloseTo(1039.7, 2);
  });

  it("le insolute stanno a parte: non sono né pagate né in arrivo", () => {
    const r = riepilogoRiba([riba({ stato: "insoluta", giorni: -3, importo: 250 })], 5000);
    expect(r.insolute).toHaveLength(1);
    expect(r.totaleInsolute).toBe(250);
    expect(r.inArrivo).toHaveLength(0);
    expect(r.passate).toHaveLength(0);
  });

  it("senza RiBa è tutto a zero", () => {
    const r = riepilogoRiba([], 1000);
    expect(r.totaleInArrivo).toBe(0);
    expect(r.totalePassate).toBe(0);
    expect(r.scoperto).toBe(0);
  });
});

describe("I metodi di pagamento di un costo", () => {
  it("sono esattamente quelli ammessi dal database, RiBa compresa", () => {
    // company_costs_payment_method_check, migrazione 20281029233000
    expect(METODI_PAGAMENTO_COSTO.map((m) => m.value).sort()).toEqual(
      ["altro", "assegno", "bonifico", "carta", "riba", "rid", "contanti"].sort(),
    );
  });

  it("un codice solo per la RiBa, con la sua etichetta", () => {
    expect(etichettaMetodoCosto("riba")).toBe("RiBa");
    expect(METODI_PAGAMENTO_COSTO.some((m) => m.value === ("ri.ba" as string))).toBe(false);
  });

  it("un codice sconosciuto si mostra com'è, un vuoto non si mostra", () => {
    expect(etichettaMetodoCosto("ri.ba")).toBe("ri.ba");
    expect(etichettaMetodoCosto(null)).toBeNull();
    expect(etichettaMetodoCosto("")).toBeNull();
  });
});
