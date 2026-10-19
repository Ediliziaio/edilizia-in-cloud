import { beforeEach, describe, expect, it } from "vitest";
import { DbMinimo } from "../helpers/edgeFinto";
import { SILVIO_TOOLS, type ToolContext } from "../../../supabase/functions/_shared/silvioTools";

// Il riepilogo di Silvio prima di approvare conta le ore che l'approvazione registra davvero:
// le presenze della squadra, non solo le ore di chi ha compilato.
let db: DbMinimo;
let ctx: ToolContext;
const oggi = new Date().toISOString().slice(0, 10);

beforeEach(() => {
  db = new DbMinimo();
  db.tabelle.employees = [
    { id: "e-marco", company_id: "c", user_id: "u-marco", first_name: "Marco", last_name: "Prova" },
    { id: "e-luca", company_id: "c", user_id: null, first_name: "Luca", last_name: "Esempio" },
    { id: "e-anna", company_id: "c", user_id: null, first_name: "Anna", last_name: "Campione" },
  ];
  db.tabelle.campo_rapportini = [{
    id: "r1", company_id: "c", user_id: "u-marco", order_id: "o1", data_lavoro: oggi, stato: "inviato",
    ore_lavorate: 8, ore_straordinario: 0, descrizione_lavori: "Getto",
    presenze: [{ employee_id: "e-marco", ore: 8 }, { employee_id: "e-luca", ore: 8 }, { employee_id: "e-anna", ore: 8 }],
    ufficio_employee_id: null,
  }];
  db.rpcs.costo_orario_dipendente = (args: Record<string, unknown>) => (args.p_employee_id === "e-anna" ? null : 24);
  ctx = { supabase: db, companyId: "c", userId: "u-admin", primaryRole: "company_admin", channel: "internal_chat", personaKey: "silvio" };
});

const anteprima = (args: Record<string, unknown> = {}) =>
  SILVIO_TOOLS.approva_rapportini.executor({ solo_conteggio: true, ...args }, ctx) as Promise<Record<string, unknown>>;

describe("approva_rapportini di Silvio", () => {
  it("conta persone e ore della squadra", async () => {
    const r = await anteprima();
    expect(r).toMatchObject({ rapportini: 1, persone: 3, ore_totali: 24 });
  });

  it("trova la persona anche se è solo nelle presenze", async () => {
    const r = await anteprima({ persona: "Luca" });
    expect(r).toMatchObject({ rapportini: 1 });
  });

  it("avvisa prima di approvare chi non ha un costo orario", async () => {
    const r = await anteprima();
    expect(String(r.avviso_costo)).toContain("Anna Campione");
  });
});
