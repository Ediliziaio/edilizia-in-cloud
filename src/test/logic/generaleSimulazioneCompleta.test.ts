import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  calcolaPianoEconomico,
  capitaleMassimo,
  numeriPerInvestitori,
  type PianoCalcolato,
  type Scenario,
  type VocePiano,
} from "@/lib/orders/generali/pianoConti";
import {
  calcolaInvestitori,
  numeriDalPiano,
} from "@/lib/orders/generali/investitoriConti";
import {
  controllaBudget,
  DA_STIMARE,
} from "@/lib/orders/generali/budgetCompletezza";
import {
  cassaOperazione,
  type PagamentoEffettivo,
} from "@/lib/orders/generali/cassaOperazione";
import {
  nelPeriodoCassa,
  serieCassaEffettiva,
} from "@/lib/orders/generali/cassaLettura";
import {
  fonteSimulazione,
  inputSimulazione,
  movimentoSimulazione,
} from "@/test/fixtures/generaleSimulazione";

const input = inputSimulazione();
const prima = JSON.stringify(input);
const base = calcolaPianoEconomico(input);
const risultati: Record<string, string | number | null>[] = [];
const somma = (n: number[]) =>
  Math.round(n.reduce((a, b) => a + b, 0) * 100) / 100;

/** Selezione esplicita dello scenario locale: non modifica il piano approvato. */
function proiezione(p: PianoCalcolato): PianoCalcolato {
  if (!p.confrontoScenario || !p.cassa.scenario || !p.indicatori.scenario)
    return p;
  const picco = capitaleMassimo(p.cassa.scenario);
  return {
    ...p,
    confronto: p.confrontoScenario,
    cassa: { ...p.cassa, stima: p.cassa.scenario },
    indicatori: { ...p.indicatori, stima: p.indicatori.scenario },
    capitale: {
      ...p.capitale,
      massimoStima: picco.importo,
      meseMassimoStima: picco.mese,
    },
  };
}
const numeri = (p: PianoCalcolato) =>
  numeriDalPiano(numeriPerInvestitori(p), p.confronto.costi);
function finiti(value: unknown): void {
  if (typeof value === "number") expect(Number.isFinite(value)).toBe(true);
  else if (value && typeof value === "object")
    Object.values(value).forEach(finiti);
}

describe("simulazione locale di sviluppo immobiliare da 3,2 milioni", () => {
  it("parte da budget 2,6 milioni, reale 1,1 milioni e margine 600.000", () => {
    expect(base.confronto.totali.costi).toMatchObject({
      previsto: 2_600_000,
      reale: 1_100_000,
      aFinire: 1_500_000,
      stima: 2_600_000,
    });
    expect(base.confronto.totali.ricavi).toMatchObject({
      previsto: 3_200_000,
      reale: 800_000,
      aFinire: 2_400_000,
    });
    expect(base.confronto.totali.margine.stima).toBe(600_000);
    expect(controllaBudget(input.voci).completo).toBe(true);
  });

  const casi: Scenario[] = [0, 5, 10, 15, 20, 30, 50, 90].flatMap((prezzoPct) =>
    [0, 5, 10, 20, 30, 50, 100, 200].flatMap((costiPct) =>
      [0, 1, 3, 6, 12, 24, 60].map((ritardoMesi) => ({
        prezzoPct,
        costiPct,
        ritardoMesi,
      })),
    ),
  );

  it.each(casi)(
    "prezzi -$prezzoPct%, costi +$costiPct%, ritardo $ritardoMesi mesi",
    (scenario) => {
      const p = calcolaPianoEconomico({ ...input, scenario });
      const s = proiezione(p);
      const t = s.confronto.totali;
      const ricavi = 800_000 + 2_400_000 * (1 - scenario.prezzoPct / 100);
      const costi = 1_100_000 + 1_500_000 * (1 + scenario.costiPct / 100);
      expect(t.ricavi.stima).toBeCloseTo(ricavi, 2);
      expect(t.costi.stima).toBeCloseTo(costi, 2);
      expect(t.margine.stima).toBeCloseTo(ricavi - costi, 2);
      expect(p.confronto).toEqual(base.confronto);
      expect(t.costi.reale).toBe(1_100_000);
      expect(t.ricavi.reale).toBe(800_000);
      expect(somma(s.cassa.stima.map((m) => m.entrate))).toBeCloseTo(ricavi, 2);
      expect(somma(s.cassa.stima.map((m) => m.uscite))).toBeCloseTo(costi, 2);
      expect(s.cassa.stima.at(-1)?.cumulato).toBeCloseTo(ricavi - costi, 2);
      const reali = (x: PianoCalcolato) =>
        x.cassa.stima.flatMap((m) =>
          m.partite
            .filter((r) => r.origine === "reale")
            .map((r) => ({ mese: m.mese, ...r })),
        );
      expect(reali(s)).toEqual(reali(base));
      const inv = calcolaInvestitori({
        oggi: input.oggi,
        fonti: [fonteSimulazione()],
        movimenti: [movimentoSimulazione()],
        numeri: numeri(s),
      });
      expect(inv.utile.stima).toBeCloseTo(ricavi - costi, 2);
      expect(inv.utile.interessiTolti.stima).toBe(0);
      expect(inv.scoperto).toBeGreaterThanOrEqual(0);
      finiti(s);
      finiti(inv);
      expect(JSON.stringify(input)).toBe(prima);
      risultati.push({
        prezziMenoPct: scenario.prezzoPct,
        costiPiuPct: scenario.costiPct,
        ritardoMesi: scenario.ritardoMesi,
        ricavi: t.ricavi.stima,
        costi: t.costi.stima,
        margine: t.margine.stima,
        capitaleMassimo: s.capitale.massimoStima,
        mesePicco: s.capitale.meseMassimoStima,
        scopertoFonti: inv.scoperto,
      });
    },
  );

  it("non duplica il costo generale quando si attiva l'analisi delle sei unità", () => {
    const conUnita = calcolaPianoEconomico({
      ...input,
      figlie: Array.from({ length: 6 }, (_, i) => ({
        id: `u${i}`,
        nome: `A${i + 1}`,
        importo: 3_200_000 / 6,
      })),
    });
    expect(conUnita.confronto.totali).toEqual(base.confronto.totali);
    expect(
      somma(conUnita.costiComuni.ripartizione.quote.map((q) => q.importo)),
    ).toBe(1_100_000);
  });

  it.each([900_000, 1_100_000, 3_200_000])(
    "non incassa di nuovo gli anticipi già ricevuti: incassato %s euro",
    (importo) => {
      const p = calcolaPianoEconomico({
        ...input,
        incassi: [{ ...input.incassi[0], importo }],
      });
      expect(p.confronto.totali).toEqual(base.confronto.totali);
      expect(somma(p.cassa.stima.map((m) => m.entrate))).toBe(3_200_000);
      expect(
        somma(
          p.cassa.stima.flatMap((m) =>
            m.partite
              .filter((r) => r.origine === "reale" && r.tipo === "ricavo")
              .map((r) => r.importo),
          ),
        ),
      ).toBe(importo);
      expect(p.cassa.stima.at(-1)?.cumulato).toBe(600_000);
    },
  );

  it("sottrae gli anticipi anche nello scenario combinato senza spostare l'incasso registrato", () => {
    const scenario = { prezzoPct: 10, costiPct: 20, ritardoMesi: 3 };
    const p = proiezione(
      calcolaPianoEconomico({
        ...input,
        incassi: [{ ...input.incassi[0], importo: 1_090_000 }],
        scenario,
      }),
    );
    expect(somma(p.cassa.stima.map((m) => m.entrate))).toBe(2_960_000);
    expect(p.cassa.stima.at(-1)?.cumulato).toBe(60_000);
    expect(p.cassa.stima.find((m) => m.mese === "2026-09")?.entrate).toBe(
      1_090_000,
    );
  });

  it("compensa gli anticipi dai primi mesi futuri indipendentemente dall'ordine delle voci", () => {
    const voci = [
      { ...input.voci[0], importo: 1_600_000 },
      {
        ...input.voci[0],
        id: "seconda-vendita",
        importo: 1_600_000,
        mese: "2027-01",
      },
      ...input.voci.slice(1),
    ];
    const dati = {
      ...input,
      voci,
      incassi: [{ ...input.incassi[0], importo: 1_090_000 }],
    };
    const p = calcolaPianoEconomico(dati);
    const inverso = calcolaPianoEconomico({
      ...dati,
      voci: [...voci].reverse(),
    });
    expect(somma(p.cassa.stima.map((m) => m.entrate))).toBe(3_200_000);
    expect(p.cassa.stima.map((m) => m.entrate)).toEqual(
      inverso.cassa.stima.map((m) => m.entrate),
    );
  });

  it("separa zero confermato, importo mancante e calendario incompleto", () => {
    const zero: VocePiano = {
      ...input.voci[1],
      id: "zero",
      importo: 0,
      mese: null,
    };
    expect(controllaBudget([...input.voci, zero]).completo).toBe(true);
    const incompleto = calcolaPianoEconomico({
      ...input,
      voci: [...input.voci, { ...zero, nota: DA_STIMARE }],
    });
    expect(incompleto.budgetCompleto).toBe(false);
    expect(incompleto.calendarioCompleto).toBe(false);
    expect(
      controllaBudget([...input.voci, { ...zero, nota: DA_STIMARE }]).completo,
    ).toBe(false);
    const senzaData = calcolaPianoEconomico({
      ...input,
      voci: input.voci.map((v) =>
        v.id === "costruzione" ? { ...v, mese: null } : v,
      ),
    });
    expect(senzaData.calendarioCompleto).toBe(false);
    expect(
      controllaBudget(
        input.voci.map((v) =>
          v.id === "costruzione" ? { ...v, mese: null } : v,
        ),
      ).completo,
    ).toBe(false);
    expect(controllaBudget([]).completo).toBe(false);
  });

  it("segnala capitale insufficiente e capitale disponibile troppo tardi", () => {
    const conto = (impegno: number, dataInizio: string) =>
      calcolaInvestitori({
        oggi: input.oggi,
        fonti: [fonteSimulazione({ impegno, dataInizio })],
        movimenti: [],
        numeri: numeri(base),
      });
    expect(conto(100_000, "2026-01-01").scoperto).toBeGreaterThan(0);
    expect(conto(5_000_000, "2026-01-01").scoperto).toBe(0);
    expect(conto(5_000_000, "2028-12-01").scoperto).toBeGreaterThan(0);
  });

  it("gli interessi presenti nel piano non vengono sottratti di nuovo agli investitori", () => {
    const inv = calcolaInvestitori({
      oggi: input.oggi,
      fonti: [
        fonteSimulazione({ tipo: "banca", tassoPct: 5, impegno: 1_000_000 }),
      ],
      movimenti: [movimentoSimulazione()],
      numeri: numeri(base),
    });
    expect(inv.costoDebito.totale).toBeGreaterThan(0);
    expect(inv.utile.stima).toBe(600_000);
    expect(inv.utile.interessiTolti.stima).toBe(0);
  });

  it("mantiene 183 euro di pagamenti e separa capitale, storni, doppioni e accollo", () => {
    const pagamento = (
      id: string,
      p: Partial<PagamentoEffettivo> = {},
    ): PagamentoEffettivo => ({
      id,
      entry_date: "2026-11-11",
      amount: 61,
      direction: "uscita",
      reversal_of: null,
      category: "fornitore",
      notes: null,
      ...p,
    });
    const a = pagamento("ordine-fattura-parziale"),
      b = pagamento("ordine-fattura-saldo"),
      c = pagamento("ddt-diretto-fattura");
    const cassa = cassaOperazione({
      oggi: input.oggi,
      registrati: [
        a,
        a,
        b,
        c,
        pagamento("annullato", { amount: 999 }),
        pagamento("storno", { amount: 999, reversal_of: "annullato" }),
        pagamento("futuro", { entry_date: "2027-01-01", amount: 1000 }),
      ],
      previsti: [],
      movimenti: [
        movimentoSimulazione({ importo: 122 }),
        movimentoSimulazione({ id: "rimborso", tipo: "rimborso", importo: 22 }),
        movimentoSimulazione({ id: "accollo", tipo: "accollo", importo: 500 }),
      ],
    });
    const serie = serieCassaEffettiva(cassa.righe, "registrati");
    expect(somma(serie.map((m) => m.pagamenti))).toBe(183);
    expect(serie.at(-1)?.cumulato).toBe(-183);
    expect(somma(cassa.righe.map((m) => m.versato - m.rimborsato))).toBe(10000);
    expect(
      serie
        .filter((m) => nelPeriodoCassa(m.mese, "futuro", "2026-11-01"))
        .at(-1)?.cumulato,
    ).toBe(-183);
  });
});

afterAll(() => {
  // Opt-in: i normali test non producono file nel progetto.
  if (!process.env.EIC_SIMULATION_OUTPUT) return;
  const dir = resolve(process.env.EIC_SIMULATION_OUTPUT);
  mkdirSync(dir, { recursive: true });
  const righe = risultati.sort(
    (a, b) =>
      Number(a.prezziMenoPct) - Number(b.prezziMenoPct) ||
      Number(a.costiPiuPct) - Number(b.costiPiuPct) ||
      Number(a.ritardoMesi) - Number(b.ritardoMesi),
  );
  writeFileSync(
    resolve(dir, "scenari.json"),
    JSON.stringify(
      {
        caso: "SINTETICO LOCALE — nessun dato aziendale modificato",
        input,
        risultati: righe,
      },
      null,
      2,
    ),
  );
  const chiavi = Object.keys(righe[0] ?? {});
  writeFileSync(
    resolve(dir, "scenari.csv"),
    [
      chiavi.join(";"),
      ...righe.map((r) => chiavi.map((k) => r[k] ?? "").join(";")),
    ].join("\n") + "\n",
  );
});
