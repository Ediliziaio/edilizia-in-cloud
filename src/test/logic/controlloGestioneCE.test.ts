import { describe, expect, it } from "vitest";
import { etichettaVoce, spiegazioneImposte, vociLeggibili } from "@/lib/controlloGestione/contoEconomico";
import { runRules, type Snapshot } from "@/lib/controlloGestione/interpreter";
import type { VoceCE } from "@/hooks/controlloGestione/useCEriclassificato";

// CE Demo 2 2026 (cg_get_ce_safe al 22/10/2026), con le etichette del database.
const VOCI: VoceCE[] = [
  { codice: "01", label: "Ricavi delle vendite", tipo: "voce", valore: 4655616.76 },
  { codice: "A", label: "PRODOTTO INTERNO LORDO", tipo: "subtot", valore: 4655616.76 },
  { codice: "06", label: "Costo del personale", tipo: "voce", valore: 948458.17 },
  { codice: "E", label: "MOL / EBITDA", tipo: "subtot_grasso", valore: 530795.43, pct_pil: 11.4 },
  { codice: "F", label: "EBIT", tipo: "subtot_grasso", valore: 460255.63, pct_pil: 9.89 },
  { codice: "I", label: "UTILE ANTE IMPOSTE", tipo: "subtot", valore: 450505.63 },
  { codice: "15", label: "Imposte (stimate)", tipo: "voce", valore: 163061.19 },
  { codice: "L", label: "UTILE BILANCIO", tipo: "subtot_grasso", valore: 287444.44, pct_pil: 6.17 },
];

describe("Conto economico leggibile", () => {
  it("niente «Prodotto interno lordo»: è il valore della produzione", () => {
    expect(etichettaVoce("A", "PRODOTTO INTERNO LORDO")).toBe("Valore della produzione");
    expect(etichettaVoce("XX", "Altro")).toBe("Altro");
  });

  it("la percentuale c'è su ogni riga, non solo sui margini", () => {
    const righe = vociLeggibili(VOCI);
    const personale = righe.find((r) => r.codice === "06")!;
    expect(personale.incidenza).toBeCloseTo((948458.17 / 4655616.76) * 100, 6);
    expect(righe.find((r) => r.codice === "E")!.incidenza).toBeCloseTo(11.4, 1);
  });

  it("spiega le imposte con gli stessi conti del database (163.061,19 €)", () => {
    const testo = spiegazioneImposte(VOCI, {
      ires_pct: 24, irap_pct: 3.9, addizionale_ires_pct: 0, base_irap_include_personale: true,
    })!;
    // IRES 24% × 450.505,63 = 108.121,35; IRAP 3,9% × (460.255,63 + 948.458,17) = 54.939,84
    expect(testo).toContain("108.121,35");
    expect(testo).toContain("54.939,84");
    expect(testo).toContain("36,2%");
    expect(108121.35 + 54939.84).toBeCloseTo(163061.19, 2);
  });
});

describe("Segnalazioni del CE", () => {
  const base = {
    ce_anno_corr: { meta: { anno: 2026 } as never, voci: VOCI },
    ce_anno_prec: null as never,
    sp: { attivo: { attivo_circolante: 1, totale: 1 }, passivo: { pas_corrente: 0, mezzi_propri: 1, totale: 1 } } as never,
    rating: {} as never,
    rating_storico: [] as never[],
    bep: { gia_raggiunto: true, bep_giorno_anno: 300 } as never,
    scadenzario: [] as never[],
    saldo_banche: 0,
    cashflow_30gg: 0,
  } satisfies Omit<Snapshot, "cantieri_attivi">;

  it("i cantieri sotto il 5% dicono anche quanti sono davvero in perdita", () => {
    const insights = runRules({
      ...base,
      cantieri_attivi: [
        { id: "1", nome: "A", margine_pct: -3, margine_eur: -1000 },
        { id: "2", nome: "B", margine_pct: 2, margine_eur: 500 },
        { id: "3", nome: "C", margine_pct: 20, margine_eur: 9000 },
      ],
    });
    const c = insights.find((i) => i.id === "cantieri-in-perdita")!;
    expect(c.title).toBe("2 cantieri aperti con margine sotto il 5%, di cui 1 in perdita");
    expect(c.body).toContain("-3,0%");
  });

  it("i crediti scaduti dicono da quando", () => {
    const insights = runRules({
      ...base,
      cantieri_attivi: [],
      scadenzario: [{ id: "x", tipo: "cliente", cliente_nome: "Fattura 23/2024", importo: 82588.24, giorni_scadenza: 650, scadenza: "2025-01-08" }],
    });
    const c = insights.find((i) => i.id === "crediti-insoluti-60gg")!;
    expect(c.body).toContain("scaduta il 8 gen 2025");
    expect(c.body).toContain("anche di anni precedenti");
  });
});
