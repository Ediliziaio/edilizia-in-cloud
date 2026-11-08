/**
 * Lo scaduto da incassare è uno solo (08/11/2026): quello del Previsionale.
 * Prima tre pagine dicevano tre cifre (Demo Azienda 2: 990.543 € nel Cruscotto,
 * 1.027.032 € nello Scadenzario, 1.503.771 € nel Previsionale).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { ForecastMovement } from "@/lib/finance/forecastLedger";
import { incassiScaduti, scadutoPerEtaDaIncassi } from "@/lib/finance/incassiScaduti";

const leggi = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const m = (over: Partial<ForecastMovement>): ForecastMovement => ({
  id: Math.random().toString(36), description: "", counterparty: "", category: "clienti",
  direction: "in", cents: 10_000, date: "2026-11-01", source: "Rate", href: "", estimated: false, ...over,
});

describe("incassi scaduti, la regola del Previsionale", () => {
  const oggi = "2026-11-08";

  it("conta gli incassi con la data passata, non le uscite, non i possibili doppioni, non quelli senza data", () => {
    const voci = [
      m({ id: "a" }),
      m({ id: "oggi", date: oggi }),
      m({ id: "uscita", direction: "out" }),
      m({ id: "doppione", possibleDuplicate: true } as Partial<ForecastMovement>),
      m({ id: "senza-data", date: null }),
      m({ id: "futuro", date: "2026-12-01" }),
    ];
    expect(incassiScaduti(voci, oggi).map((v) => v.id)).toEqual(["a"]);
  });

  it("divide per età in euro, con il ritardo medio pesato sull'importo", () => {
    const r = scadutoPerEtaDaIncassi([
      m({ cents: 10_000, date: "2026-10-29" }),   // 10 giorni
      m({ cents: 30_000, date: "2026-07-31" }),   // 100 giorni
    ], oggi);
    expect(r.totale).toBe(400);
    expect(r.rate).toBe(2);
    expect(r.fasce[0]).toEqual({ etichetta: "fino a 30 giorni", importo: 100, rate: 1 });
    expect(r.fasce[3]).toEqual({ etichetta: "oltre 90 giorni", importo: 300, rate: 1 });
    expect(r.ritardoMedio).toBe(Math.round((10 * 100 + 100 * 300) / 400));
  });
});

describe("le pagine leggono la stessa funzione", () => {
  it("Previsionale, Cruscotto e Scadenzario usano incassiScaduti", () => {
    expect(leggi("src/components/forecast/ForecastWorkspace.tsx")).toContain("incassiScaduti(movements, data.today)");
    expect(leggi("src/pages/azienda/CruscottoAziendale.tsx")).toContain("scadutoPerEtaDaIncassi(incassiScaduti(d.movements, d.today), d.today)");
    expect(leggi("src/components/scadenzario/ScadenzarioKPIs.tsx")).toContain("incassiScaduti(previsionale.data.movements, previsionale.data.today)");
  });

  it("nel Cruscotto lo scaduto non è più quello delle sole rate", () => {
    const pagina = leggi("src/pages/azienda/CruscottoAziendale.tsx");
    expect(pagina).not.toContain("<ScadutoPerEtaWidget scaduto={scaduto}");
    expect(pagina).toContain("scaduto={{");
    const inCima = leggi("src/pages/azienda/ComeStiamoAndando.tsx");
    expect(inCima).toContain("valore={formatCurrency(scadutoEuro)}");
  });
});
