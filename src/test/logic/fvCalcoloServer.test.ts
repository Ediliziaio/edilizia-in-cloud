/**
 * Il calcolo finanziario del fotovoltaico, provato sul gestore VERO della edge function
 * (`fv-calcolo-finanziario`) con un database finto: è lui che scrive prezzo, IVA, sconto,
 * detrazione, risparmio e payback che finiscono nel PDF, nell'elenco e nella commessa.
 *
 * I valori attesi non vengono dal codice: sono fatti a mano nei commenti (un cliente da
 * 6 kWp al Nord, consumi 4.500 kWh, 0,32 €/kWh, listino 16 pannelli + inverter) o con un
 * piccolo calcolo ingenuo scritto qui sotto.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stimaProduzioneFv } from "@/lib/fotovoltaico/anteprima";
import { calcolaPrezzoFv } from "@/lib/fotovoltaico/prezzoPreventivo";
import { evaluateDiscountRules } from "@/lib/serramenti/discountRules";
import type { DiscountRule } from "@/hooks/useDiscountRules";

vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({ createClient: () => ({}) }));
vi.mock("../../../supabase/functions/_shared/auth.ts", () => ({
  requireAuth: async () => ({ userId: "utente-1", supabaseAdmin: banca.db }),
  requireCompanyAccess: async () => ({ companyId: "az-1" }),
}));

type Riga = Record<string, unknown>;

/** Database in memoria: abbastanza SQL per le chiamate del gestore, e il registro di tutto ciò che scrive. */
function bancaFinta() {
  const tabelle: Record<string, Riga[]> = {};
  const scritture: Array<{ tabella: string; tipo: "insert" | "update"; dati: Riga }> = [];
  /** `tabella:insert` o `tabella:update` → il messaggio con cui quella scrittura fallisce. */
  const guasti: Record<string, string> = {};
  const db = {
    from(nome: string) {
      const filtri: Array<[string, unknown]> = [];
      let tipo: "select" | "insert" | "update" = "select";
      let dati: Riga = {};
      const corrispondenti = () => (tabelle[nome] ?? []).filter((r) => filtri.every(([k, v]) => r[k] === v));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q: any = {};
      q.select = () => q;
      q.eq = (k: string, v: unknown) => { filtri.push([k, v]); return q; };
      q.insert = (d: Riga) => { tipo = "insert"; dati = d; return q; };
      q.update = (d: Riga) => { tipo = "update"; dati = d; return q; };
      const esegui = (): { data: Riga[] | null; error: { message: string; code: string } | null } => {
        // l'errore di Supabase è un oggetto semplice, non un Error
        if (tipo !== "select" && guasti[`${nome}:${tipo}`]) return { data: null, error: { message: guasti[`${nome}:${tipo}`], code: "XX000" } };
        if (tipo === "insert") {
          const riga = { id: `${nome}-${(tabelle[nome] ?? []).length + 1}`, ...dati };
          (tabelle[nome] ??= []).push(riga);
          scritture.push({ tabella: nome, tipo, dati });
          return { data: [riga], error: null };
        }
        if (tipo === "update") {
          for (const r of corrispondenti()) Object.assign(r, dati);
          scritture.push({ tabella: nome, tipo, dati });
          return { data: null, error: null };
        }
        return { data: corrispondenti(), error: null };
      };
      const prima = (): { data: Riga | null; error: { message: string; code: string } | null } => {
        const r = esegui();
        return { data: r.data?.[0] ?? null, error: r.error };
      };
      q.maybeSingle = async () => prima();
      q.single = async () => prima();
      q.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(esegui()).then(ok, ko);
      return q;
    },
  };
  return { tabelle, scritture, guasti, db };
}

let banca = bancaFinta();
let gestore: (req: Request) => Promise<Response>;

const PERCORSO = "../../../supabase/functions/fv-calcolo-finanziario/index.ts";

async function carica() {
  vi.resetModules();
  vi.stubGlobal("Deno", {
    env: { get: (): string | undefined => undefined },
    serve: (h: (req: Request) => Promise<Response>) => { gestore = h; },
  });
  await import(/* @vite-ignore */ PERCORSO);
}

const CATALOGO = [
  { codice: "DETR_50_PRIMA", nome: "Detrazione 50%", tipo: "detrazione_irpef", aliquota: 0.5, plafond_max_eur: 96000, attivo: true },
  { codice: "DETR_36_SECONDA", nome: "Detrazione 36%", tipo: "detrazione_irpef", aliquota: 0.36, plafond_max_eur: 96000, attivo: true },
  { codice: "IVA_10", nome: "IVA agevolata", tipo: "sconto_iva", aliquota: 0.1, plafond_max_eur: null, attivo: true },
  { codice: "RID", nome: "Ritiro dedicato", tipo: "tariffa_incentivante", aliquota: null, plafond_max_eur: null, attivo: true },
];
const PROFILI = [
  { codice: "misto", autoconsumo_no_accumulo: 0.35, autoconsumo_accumulo_5kwh: 0.55, autoconsumo_accumulo_10kwh: 0.7, autoconsumo_accumulo_15kwh: 0.8 },
];

/** Un progetto del Nord: 6 kWp, 1.500 ore di sole lorde, 4.500 kWh di consumo, 0,32 €/kWh, prima casa. */
const progetto = (extra: Riga = {}): Riga => ({
  id: "p1", company_id: "az-1", stato: "bozza", archetipo: "privato_prima", prima_casa: true,
  potenza_kwp: 6, ore_sole_annue: 1500, consumo_annuo_kwh: 4500, costo_kwh_attuale: 0.32,
  profilo_consumo: "misto", con_accumulo: false, capacita_accumulo_kwh: 0, con_ottimizzatori: false,
  perdita_ombreggiamento_pct: 0, iva_aliquota: 0.1, provincia: "VI", prezzo_vendita_manuale: null,
  sconto_tipo: null, sconto_valore: null, prezzo_vendita_iva_inclusa: null, isee: null, numero_figli: 0,
  popolazione_comune: 100000, scenario_finanziamento: "cash", ...extra,
});

/** 16 pannelli a 180 € (costo 120) + un inverter a 1.500 € (costo 1.000): 4.380 € di imponibile, 2.920 € di costi. */
const righeListino = (): Record<string, Riga[]> => ({
  fv_componenti_progetto: [
    { progetto_id: "p1", quantita: 16, prezzo_unitario_vendita: 180, prezzo_unitario_netto: 120 },
    { progetto_id: "p1", quantita: 1, prezzo_unitario_vendita: 1500, prezzo_unitario_netto: 1000 },
  ],
});

function prepara(prog: Riga, extra: Record<string, Riga[]> = {}) {
  banca = bancaFinta();
  Object.assign(banca.tabelle, {
    fv_progetti: [prog],
    fv_parametri_calcolo: [],
    fv_profili_autoconsumo: PROFILI.map((x) => ({ ...x })),
    fv_incentivi_catalogo: CATALOGO.map((x) => ({ ...x })),
    fv_componenti_progetto: [], fv_manodopera_progetto: [], fv_servizi_progetto: [],
    discount_rules: [], fv_calcolo_finanziario: [],
    ...righeListino(),
    ...extra,
  });
}

async function chiama(body: Riga = {}) {
  return gestore(new Request("https://x.test/fv", {
    method: "POST", headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
    body: JSON.stringify({ progetto_id: "p1", ...body }),
  }));
}
async function calcola(body: Riga = {}) {
  const res = await chiama(body);
  expect(res.status).toBe(200);
  return (await res.json()) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const regola = (extra: Partial<DiscountRule>): Riga => ({
  scope: "globale", tipo_lavoro: null, importo_min: null, importo_max: null, sconto_max_pct: 10,
  margine_min_pct: 0, is_active: true, company_id: "az-1", ...extra,
});

beforeEach(async () => { await carica(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("fv-calcolo-finanziario — prezzo, sconto e IVA", () => {
  it("senza sconto: 4.380 € di imponibile, IVA 10% = 438, totale 4.818; margine 1.460 (33,3%)", async () => {
    prepara(progetto());
    const r = await calcola();
    expect(r.costi.prezzo_pieno_netto).toBe(4380);
    expect(r.costi.prezzo_vendita_netto).toBe(4380);
    expect(r.costi.prezzo_vendita_iva_inclusa).toBe(4818);
    expect(r.costi.costo_totale_netto).toBe(2920);
    expect(r.costi.margine_eur).toBe(1460);
    expect(r.costi.margine_pct).toBeCloseTo(1460 / 4380, 4);
    // lo stesso numero finisce sul progetto, da dove lo leggono PDF, elenco e commessa
    expect(banca.tabelle.fv_progetti[0].prezzo_vendita_iva_inclusa).toBeCloseTo(4818, 6);
  });

  it("sconto 5% (nessuna regola: di serie vale il 10%): −219 → imponibile 4.161, IVA 416,10, totale 4.577,10", async () => {
    prepara(progetto({ sconto_tipo: "pct", sconto_valore: 5 }));
    const r = await calcola();
    expect(r.costi.sconto_eur_applicato).toBe(219);
    expect(r.costi.sconto_limitato).toBe(false);
    expect(r.costi.prezzo_vendita_netto).toBe(4161);
    expect(r.costi.prezzo_vendita_iva_inclusa).toBe(4577.1);
  });

  it("sconto 20% oltre il 10% di serie: si ferma a 438 e lo dice (imponibile 3.942, totale 4.336,20)", async () => {
    prepara(progetto({ sconto_tipo: "pct", sconto_valore: 20 }));
    const r = await calcola();
    expect(r.costi.sconto_eur_applicato).toBe(438);
    expect(r.costi.sconto_limitato).toBe(true);
    expect(r.costi.prezzo_vendita_iva_inclusa).toBe(4336.2);
  });

  it("sconto fisso di 300 €: imponibile 4.080, totale 4.488", async () => {
    prepara(progetto({ sconto_tipo: "importo", sconto_valore: 300 }));
    const r = await calcola();
    expect(r.costi.sconto_eur_applicato).toBe(300);
    expect(r.costi.prezzo_vendita_iva_inclusa).toBe(4488);
  });

  it("margine minimo 25% con costi veri: sconto ≤ 4.380 − 2.920/0,75 = 486,67; il margine resta 25%", async () => {
    prepara(progetto({ sconto_tipo: "pct", sconto_valore: 15 }), { discount_rules: [regola({ sconto_max_pct: 20, margine_min_pct: 25 })] });
    const r = await calcola();
    // richiesto 15% = 657 €; regole 20% = 876; margine: 4.380 − 2.920/0,75 = 486,666…
    expect(r.costi.sconto_eur_applicato).toBeCloseTo(486.67, 2);
    expect(r.costi.sconto_limitato).toBe(true);
    expect(r.costi.margine_pct).toBeCloseTo(0.25, 3);
  });

  it("prezzo a corpo 5.000 con IVA 22%: totale 6.100, lo sconto non vale, margine 5.000 − 2.920", async () => {
    prepara(progetto({ prezzo_vendita_manuale: 5000, iva_aliquota: 0.22, sconto_tipo: "pct", sconto_valore: 8 }));
    const r = await calcola();
    expect(r.costi.prezzo_vendita_netto).toBe(5000);
    expect(r.costi.sconto_eur_applicato).toBe(0);
    expect(r.costi.sconto_limitato).toBe(false);
    expect(r.costi.prezzo_vendita_iva_inclusa).toBe(6100);
    expect(r.costi.margine_eur).toBe(2080);
  });

  it.each([
    // aliquota salvata → totale su 4.380 di imponibile
    [0.1, 4818],
    [0.22, 5343.6],
    [0.04, 4555.2],
    [0, 4380],
    [10, 4818], // una percentuale scritta per frazione (10 = 10%) non deve fare 11 volte il prezzo
    [22, 5343.6],
  ])("IVA salvata %s → totale %s", async (iva, totale) => {
    prepara(progetto({ iva_aliquota: iva }));
    const r = await calcola();
    expect(r.costi.prezzo_vendita_iva_inclusa).toBeCloseTo(totale, 6);
  });

  it("un kit chiavi in mano (costo non noto): prezzo del kit, nessun margine inventato, sconto limitato dalle sole regole", async () => {
    prepara(progetto({ sconto_tipo: "pct", sconto_valore: 5, kit_bundle_id: "k1" }), {
      fv_componenti_progetto: [{ progetto_id: "p1", quantita: 1, prezzo_unitario_vendita: 8000, prezzo_unitario_netto: 0 }],
    });
    const r = await calcola();
    expect(r.costi.prezzo_pieno_netto).toBe(8000);
    expect(r.costi.sconto_eur_applicato).toBe(400);
    expect(r.costi.prezzo_vendita_iva_inclusa).toBe(8360); // 7.600 + 10%
    expect(r.costi.costi_incompleti).toBe(true);
    expect(r.costi.margine_eur).toBeNull();
    expect(r.costi.margine_pct).toBeNull();
  });

  it("manodopera e servizi sommano al totale: 10 h × 50 + pratica 250 → 4.380 + 500 + 250 = 5.130", async () => {
    prepara(progetto(), {
      fv_manodopera_progetto: [{ progetto_id: "p1", ore: 10, tariffa_oraria_vendita: 50, tariffa_oraria_netta: 30 }],
      fv_servizi_progetto: [{ progetto_id: "p1", quantita: 1, prezzo_vendita: 250, prezzo_netto: 150 }],
    });
    const r = await calcola();
    expect(r.costi.prezzo_pieno_netto).toBe(5130);
    expect(r.costi.costo_totale_netto).toBe(2920 + 300 + 150);
    expect(r.costi.prezzo_vendita_iva_inclusa).toBe(5643);
  });

  it("senza nessuna riga e senza prezzo a corpo il totale è 0, con i costi incompleti (niente margine)", async () => {
    prepara(progetto(), { fv_componenti_progetto: [] });
    const r = await calcola();
    expect(r.costi.prezzo_vendita_iva_inclusa).toBe(0);
    expect(r.costi.costi_incompleti).toBe(true);
    expect(r.costi.margine_eur).toBeNull();
  });
});

describe("fv-calcolo-finanziario — il tetto dello sconto e le regole dell'azienda", () => {
  it("con più regole che valgono, vince la PIÙ RESTRITTIVA (come compute_max_discount, sconto_max_azienda e il resto dell'app): 5% e 12% → 5%", async () => {
    prepara(progetto({ sconto_tipo: "pct", sconto_valore: 8 }), {
      discount_rules: [regola({ name: "Generale", sconto_max_pct: 5 }), regola({ name: "Fotovoltaico", tipo_lavoro: "fotovoltaico", sconto_max_pct: 12 })],
    });
    const r = await calcola();
    // 5% di 4.380 = 219; col 12% (il massimo) usciva 350,40 e il prezzo scendeva di 131 € oltre la regola
    expect(r.costi.sconto_eur_applicato).toBe(219);
    expect(r.costi.sconto_limitato).toBe(true);
    expect(r.costi.prezzo_vendita_iva_inclusa).toBe(4577.1);
  });

  it("il server e l'anteprima del wizard danno lo stesso sconto con le stesse regole (il cliente vede nel PDF il prezzo dell'anteprima)", async () => {
    const regole = [regola({ id: "a", sconto_max_pct: 5, priority: 1 }), regola({ id: "b", tipo_lavoro: "fotovoltaico", sconto_max_pct: 12, priority: 2 })];
    prepara(progetto({ sconto_tipo: "pct", sconto_valore: 8 }), { discount_rules: regole });
    const server = await calcola();
    const eval_ = evaluateDiscountRules(regole as unknown as DiscountRule[], { importo: 4380, tipoLavoro: "fotovoltaico" });
    const client = calcolaPrezzoFv({
      componenti: [
        { quantita: 16, prezzo_unitario_vendita: 180, prezzo_unitario_netto: 120 },
        { quantita: 1, prezzo_unitario_vendita: 1500, prezzo_unitario_netto: 1000 },
      ],
      manodopera: [], servizi: [], prezzoManuale: null,
      sconto: { tipo: "pct", valore: 8 }, scontoMaxPct: eval_.scontoMaxPct, margineMinPct: eval_.margineMinPct, ivaAliquota: 0.1,
    });
    expect(server.costi.sconto_eur_applicato).toBeCloseTo(client.scontoApplicato, 2);
    expect(server.costi.prezzo_vendita_iva_inclusa).toBeCloseTo(client.totale, 2);
  });

  it("una regola di un altro tipo di lavoro o di un'altra fascia di importo non conta", async () => {
    prepara(progetto({ sconto_tipo: "pct", sconto_valore: 8 }), {
      discount_rules: [
        regola({ tipo_lavoro: "serramenti", sconto_max_pct: 1 }),
        regola({ importo_min: 10000, sconto_max_pct: 2 }),
        regola({ sconto_max_pct: 9 }),
      ],
    });
    const r = await calcola();
    expect(r.costi.sconto_eur_applicato).toBeCloseTo(350.4, 2); // 8% di 4.380, sotto il 9% dell'unica regola che vale
    expect(r.costi.sconto_limitato).toBe(false);
  });
});

describe("fv-calcolo-finanziario — produzione, autoconsumo, risparmio", () => {
  it("6 kWp × 1.500 h × PR 0,85 × (1 − 11% di perdite) = 6.808,5 kWh; autoconsumo 35% = 2.382,98; immessi 4.425,53", async () => {
    prepara(progetto());
    const r = await calcola();
    expect(r.produzione_annua_kwh).toBeCloseTo(6808.5, 2);
    expect(r.autoconsumo_pct).toBe(0.35);
    expect(r.energia_autoconsumata_kwh).toBeCloseTo(2382.975, 1);
    expect(r.energia_immessa_rete_kwh).toBeCloseTo(4425.525, 1);
    // risparmio in bolletta 2.382,975 × 0,32 = 762,55; ritiro dedicato 4.425,525 × 0,10 = 442,55
    expect(r.risparmio_bolletta_eur).toBeCloseTo(762.55, 2);
    expect(r.ricavi_rid_eur).toBeCloseTo(442.55, 2);
    expect(banca.tabelle.fv_progetti[0].risparmio_anno1).toBeCloseTo(762.552 + 442.5525, 3);
  });

  it("con gli ottimizzatori il rendimento è 0,88: 9.000 × 0,88 × 0,89 = 7.048,8 kWh", async () => {
    prepara(progetto({ con_ottimizzatori: true }));
    const r = await calcola();
    expect(r.produzione_annua_kwh).toBeCloseTo(7048.8, 2);
  });

  it("con il 10% di ombra vicina la produzione scende del 10% (6.127,65); oltre il 60% si ferma al 60%", async () => {
    prepara(progetto({ perdita_ombreggiamento_pct: 0.1 }));
    expect((await calcola()).produzione_annua_kwh).toBeCloseTo(6127.65, 2);
    prepara(progetto({ perdita_ombreggiamento_pct: 0.9 }));
    expect((await calcola()).produzione_annua_kwh).toBeCloseTo(6808.5 * 0.4, 2);
  });

  it("la stima del wizard (Fase 5 e anteprima a destra) è la produzione del server, anche con ottimizzatori e ombra vicina: stessa cifra a schermo, nel calcolo e nel PDF", async () => {
    // fatti a mano su 6 kWp × 1.500 h = 9.000 h·kWp: PR 0,85 (0,88 con ottimizzatori) × 0,89 di efficienza × (1 − ombra, al massimo 60%)
    const casi: Array<{ extra: Riga; atteso: number }> = [
      { extra: {}, atteso: 6808.5 },
      { extra: { con_ottimizzatori: true }, atteso: 7048.8 },
      { extra: { perdita_ombreggiamento_pct: 0.1 }, atteso: 6127.65 },
      { extra: { con_ottimizzatori: true, perdita_ombreggiamento_pct: 0.15 }, atteso: 5991.48 },
      { extra: { perdita_ombreggiamento_pct: 0.9 }, atteso: 2723.4 },
    ];
    for (const { extra, atteso } of casi) {
      prepara(progetto(extra));
      const server = (await calcola()).produzione_annua_kwh;
      expect(server, `server ${JSON.stringify(extra)}`).toBeCloseTo(atteso, 2);
      const wizard = stimaProduzioneFv({ potenza_kwp: 6, ore_sole_annue: 1500, ...extra } as Parameters<typeof stimaProduzioneFv>[0]);
      expect(wizard, `wizard ${JSON.stringify(extra)}`).toBeCloseTo(atteso, 2);
    }
  });

  it("l'autoconsumo non supera mai il consumo: con 2.000 kWh di consumo si fermano a 2.000 e il resto è ceduto", async () => {
    prepara(progetto({ consumo_annuo_kwh: 2000 }));
    const r = await calcola();
    expect(r.energia_autoconsumata_kwh).toBe(2000);
    expect(r.energia_immessa_rete_kwh).toBeCloseTo(4808.5, 2);
    expect(r.risparmio_bolletta_eur).toBeCloseTo(640, 2); // 2.000 × 0,32
  });

  it("la batteria alza l'autoconsumo per fasce (0 / fino a 5 / fino a 10 kWh) e una capacità rimasta con la batteria spenta non conta", async () => {
    prepara(progetto({ con_accumulo: true, capacita_accumulo_kwh: 5 }));
    expect((await calcola()).autoconsumo_pct).toBe(0.55);
    prepara(progetto({ con_accumulo: true, capacita_accumulo_kwh: 5.5 }));
    expect((await calcola()).autoconsumo_pct).toBe(0.7);
    prepara(progetto({ con_accumulo: false, capacita_accumulo_kwh: 10 }));
    expect((await calcola()).autoconsumo_pct).toBe(0.35);
  });

  it("senza prezzo del kWh sul progetto vale quello di serie (0,32)", async () => {
    prepara(progetto({ costo_kwh_attuale: null }));
    expect((await calcola()).risparmio_bolletta_eur).toBeCloseTo(762.55, 2);
  });

  it("la risposta dice con quali prezzi dell'energia ha calcolato (kWh del cliente e ritiro dedicato), perché il confronto varianti del wizard parta da quelli", async () => {
    prepara(progetto({ costo_kwh_attuale: 0.28 }));
    let r = await calcola();
    expect(r.costo_kwh_attuale).toBe(0.28);
    expect(r.prezzo_rid_eur_kwh).toBe(0.1);
    prepara(progetto({ costo_kwh_attuale: null }));
    r = await calcola();
    expect(r.costo_kwh_attuale).toBe(0.32);
  });
});

/** Cassa a 25 anni fatta a mano con i parametri di serie: inflazione 2,5% (energia) e 2% (ritiro), degrado 0,5%, manutenzione 8 €/kWp, inverter 1.500 € al 12°. */
function cassaIngenua(o: { investimento: number; produzione: number; autoconsumo: number; consumo: number; prezzoKwh: number; detrazioneAnno: number; kwp: number }) {
  let cumulato = -o.investimento;
  const cumulati = [cumulato];
  const flussi = [-o.investimento];
  for (let anno = 1; anno <= 25; anno++) {
    const prod = o.produzione * Math.pow(1 - 0.005, anno - 1);
    const auto = Math.min(prod * o.autoconsumo, o.consumo);
    const flusso = auto * o.prezzoKwh * Math.pow(1.025, anno - 1)
      + (prod - auto) * 0.1 * Math.pow(1.02, anno - 1)
      + (anno <= 10 ? o.detrazioneAnno : 0)
      - o.kwp * 8
      - (anno === 12 ? 1500 : 0);
    cumulato += flusso;
    cumulati.push(cumulato);
    flussi.push(flusso);
  }
  const anno = cumulati.findIndex((c, i) => i > 0 && c >= 0);
  const payback = anno < 0 ? null : Math.round((anno - 1 + -cumulati[anno - 1] / (cumulati[anno] - cumulati[anno - 1])) * 10) / 10;
  const npv = flussi.reduce((s, f, n) => s + f / Math.pow(1.04, n), 0);
  return { cumulati, payback, npv };
}

describe("fv-calcolo-finanziario — detrazione, cassa, payback", () => {
  it("prima casa: detrazione 50% su 4.818 = 2.409 in 10 anni (240,90 l'anno); la seconda casa 36%", async () => {
    prepara(progetto());
    let r = await calcola();
    expect(r.detrazione_anno_eur).toBeCloseTo(240.9, 2);
    expect(r.incentivi.find((i: Riga) => i.codice === "DETR_50_PRIMA").importo_eur).toBeCloseTo(2409, 2);
    prepara(progetto({ prima_casa: false, archetipo: "privato_seconda" }));
    r = await calcola();
    expect(r.detrazione_anno_eur).toBeCloseTo(173.45, 2); // 4.818 × 36% / 10 = 173,448, scritto al centesimo
  });

  it("il plafond è 96.000 €: su 300.000 € di spesa la detrazione è 48.000 (non 150.000)", async () => {
    prepara(progetto(), { fv_componenti_progetto: [{ progetto_id: "p1", quantita: 1, prezzo_unitario_vendita: 300000, prezzo_unitario_netto: 200000 }] });
    const r = await calcola();
    expect(r.incentivi.find((i: Riga) => i.codice === "DETR_50_PRIMA").importo_eur).toBe(48000);
    expect(r.detrazione_anno_eur).toBe(4800);
  });

  it("la capienza IRPEF si verifica con l'aliquota della detrazione applicata: su una seconda casa col profilo di serie «privato_prima» è il 36%, non il 50%", async () => {
    prepara(progetto({ archetipo: "privato_prima", prima_casa: false, reddito_annuo_dichiarato: 30000 }));
    const r = await calcola();
    expect(r.incentivi.some((i: Riga) => i.codice === "DETR_36_SECONDA")).toBe(true);
    const salvato = banca.tabelle.fv_calcolo_finanziario.at(-1)!;
    expect(salvato.aliquota_irpef).toBe(0.36);
    prepara(progetto({ archetipo: "privato_prima", prima_casa: true, reddito_annuo_dichiarato: 30000 }));
    await calcola();
    expect(banca.tabelle.fv_calcolo_finanziario.at(-1)!.aliquota_irpef).toBe(0.5);
    prepara(progetto({ archetipo: "privato_seconda", prima_casa: null, reddito_annuo_dichiarato: 30000 }));
    await calcola();
    expect(banca.tabelle.fv_calcolo_finanziario.at(-1)!.aliquota_irpef).toBe(0.36);
  });

  it("un'azienda (PMI) non ha la detrazione del 50/36% sulla casa", async () => {
    prepara(progetto({ archetipo: "pmi", prima_casa: false }));
    const r = await calcola();
    expect(r.detrazione_anno_eur).toBe(0);
    expect(r.incentivi.some((i: Riga) => i.codice === "DETR_50_PRIMA" || i.codice === "DETR_36_SECONDA")).toBe(false);
  });

  it("la cassa a 25 anni, il payback e il valore attuale tornano col calcolo fatto a mano (4.818 €, detrazione 240,90)", async () => {
    prepara(progetto());
    const r = await calcola();
    const att = cassaIngenua({ investimento: 4818, produzione: 6808.5, autoconsumo: 0.35, consumo: 4500, prezzoKwh: 0.32, detrazioneAnno: 240.9, kwp: 6 });
    expect(r.cassa_anno_per_anno).toHaveLength(26);
    expect(r.cassa_anno_per_anno[0].cumulato).toBe(-4818);
    for (const anno of [1, 5, 10, 12, 25]) expect(r.cassa_anno_per_anno[anno].cumulato).toBeCloseTo(att.cumulati[anno], 1);
    expect(r.payback_anni).toBeCloseTo(att.payback as number, 1);
    expect(r.npv_25_anni).toBeCloseTo(att.npv, 0);
    // l'anno 12 porta la sostituzione dell'inverter
    expect(r.cassa_anno_per_anno[12].sostituzione_inverter_eur).toBe(1500);
    // «risparmio 25 anni» è la somma dei flussi in attivo: non include la spesa dell'anno 0
    const attivi = r.cassa_anno_per_anno.slice(1).reduce((s: number, f: Riga) => s + Math.max(0, f.flusso as number), 0);
    expect(r.risparmio_totale_25_anni).toBeCloseTo(attivi, 0);
  });

  it("il payback è sul prezzo scontato: più sconto, rientro prima (e la sensibilità −15% rientra dopo, +15% prima)", async () => {
    prepara(progetto());
    const base = await calcola();
    prepara(progetto({ sconto_tipo: "pct", sconto_valore: 10 }));
    const scontato = await calcola();
    expect(scontato.payback_anni).toBeLessThan(base.payback_anni);
    expect(base.sensitivity_minus15.payback_anni).toBeGreaterThan(base.payback_anni);
    expect(base.sensitivity_plus15.payback_anni).toBeLessThan(base.payback_anni);
    expect(base.sensitivity_minus15.npv).toBeLessThan(base.npv_25_anni);
    expect(base.sensitivity_plus15.npv).toBeGreaterThan(base.npv_25_anni);
  });

  it("se non rientra mai in 25 anni il payback è null, non 0", async () => {
    prepara(progetto(), { fv_componenti_progetto: [{ progetto_id: "p1", quantita: 1, prezzo_unitario_vendita: 90000, prezzo_unitario_netto: 60000 }] });
    const r = await calcola();
    expect(r.payback_anni).toBeNull();
  });

  it("CO₂ evitata: produzioni di 25 anni × 0,319 kg/kWh", async () => {
    prepara(progetto());
    const r = await calcola();
    const produzione25 = r.cassa_anno_per_anno.slice(1).reduce((s: number, f: Riga) => s + (f.produzione_kwh as number), 0);
    expect(r.co2_evitata_25_anni_kg).toBe(Math.round(produzione25 * 0.319));
  });
});

describe("fv-calcolo-finanziario — cosa scrive sul progetto", () => {
  it("disattiva il calcolo di prima e ne salva uno solo attivo", async () => {
    prepara(progetto(), { fv_calcolo_finanziario: [{ id: "vecchio", progetto_id: "p1", attivo: true }] });
    await calcola();
    const attivi = banca.tabelle.fv_calcolo_finanziario.filter((r) => r.attivo === true && r.progetto_id === "p1");
    expect(attivi).toHaveLength(1);
    expect(banca.tabelle.fv_calcolo_finanziario.find((r) => r.id === "vecchio")?.attivo).toBe(false);
  });

  it("se il prezzo cambia di almeno 1 € la rata salvata si toglie (sarebbe su un prezzo vecchio); se resta uguale resta", async () => {
    prepara(progetto({ prezzo_vendita_iva_inclusa: 5000, finanziamento_rata_eur: 120, finanziamento_totale_dovuto_eur: 7000 }));
    await calcola();
    expect(banca.tabelle.fv_progetti[0].finanziamento_rata_eur).toBeNull();
    expect(banca.tabelle.fv_progetti[0].finanziamento_totale_dovuto_eur).toBeNull();
    prepara(progetto({ prezzo_vendita_iva_inclusa: 4818.4, finanziamento_rata_eur: 120, finanziamento_totale_dovuto_eur: 7000 }));
    await calcola();
    expect(banca.tabelle.fv_progetti[0].finanziamento_rata_eur).toBe(120);
  });

  it("se la scrittura sul progetto fallisce lo dice (500): prima rispondeva 200 col prezzo nuovo e il progetto restava col vecchio, quello che legge il PDF", async () => {
    prepara(progetto({ prezzo_vendita_iva_inclusa: 5000 }));
    banca.guasti["fv_progetti:update"] = "numeric field overflow";
    const res = await chiama();
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: string }).error).toContain("numeric field overflow");
    expect(banca.tabelle.fv_progetti[0].prezzo_vendita_iva_inclusa).toBe(5000);
  });

  it("se non riesce a spegnere il calcolo di prima non ne salva un altro (due righe attive e il PDF non si genera piu')", async () => {
    prepara(progetto(), { fv_calcolo_finanziario: [{ id: "vecchio", progetto_id: "p1", attivo: true }] });
    banca.guasti["fv_calcolo_finanziario:update"] = "canceling statement due to lock timeout";
    expect((await chiama()).status).toBe(500);
    expect(banca.tabelle.fv_calcolo_finanziario).toHaveLength(1);
    expect(banca.scritture.some((w) => w.tabella === "fv_calcolo_finanziario" && w.tipo === "insert")).toBe(false);
  });

  it("senza potenza o senza consumi il calcolo si rifiuta (400) con un messaggio che chi compila capisce, e non scrive niente", async () => {
    prepara(progetto({ potenza_kwp: null }));
    const senzaPotenza = await chiama();
    expect(senzaPotenza.status).toBe(400);
    // il wizard mostra questo testo: niente nomi di colonne
    const { error } = (await senzaPotenza.json()) as { error: string };
    expect(error).toMatch(/incompleto.*potenza.*ore di sole.*consumo/);
    expect(error).not.toMatch(/_/);
    prepara(progetto({ consumo_annuo_kwh: null }));
    expect((await chiama()).status).toBe(400);
    expect(banca.scritture).toHaveLength(0);
  });

  it("un preventivo emesso, firmato o annullato non si riscrive e la risposta dice quello che dice il documento: il prezzo salvato (4.000), non il calcolo di oggi (4.818)", async () => {
    // Prima la risposta era il calcolo di oggi (4.818): la Fase 6 mostrava un prezzo diverso da quello emesso.
    for (const stato of ["emesso", "firmato", "annullato"]) {
      prepara(progetto({ stato, prezzo_vendita_iva_inclusa: 4000, finanziamento_rata_eur: 99 }));
      const r = await calcola();
      expect(r.sola_lettura, stato).toBe(true);
      expect(r.costi.prezzo_vendita_iva_inclusa, stato).toBe(4000);
      expect(banca.scritture, stato).toHaveLength(0);
      expect(banca.tabelle.fv_progetti[0].prezzo_vendita_iva_inclusa).toBe(4000);
      expect(banca.tabelle.fv_progetti[0].finanziamento_rata_eur).toBe(99);
    }
  });

  describe("la risposta di un preventivo bloccato è quella SALVATA (progetto + calcolo attivo)", () => {
    // Quello che il calcolo di quel giorno ha scritto: valori inventati e diversi da quelli di oggi.
    const calcoloSalvato = (extra: Riga = {}): Riga => ({
      progetto_id: "p1", attivo: true, produzione_annua_kwh: 5000, autoconsumo_pct: 0.4, costo_kwh_attuale: 0.28, prezzo_rid_eur_kwh: 0.09,
      energia_autoconsumata_kwh: 2000, energia_immessa_rete_kwh: 3000, risparmio_bolletta_eur: 560, ricavi_rid_eur: 270, detrazione_anno_eur: 200,
      cassa_anno_per_anno: [{ anno: 0, flusso: -4000, cumulato: -4000 }, { anno: 25, flusso: 700, cumulato: 9000 }],
      cassa_mese_anno1: [{ mese: 1, produzione_kwh: 300, flusso: 60 }],
      payback_anni: 7.5, npv_25_anni: 1234.5, irr_pct: 0.08, risparmio_totale_25_anni: 20000,
      capienza_irpef_ok: true, capienza_irpef_recuperabile_pct: 100,
      sensitivity_minus15: { payback_anni: 8.5 }, sensitivity_plus15: { payback_anni: 6.8 },
      scenario_auto_elettrica: { payback_anni: 7 }, scenario_pompa_calore: { payback_anni: 6 },
      confronto_btp_25anni: { tasso: 0.03 }, confronto_deposito_25anni: { tasso: 0.01 }, incentivi: [{ codice: "SALVATO", nome: "Salvato" }],
      ...extra,
    });
    // 4.000 IVA 10% inclusa = 3.636,36 di imponibile; costi 3.100 → margine 536,36 (14,75%)
    const emesso = (extra: Riga = {}): Riga => progetto({
      stato: "emesso", prezzo_vendita_iva_inclusa: 4000, sconto_eur_applicato: 0, costo_totale_netto: 3100,
      margine_eur: 536.36, margine_pct: 0.1475, payback_anni: 7.5, npv_25_anni: 1234.5, finanziamento_rata_eur: 99, ...extra,
    });

    it("prezzo, sconto e margine sono quelli del progetto; produzione, risparmio, payback, cassa e incentivi quelli del calcolo attivo", async () => {
      for (const stato of ["emesso", "firmato", "annullato"]) {
        prepara(emesso({ stato }), { fv_calcolo_finanziario: [calcoloSalvato()] });
        const r = await calcola();
        expect(r.costi, stato).toMatchObject({
          prezzo_vendita_iva_inclusa: 4000, prezzo_vendita_netto: 3636.36, prezzo_pieno_netto: 3636.36, sconto_eur_applicato: 0,
          sconto_limitato: false, costo_totale_netto: 3100, margine_eur: 536.36, margine_pct: 0.1475, costi_incompleti: false,
        });
        expect(r, stato).toMatchObject({
          sola_lettura: true, produzione_annua_kwh: 5000, autoconsumo_pct: 0.4, costo_kwh_attuale: 0.28, prezzo_rid_eur_kwh: 0.09,
          risparmio_bolletta_eur: 560, ricavi_rid_eur: 270, detrazione_anno_eur: 200, payback_anni: 7.5, npv_25_anni: 1234.5, irr_pct: 0.08,
          risparmio_totale_25_anni: 20000, capienza_irpef_ok: true,
        });
        expect(r.cassa_anno_per_anno).toEqual(calcoloSalvato().cassa_anno_per_anno);
        expect(r.incentivi).toEqual([{ codice: "SALVATO", nome: "Salvato" }]);
        expect(r.sensitivity_minus15).toEqual({ payback_anni: 8.5 });
        expect(banca.scritture, stato).toHaveLength(0);
      }
    });

    it("con uno sconto concesso, il prezzo pieno è imponibile + sconto salvato (non quello di oggi)", async () => {
      // imponibile 3.636,36 dopo uno sconto di 400 → pieno 4.036,36
      prepara(emesso({ sconto_eur_applicato: 400 }), { fv_calcolo_finanziario: [calcoloSalvato()] });
      const r = await calcola();
      expect(r.costi).toMatchObject({ prezzo_vendita_netto: 3636.36, sconto_eur_applicato: 400, prezzo_pieno_netto: 4036.36 });
    });

    it("un payback salvato vuoto (non rientra mai in 25 anni) resta vuoto: non diventa quello di oggi", async () => {
      prepara(emesso({ payback_anni: null }), { fv_calcolo_finanziario: [calcoloSalvato({ payback_anni: null, irr_pct: null })] });
      const r = await calcola();
      expect(r.payback_anni).toBeNull();
      expect(r.irr_pct).toBeNull();
    });

    it("senza un calcolo attivo (capita agli emessi più vecchi) prezzo e risultati principali sono quelli del progetto; il resto è il calcolo di oggi", async () => {
      prepara(emesso({ payback_anni: 9.9, npv_25_anni: 555, produzione_annua_kwh: 4800, autoconsumo_pct: 0.3 }));
      const r = await calcola();
      expect(r.costi).toMatchObject({ prezzo_vendita_iva_inclusa: 4000, margine_eur: 536.36, costo_totale_netto: 3100 });
      expect(r).toMatchObject({ sola_lettura: true, payback_anni: 9.9, npv_25_anni: 555, produzione_annua_kwh: 4800, autoconsumo_pct: 0.3 });
      // il resto c'è comunque: la risposta non ha buchi
      expect(r.cassa_anno_per_anno).toHaveLength(26);
      expect(Array.isArray(r.incentivi)).toBe(true);
      expect(banca.scritture).toHaveLength(0);
    });

    it("se il progetto non ha nessun prezzo salvato (mai calcolato) la risposta è il calcolo di oggi, senza scrivere", async () => {
      prepara(progetto({ stato: "emesso", prezzo_vendita_iva_inclusa: null }));
      const r = await calcola();
      expect(r.costi.prezzo_vendita_iva_inclusa).toBe(4818);
      expect(banca.scritture).toHaveLength(0);
    });

    it("un preventivo in bozza continua a rispondere con il calcolo di oggi e a scriverlo, qualunque cosa ci sia di salvato", async () => {
      prepara(emesso({ stato: "bozza" }), { fv_calcolo_finanziario: [calcoloSalvato()] });
      const r = await calcola();
      expect(r.costi.prezzo_vendita_iva_inclusa).toBe(4818);
      expect(r.sola_lettura).toBeUndefined();
      expect(banca.tabelle.fv_progetti[0].prezzo_vendita_iva_inclusa).toBe(4818);
    });
  });
});

describe("fv-calcolo-finanziario — la cassa del primo anno, mese per mese", () => {
  const somma = (r: Record<string, any>) => r.cassa_mese_anno1.reduce((s: number, m: Riga) => s + (m.produzione_kwh as number), 0); // eslint-disable-line @typescript-eslint/no-explicit-any

  it.each([
    ["VI", "Nord"], ["NA", "Sud"], ["PA", "Isole"], ["RM", "Centro"], [null, "provincia mancante"],
  ])("provincia %s (%s): i dodici mesi sommano alla produzione dell'anno", async (provincia) => {
    prepara(progetto({ provincia }));
    const r = await calcola();
    expect(r.cassa_mese_anno1).toHaveLength(12);
    expect(somma(r)).toBeCloseTo(r.produzione_annua_kwh, 0);
  });
});
