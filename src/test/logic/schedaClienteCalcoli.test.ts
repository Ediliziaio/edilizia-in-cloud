// src/test/logic/schedaClienteCalcoli.test.ts
/** I conti della scheda cliente (23/10/2026): rate col residuo, cosa fare, anagrafica. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { rateConResiduo, totaleDaIncassare, type SchedaCliente } from "@/lib/clienti/schedaCliente";
import { azioniSuggerite, testoSollecito } from "@/lib/clienti/cosaFareAdesso";
import { campiDaCompletare, sembraAzienda } from "@/lib/clienti/anagraficaCliente";

const OGGI = "2026-10-23";
const scheda = (over: Partial<SchedaCliente> = {}): SchedaCliente => ({
  ordini: [{ id: "o1", order_code: "ORD-1", description: null, total_amount: 1000, created_at: "2026-01-01", current_status_id: null, order_statuses: null }],
  anagrafica: null, fatture: [], preventivi: [], ticket: [], interventi: [], appuntamenti: [],
  rate: [
    { id: "r1", order_id: "o1", label: "Acconto", tipo: "standard", importo: 600, is_paid: false, paid_date: null, expected_date: "2026-09-01" },
    { id: "r2", order_id: "o1", label: "Saldo", tipo: "standard", importo: 400, is_paid: true, paid_date: "2026-10-01", expected_date: "2026-10-01" },
  ],
  da_incassare: [
    { id: "r1", order_id: "o1", residuo: 250, expected_date: "2026-09-01", finanziamento: false },
    { id: "non-pianificato-o1", order_id: "o1", residuo: 100, expected_date: null, finanziamento: false },
  ],
  ...over,
});

describe("rate e residui", () => {
  it("ogni rata ha quanto resta, la parte non pianificata compare a parte, la pagata è incassata", () => {
    const righe = rateConResiduo(scheda(), OGGI);
    expect(righe.find((r) => r.id === "r1")).toMatchObject({ residuo: 250, scaduta: true, pagata: false, order_code: "ORD-1" });
    expect(righe.find((r) => r.id === "r2")).toMatchObject({ residuo: 0, pagata: true, scaduta: false });
    expect(righe.find((r) => r.id === "non-pianificato-o1")).toMatchObject({ label: "Da pianificare", residuo: 100 });
    expect(totaleDaIncassare(scheda(), OGGI)).toEqual({ totale: 350, scaduto: 250 });
  });

  it("chi non può vedere gli incassi non vede «tutto incassato»", () => {
    expect(totaleDaIncassare(scheda({ da_incassare: null }), OGGI)).toBeNull();
    expect(rateConResiduo(scheda({ da_incassare: null }), OGGI)[0]).toMatchObject({ residuo: null, scaduta: false });
  });
});

describe("cosa fare adesso", () => {
  it("prima il sollecito, poi il preventivo fermo da una settimana, poi l'assistenza aperta da tre giorni", () => {
    const azioni = azioniSuggerite({
      rate: rateConResiduo(scheda(), OGGI),
      preventivi: [
        { id: "q1", quote_number: "OFF-1", title: null, total: 5000, status: "in_corso", created_at: "2026-10-10T08:00:00Z" },
        { id: "q2", quote_number: "OFF-2", title: null, total: 1000, status: "in_corso", created_at: "2026-10-20T08:00:00Z" },
        { id: "q3", quote_number: "OFF-3", title: null, total: 1000, status: "vinto", created_at: "2026-01-20T08:00:00Z" },
      ],
      tickets: [
        { id: "t1", title: "Perdita", status: "aperto", priority: null, created_at: "2026-10-19T08:00:00Z" },
        { id: "t2", title: "Fatto", status: "risolto", priority: null, created_at: "2026-01-19T08:00:00Z" },
      ],
    }, OGGI);
    expect(azioni.map((a) => a.tipo)).toEqual(["sollecito", "preventivo", "assistenza"]);
    expect(azioni[0]).toMatchObject({ importo: 250, giorni: 52, commesse: ["ORD-1"] });
    expect(azioni[1]).toMatchObject({ id: "q1", giorni: 13 });
    expect(azioni[2]).toMatchObject({ id: "t1", giorni: 4 });
  });

  it("niente da fare: niente riga", () => {
    expect(azioniSuggerite({ rate: [], preventivi: [], tickets: [] }, OGGI)).toEqual([]);
  });

  it("il sollecito è cortese e dice importo e commessa", () => {
    const { oggetto, testo } = testoSollecito({ tipo: "sollecito", importo: 250, giorni: 52, commesse: ["ORD-1"] }, "Mario Rossi", "Edil Demo");
    expect(oggetto).toBe("Promemoria pagamento — ORD-1");
    expect(testo).toContain("Gentile Mario Rossi,");
    expect(testo).toMatch(/€ 250,00 \(commessa ORD-1\)/);
    expect(testo).toContain("Se ha già provveduto al pagamento");
  });
});

describe("anagrafica", () => {
  it("riconosce condomini e società salvati come persone", () => {
    for (const n of ["Condominio DEMO 2023 10", "Edil Rossi S.r.l.", "BIANCHI SRL", "Impresa Verdi", "Studio Neri"]) expect(sembraAzienda(n), n).toBe(true);
    for (const n of ["Mario Rossi", "Sara Srlini", "Condorelli Anna"]) expect(sembraAzienda(n), n).toBe(false);
  });

  it("dice cosa manca per chiamare, scrivere e fatturare", () => {
    expect(campiDaCompletare({ email: "x@no-email.ediliziaincloud.local", phone: null, fiscal_code: null, address: null })).toEqual(["Telefono", "Email", "Codice fiscale", "Indirizzo"]);
    expect(campiDaCompletare({ email: "a@b.it", phone: "333", vat_number: null, is_business: true, address: "Via Roma 1", city: null })).toEqual(["Partita IVA", "Città"]);
    expect(campiDaCompletare({ email: "a@b.it", phone: "333", fiscal_code: "RSSMRA80A01H501U", address: "Via Roma 1", city: "Roma" })).toEqual([]);
  });
});

describe("la lettura unica", () => {
  const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20281023214500_scheda_cliente_in_una_lettura.sql"), "utf8");
  it("legge con i permessi di chi guarda, aperta solo agli utenti, con il piano preparato una volta", () => {
    expect(sql).toContain("security invoker");
    expect(sql).toContain("set plan_cache_mode = force_generic_plan");
    expect(sql).toContain("revoke all on function public.scheda_cliente(uuid, uuid) from public, anon;");
    expect(sql).toContain("grant execute on function public.scheda_cliente(uuid, uuid) to authenticated;");
  });
  it("le rate con le colonne vere, e lo scaduto con la regola della scheda commessa", () => {
    expect(sql).toContain("'expected_date', i.expected_date");
    expect(sql).not.toMatch(/i\.(due_date|paid_at)/);
    expect(sql).toContain("from public.cruscotto_rate_da_incassare(p_company_id) r");
  });
});
