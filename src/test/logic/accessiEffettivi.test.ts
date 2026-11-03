import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AREE_SENSIBILI,
  accessiEffettivi,
  nomePermesso,
  vociAccesePerArea,
} from "@/lib/permessi/accessiEffettivi";

const area = (id: string) => AREE_SENSIBILI.find((a) => a.id === id)!;
const SQL = {
  finanza: readFileSync("supabase/migrations/20281118100000_permessi_fase2_finanza.sql", "utf8"),
  cg: readFileSync("supabase/migrations/20281118090000_permessi_fase1_urgenze.sql", "utf8"),
  aree: readFileSync("supabase/migrations/20281118110000_permessi_fase3_ruoli.sql", "utf8"),
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
    const riga = SQL.aree.match(new RegExp(`\\('${tabella}', array\\[([^\\]]+)\\]`))?.[1] ?? "";
    expect(new Set(area(id).aperturaDa)).toEqual(permessiIn(riga));
  });
});

describe("cosa vede davvero", () => {
  it("spegnere il Controllo di gestione non basta se restano accesi i Costi", () => {
    const accessi = accessiEffettivi({ can_view_controllo_gestione: false, can_view_costs: true });
    const cg = accessi.find((a) => a.area.id === "controllo_gestione")!;
    expect(cg.aperta).toBe(true);
    expect(cg.apertaDa).toEqual(["can_view_costs"]);
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
  });
});
