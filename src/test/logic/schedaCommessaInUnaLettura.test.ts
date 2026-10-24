// src/test/logic/schedaCommessaInUnaLettura.test.ts
/**
 * La scheda commessa in una lettura sola (23/10/2026): ogni pezzo va sotto la
 * chiave del componente che lo usa, con la forma che il componente si
 * costruirebbe da solo.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { QueryClient } from "@tanstack/react-query";
import { avanzamentoFasi, fattureDellaCommessa, seminaSchedaCommessa, type SchedaCommessa } from "@/lib/orders/schedaCommessa";

const leggi = (f: string) => readFileSync(resolve(process.cwd(), f), "utf8");

const scheda = (altro: Partial<SchedaCommessa> = {}): SchedaCommessa => ({
  stati: [{ id: "s1", name: "Aperta", position: 1 }],
  fasi: [{ status: "completata", percentuale: null }, { status: "in_corso", percentuale: 50 }, { status: "da_fare", percentuale: null }],
  storia: [{ id: "h1", status_id: "s1" }],
  allegati: Array.from({ length: 10 }, (_, i) => ({ id: `a${i}`, file_name: `f${i}.pdf`, file_url: "u", file_type: "pdf", file_size: 1, visible_to_customer: false, created_at: "2026-10-23", thumb_path: null as string | null, order_id: "o1" })),
  prossima_attivita: { id: "t1", title: "Sopralluogo" },
  commessa: { id: "o1", workflow_kind: "commessa", parent_contract_id: null, intervention_reference: null, order_code: "C-1", percentuale_avanzamento: 40 },
  impostazioni_fasi: { peso_media: "uguale", modello_fasi_predefinito: null, controlli_avvio: null },
  fatture_collegate: [{ id: "j1", importo_associato: 300, fattura_id: "f1", company_id: "c1" }],
  fatture_dirette: [{ id: "f1", numero: "1", company_id: "c1" }, { id: "f2", numero: "2", company_id: "c1" }],
  fatture_da_collegamento: [{ id: "f1", numero: "1" }],
  varianti: [{ id: "v1" }],
  rate: [{ id: "r1", fattura: null }],
  materiali: [{ id: "m1" }],
  accessi: [{ id: "x1", profile: null }],
  manodopera_presente: true,
  ticket: null,
  rapportini_da_approvare: 2,
  correzioni_da_approvare: 1,
  bolle_da_verificare: 3,
  fasi_ufficio: [{ id: "u1" }],
  documenti_cliente: null,
  economia: null,
  ...altro,
});

describe("avanzamento delle fasi", () => {
  it("conta fatte, in corso e media come la testata della commessa", () => {
    expect(avanzamentoFasi(scheda().fasi)).toEqual({ total: 3, done: 1, inCorso: 1, avgPct: 50 });
    expect(avanzamentoFasi([])).toEqual({ total: 0, done: 0, inCorso: 0, avgPct: null });
    expect(avanzamentoFasi([{ status: "in_corso", percentuale: 100 }]).done).toBe(1);
  });
});

describe("fatture della commessa", () => {
  it("una per fattura, con la quota assegnata a questa commessa", () => {
    const fatture = fattureDellaCommessa(scheda());
    expect(fatture.map((f) => f.id)).toEqual(["f1", "f2"]);
    expect(fatture[0]).toMatchObject({ importo_associato: 300, company_id: "c1" });
    expect(fatture[1].importo_associato).toBeNull();
  });
});

describe("semina della scheda", () => {
  const ids = { id: "o1", companyId: "c1" };

  it("ogni componente trova il suo pezzo sotto la sua chiave", () => {
    const qc = new QueryClient();
    seminaSchedaCommessa(qc, scheda(), ids);
    expect(qc.getQueryData(["orders", "statuses", "c1"])).toHaveLength(1);
    expect(qc.getQueryData(["order-phases-progress", "o1"])).toMatchObject({ total: 3, done: 1 });
    expect(qc.getQueryData(["order-attachments", "o1"])).toHaveLength(10);
    const riepilogo = qc.getQueryData<Record<string, unknown>[]>(["order-documents-summary", "o1"]);
    expect(riepilogo).toHaveLength(8);
    expect(Object.keys(riepilogo![0])).not.toContain("order_id");
    expect(qc.getQueryData(["order-contract-link", "c1", "o1"])).toEqual({ id: "o1", workflow_kind: "commessa", parent_contract_id: null, intervention_reference: null, order_code: "C-1" });
    expect(qc.getQueryData(["order-avanzamento", "o1"])).toBe(40);
    expect(qc.getQueryData(["peso-media-fasi", "c1"])).toBe("uguale");
    expect(qc.getQueryData(["impostazioni-avvio", "c1"])).toMatchObject({ modelloFasi: null });
    expect(qc.getQueryData(["ordine-fatture", "o1", "c1"])).toHaveLength(2);
    expect(qc.getQueryData(["ordini-variazione", "o1", "c1"])).toHaveLength(1);
    expect(qc.getQueryData(["orders", "installments", "o1"])).toHaveLength(1);
    expect(qc.getQueryData(["order-items", "o1"])).toHaveLength(1);
    expect(qc.getQueryData(["order-campo-assignments", "o1"])).toHaveLength(1);
    expect(qc.getQueryData(["order-workforce-presence", "o1"])).toBe(true);
    expect(qc.getQueryData(["campo-rapportini-ordine", "o1", "da-approvare"])).toBe(2);
    expect(qc.getQueryData(["campo-da-approvare-conteggi", "o1"])).toEqual({ correzioni: 1, bolle: 3 });
    expect(qc.getQueryData(["commessa-fasi-ufficio", "o1", "riepilogo"])).toHaveLength(1);
  });

  it("margini, assistenza e documenti del cliente solo quando sono arrivati", () => {
    const qc = new QueryClient();
    seminaSchedaCommessa(qc, scheda(), ids);
    expect(qc.getQueryState(["order-economics-canonical", "o1"])).toBeUndefined();
    expect(qc.getQueryState(["order-tickets", "o1", "c1"])).toBeUndefined();
    expect(qc.getQueryState(["documenti-cliente-commessa", "o1"])).toBeUndefined();

    seminaSchedaCommessa(qc, scheda({
      ticket: [{ id: "k1" }],
      documenti_cliente: [{ id: "d1" }],
      economia: { canonica: { margine: 10 }, mezzi: null, dipendenti: [], squadre: [], venditori: [], errori: [{ amount: 5 }] },
    }), ids);
    expect(qc.getQueryData(["order-economics-canonical", "o1"])).toEqual({ margine: 10 });
    expect(qc.getQueryData(["order-economics-vehicles", "o1"])).toBeNull();
    expect(qc.getQueryData(["oes-errors", "o1"])).toEqual([{ amount: 5 }]);
    expect(qc.getQueryData(["order-tickets", "o1", "c1"])).toHaveLength(1);
    expect(qc.getQueryData(["documenti-cliente-commessa", "o1"])).toHaveLength(1);
  });
});

describe("la migrazione e la pagina", () => {
  const sql = leggi("supabase/migrations/20281023234500_scheda_commessa_in_una_lettura.sql");

  it("legge con i permessi di chi guarda, solo per gli utenti, piano preparato una volta", () => {
    expect(sql).toContain("security invoker");
    expect(sql).toContain("set plan_cache_mode = force_generic_plan");
    expect(sql).toContain("revoke all on function public.scheda_commessa(uuid, uuid, boolean, boolean) from public, anon;");
    expect(sql).toContain("grant execute on function public.scheda_commessa(uuid, uuid, boolean, boolean) to authenticated;");
  });

  it("margini e assistenza solo se la pagina li chiede", () => {
    expect(sql).toContain("if p_con_economia then");
    expect(sql).toContain("case when p_con_ticket then");
    const pagina = leggi("src/pages/azienda/OrderDetail.tsx");
    expect(pagina).toContain('rpc("scheda_commessa"');
    expect(pagina).toContain("p_con_economia: conEconomia, p_con_ticket: conTicket");
    expect(pagina).toContain("const conEconomia = permissions.canViewMargins;");
    expect(pagina).toContain("const conTicket = permissions.canViewTickets;");
  });
});
