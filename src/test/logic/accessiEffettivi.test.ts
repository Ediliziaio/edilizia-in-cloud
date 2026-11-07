import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AREE_SENSIBILI,
  accessiEffettivi,
  nomePermesso,
  nomiPermessi,
  vociAccesePerArea,
} from "@/lib/permessi/accessiEffettivi";
import { ROLE_PRESETS } from "@/components/users/permissionsDefaults";

const area = (id: string) => AREE_SENSIBILI.find((a) => a.id === id)!;
const SQL = {
  finanza: readFileSync("supabase/migrations/20281118100000_permessi_fase2_finanza.sql", "utf8"),
  cg: readFileSync("supabase/migrations/20281118090000_permessi_fase1_urgenze.sql", "utf8"),
  aree: readFileSync("supabase/migrations/20281118110000_permessi_fase3_ruoli.sql", "utf8"),
  correzioni: readFileSync("supabase/migrations/20281118120000_permessi_correzioni_verifica.sql", "utf8"),
  acquisti: readFileSync("supabase/migrations/20281118190000_call_center_e_scheda_subappaltatori.sql", "utf8"),
};
const permessiIn = (testo: string) => new Set(testo.match(/can_(?:view|edit|manage|validate)_[a-z_]+/g) ?? []);

describe("gli elenchi sono quelli delle regole del database", () => {
  it("finanza", () => {
    expect(new Set(area("finanza").aperturaDa)).toEqual(permessiIn(SQL.finanza));
  });

  it("margini e rating", () => {
    expect(new Set(area("controllo_gestione").aperturaDa)).toEqual(permessiIn(SQL.cg));
  });

  it.each([
    ["acquisti", "purchase_orders"],
    ["whatsapp", "whatsapp_messages"],
    ["registri", "central_audit_log"],
  ])("%s", (id, tabella) => {
    // Vale l'ultima migrazione che tocca la tabella.
    const voce = new RegExp(`\\('${tabella}', array\\[([^\\]]+)\\]`);
    const riga = tabella === "purchase_orders"
      ? [...SQL.acquisti.matchAll(/aziende_area\(array\[([^\]]+)\]/g)].map((m) => m[1]).join(",")
      : SQL.correzioni.match(voce)?.[1] ?? SQL.aree.match(voce)?.[1] ?? "";
    expect(new Set(area(id).aperturaDa)).toEqual(permessiIn(riga));
  });
});

describe("cosa vede davvero", () => {
  it("il modello Call Center ha la sua dashboard, non quella generale né il calendario lavori", () => {
    const p = ROLE_PRESETS.call_center as Record<string, unknown>;
    expect(p.can_view_callcenter_dashboard).toBe(true);
    expect(p.can_view_marketing_dashboard ?? false).toBe(false);
    expect(p.can_view_dashboard ?? false).toBe(false);
    expect(p.can_view_calendar ?? false).toBe(false);
  });

  it("al Call Center Dashboard e Calendario non aprono gli ordini ai fornitori, Commesse sì", () => {
    const ordini = (p: Record<string, unknown>, ruolo?: string) =>
      accessiEffettivi(p, ruolo).find((a) => a.area.id === "acquisti")!;
    expect(ordini({ can_view_dashboard: true, can_view_calendar: true }, "call_center").aperta).toBe(false);
    expect(ordini({ can_view_dashboard: true }, "company_staff").aperta).toBe(true);
    expect(ordini({ can_view_dashboard: true, can_view_orders: true }, "call_center").apertaDa).toEqual(["can_view_orders"]);
  });

  it("spegnere il Controllo di gestione non basta se restano accesi i Costi", () => {
    const accessi = accessiEffettivi({ can_view_controllo_gestione: false, can_view_costs: true });
    const cg = accessi.find((a) => a.area.id === "controllo_gestione")!;
    expect(cg.aperta).toBe(true);
    expect(cg.apertaDa).toEqual(["can_view_costs"]);
  });

  it("i preventivi non aprono gli ordini ai fornitori", () => {
    const accessi = accessiEffettivi({ can_view_preventivi: true, can_edit_preventivi: true });
    expect(accessi.find((a) => a.area.id === "acquisti")?.aperta).toBe(false);
  });

  it("senza permessi è tutto chiuso", () => {
    expect(accessiEffettivi({}).every((a) => !a.aperta)).toBe(true);
  });

  it("elenca solo le sezioni accese e nasconde i gruppi vuoti", () => {
    const aree = [
      { id: "a", label: "Cantieri", modules: [{ label: "Commesse", viewKey: "can_view_orders" }, { label: "Magazzino", viewKey: "can_view_warehouse" }] },
      { id: "b", label: "Finanza", modules: [{ label: "Costi", viewKey: "can_view_costs" }] },
    ];
    expect(vociAccesePerArea(aree, { can_view_orders: true })).toEqual([{ id: "a", label: "Cantieri", voci: ["Commesse"] }]);
    expect(nomePermesso("can_view_costs", aree)).toBe("Costi");
    expect(nomePermesso("can_view_tesoreria", aree)).toBe("tesoreria");
    // Non i nomi tecnici: il «modifica» si chiama come la sua voce, e non si ripete.
    const conVoci = [{ id: "c", label: "Cantieri", modules: [{ label: "Ordini e Commesse", viewKey: "can_view_orders" }] }];
    expect(nomePermesso("can_edit_orders", conVoci)).toBe("Ordini e Commesse");
    expect(nomiPermessi(["can_view_orders", "can_edit_orders"], conVoci)).toEqual(["Ordini e Commesse"]);
  });
});

it("BUG-02: traduce i permessi storici senza ripetere le etichette dei moduli", () => {
  const aree = [{ id: "c", label: "Cantieri", modules: [
    { label: "Ordini e Commesse", viewKey: "can_view_orders_list" },
    { label: "Magazzino", viewKey: "can_view_warehouse_stock" },
    { label: "Ticket Assistenza", viewKey: "can_view_tickets_list" },
  ] }];
  expect(nomiPermessi(["can_view_orders", "can_edit_orders", "can_view_orders_list", "can_view_warehouse", "can_view_warehouse_stock", "can_view_tickets", "can_view_tickets_list"], aree)).toEqual(["Ordini e Commesse", "Magazzino", "Ticket Assistenza"]);
});
