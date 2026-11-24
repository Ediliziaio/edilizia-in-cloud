import { describe, expect, it } from "vitest";
import { VERSIONE_REGOLE_PREVISIONE, type Previsione } from "@/lib/planimetrie/previsioneLavori";
import { confrontoPrevistoReale, fasePrevisioneDi, istantaneaPrevisione, previsioneSalvata } from "@/lib/planimetrie/previstoReale";

const previsione: Previsione = {
  fasi: [
    { fase: "Demolizioni", importo: 2000, manodopera: 1700, materiali: 300, giorni: 3, giorniBase: 3, attesa: 0, voci: 2 },
    { fase: "Pavimenti e rivestimenti", importo: 5000, manodopera: 2000, materiali: 3000, giorni: 6, giorniBase: 6, attesa: 0, voci: 3 },
    { fase: "Tinteggiature", importo: 1000, manodopera: 750, materiali: 250, giorni: 2, giorniBase: 2, attesa: 14, perche: "asciugatura", voci: 1 },
  ],
  lavori: 8000, manodopera: 4450, materiali: 3550, extra: [], totaleExtra: 0, totale: 8000,
  intervallo: { minimo: 7600, probabile: 8000, massimo: 8400, incertezzaPct: 5 },
  giorniLavoro: 11, giorniAttesa: 14, giorniCalendario: 30,
  fuori: { senzaPrezzo: 0, senzaQuantita: 0, nonStimate: 0 }, indicativi: 0,
};

describe("fasePrevisioneDi", () => {
  it("abbina i nomi delle fasi della commessa", () => {
    expect(fasePrevisioneDi("Demolizioni e rimozioni")).toBe("Demolizioni");
    expect(fasePrevisioneDi("Posa pavimento radiante")).toBe("Pavimento radiante");
    expect(fasePrevisioneDi("Massetti")).toBe("Pavimento radiante");
    expect(fasePrevisioneDi("Pavimenti e piastrelle")).toBe("Pavimenti e rivestimenti");
    expect(fasePrevisioneDi("Pitture interne")).toBe("Tinteggiature");
    expect(fasePrevisioneDi("Opere murarie")).toBe("Murature");
    expect(fasePrevisioneDi("Impianto elettrico")).toBeNull();
  });
});

describe("istantaneaPrevisione", () => {
  it("salva totale, giorni, extra e regole con la commessa", () => {
    const riga = istantaneaPrevisione(previsione, ["imprevisti"], { companyId: "c", orderId: "o", planimetriaId: "p", versione: 4, varianteId: "v1", varianteNome: "Bagno nuovo" });
    expect(riga).toMatchObject({ company_id: "c", order_id: "o", totale: 8000, giorni_lavoro: 11, giorni_calendario: 30, extra_accesi: ["imprevisti"], versione_regole: VERSIONE_REGOLE_PREVISIONE });
    expect(previsioneSalvata(riga.previsione)).toEqual(previsione);
    expect(previsioneSalvata({ totale: 1 })).toBeNull();
  });
});

describe("confrontoPrevistoReale", () => {
  const fasiCommessa = [
    { id: "f1", name: "Demolizioni" },
    { id: "f2", name: "Pavimenti" },
    { id: "f3", name: "Rivestimenti bagno" },
    { id: "f4", name: "Impianto idraulico" },
  ];
  const rapportini = [
    { data_lavoro: "2026-10-01", fasi_lavorate: [{ phase_id: "f1", ore: 8 }] },
    { data_lavoro: "2026-10-02", fasi_lavorate: [{ phase_id: "f1", ore: 8 }] },
    { data_lavoro: "2026-10-02", fasi_lavorate: [{ phase_id: "f2", ore: 4 }] },
    { data_lavoro: "2026-10-10", fasi_lavorate: [{ phase_id: "f3", ore: 8 }, { phase_id: "f2", ore: 2 }] },
    { data_lavoro: "2026-10-12", fasi_lavorate: null },
  ];

  it("mette il reale accanto al previsto per fase, sommando le fasi abbinate", () => {
    const c = confrontoPrevistoReale({
      previsione, fasiCommessa, rapportini,
      costoPerFase: new Map([["f1", 1500], ["f2", 2500], ["f3", 1800], ["f4", 900]]),
      totaleReale: { consuntivo: 8800, manodopera: 4000 },
      inizioLavori: "2026-10-01", fineLavori: "2026-10-20", oggi: "2026-11-24",
    });
    expect(c.righe[0]).toMatchObject({ fase: "Demolizioni", previsto: 2000, reale: 1500, giorniReali: 2, fasiCommessa: ["Demolizioni"] });
    expect(c.righe[1]).toMatchObject({ reale: 4300, giorniReali: 2, fasiCommessa: ["Pavimenti", "Rivestimenti bagno"] });
    expect(c.fasiNonAbbinate).toEqual([{ nome: "Impianto idraulico", reale: 900 }]);
    expect(c.totale).toEqual({ previsto: 8000, reale: 8800, scostamentoPct: 10 });
    expect(c.giorniLavoro).toEqual({ previsto: 11, reale: 4 });
    expect(c.giorniCalendario).toEqual({ previsto: 30, reale: 20, fonte: "date" });
    expect(c.chiusa).toBe(true);
  });

  it("dove il dato manca dice che manca, senza inventarlo", () => {
    const c = confrontoPrevistoReale({
      previsione, fasiCommessa: [{ id: "f4", name: "Impianto idraulico" }], rapportini: null,
      costoPerFase: null, totaleReale: null, inizioLavori: null, fineLavori: null,
    });
    expect(c.righe.every((r) => r.reale === null && r.giorniReali === null)).toBe(true);
    expect(c.totale.reale).toBeNull();
    expect(c.totale.scostamentoPct).toBeNull();
    expect(c.giorniLavoro.reale).toBeNull();
    expect(c.giorniCalendario).toEqual({ previsto: 30, reale: null, fonte: null });
    expect(c.chiusa).toBe(false);
  });

  it("senza date della commessa conta la durata dai rapportini", () => {
    const c = confrontoPrevistoReale({ previsione, fasiCommessa, rapportini, costoPerFase: null, totaleReale: null, inizioLavori: "2026-10-01", fineLavori: null });
    expect(c.giorniCalendario).toEqual({ previsto: 30, reale: 12, fonte: "rapportini" });
  });
});
