import { describe, expect, it } from "vitest";
import {
  erroriViaggio,
  numeroViaggio,
  riepilogoViaggio,
  totaliCommessa,
  type Viaggio,
  type ViaggioPayload,
} from "@/lib/mezzi/viaggi";
const payload: ViaggioPayload = {
  partenza: "2020-10-01T07:00:00Z",
  arrivo: "2020-10-01T09:00:00Z",
  contatore_inizio: 100,
  contatore_fine: 180,
  note: "",
  tratte: [20, 8, 8, 14, 30].map((km, i) => ({
    id: `t${i}`,
    da: `P${i}`,
    a: `P${i + 1}`,
    km,
    minuti: null,
    fonte: "dichiarati",
    destinazione: "commessa",
    order_id: i < 3 ? "A" : "B",
  })),
};
const trip: Viaggio = {
  ...payload,
  id: "v1",
  company_id: "c",
  mezzo_id: "m",
  mezzo_nome: "Furgone",
  stato: "verificato",
  versione: 1,
  conducente: "Mario",
  updated_at: "2020-10-01",
  tariffa_km: 0.5,
};
describe("Registro viaggi, multi tratta e attribuzioni", () => {
  it("riconcilia 80 km senza raddoppiare le tratte e ripartisce A=36, B=44", () => {
    expect(erroriViaggio(payload)).toEqual([]);
    expect(riepilogoViaggio(payload)).toMatchObject({
      km: 80,
      kmDichiarati: 80,
      kmStimati: null,
      delta: 80,
      scarto: 0,
      daVerificare: false,
    });
    expect(totaliCommessa([trip], "A")).toMatchObject({
      verificati: 36,
      costoStimato: 18,
    });
    expect(totaliCommessa([trip], "B")).toMatchObject({
      verificati: 44,
      costoStimato: 22,
    });
  });
  it("non trasforma km assenti in zero e lascia lo scarto sconosciuto con tratte incomplete", () => {
    const v = {
      ...payload,
      tratte: payload.tratte.map((t) => ({ ...t, km: null })),
    };
    expect(riepilogoViaggio(v)).toMatchObject({
      km: null,
      kmDichiarati: null,
      kmStimati: null,
      mancanti: 5,
      delta: 80,
      scarto: null,
      daVerificare: true,
    });
  });
  it("separa dichiarati e stime e non distribuisce lo scarto", () => {
    const v = {
      ...payload,
      contatore_fine: 190,
      tratte: payload.tratte.map((t, i) => ({
        ...t,
        fonte: i === 0 ? ("stimati" as const) : t.fonte,
      })),
    };
    expect(riepilogoViaggio(v)).toMatchObject({
      kmDichiarati: 60,
      kmStimati: 20,
      scarto: 10,
      daVerificare: true,
    });
  });
  it("esclude annullati e bozze dai totali, conserva la tariffa mancante come sconosciuta", () => {
    expect(
      totaliCommessa(
        [
          { ...trip, stato: "annullato" },
          { ...trip, stato: "bozza" },
        ],
        "A",
      ),
    ).toMatchObject({ verificati: 0, costoStimato: null });
    expect(totaliCommessa([{ ...trip, tariffa_km: null }], "A")).toMatchObject({
      verificati: 36,
      costoStimato: null,
      kmSenzaTariffa: 36,
    });
  });
  it.each(["-1", "1.000", "1,000", "abc", "Infinity", "1e3"])(
    "non interpreta numeri ambigui: %s",
    (value) => expect(numeroViaggio(value)).toBeNaN(),
  );
  it("accetta decimali italiani e distingue zero da assente", () => {
    expect(numeroViaggio("12,5")).toBe(12.5);
    expect(numeroViaggio("0")).toBe(0);
    expect(numeroViaggio("")).toBeNull();
  });
  it("rifiuta contatori incompleti, regressivi e km invalidi", () => {
    expect(
      erroriViaggio({ ...payload, contatore_fine: null }).length,
    ).toBeGreaterThan(0);
    expect(
      erroriViaggio({ ...payload, contatore_fine: 90 }).length,
    ).toBeGreaterThan(0);
    expect(
      erroriViaggio({ ...payload, tratte: [{ ...payload.tratte[0], km: NaN }] })
        .length,
    ).toBeGreaterThan(0);
    expect(
      erroriViaggio({
        ...payload,
        tratte: [payload.tratte[0], payload.tratte[0]],
      }).length,
    ).toBeGreaterThan(0);
  });
  it("consente un viaggio notturno ma non uno con date invertite", () => {
    expect(
      erroriViaggio({
        ...payload,
        partenza: "2020-10-01T22:00:00Z",
        arrivo: "2020-10-02T01:00:00Z",
      }),
    ).toEqual([]);
    expect(
      erroriViaggio({ ...payload, arrivo: "2020-09-30T22:00:00Z" }).length,
    ).toBeGreaterThan(0);
  });
  it("consente l’invio di tratte da attribuire ma non le considera verificabili", () => {
    const v = {
      ...payload,
      tratte: [
        {
          ...payload.tratte[0],
          destinazione: "da_attribuire" as const,
          order_id: null,
        },
      ],
    };
    expect(erroriViaggio(v)).toEqual([]);
    expect(riepilogoViaggio(v).daVerificare).toBe(true);
  });
});
