// Le scelte del titolare (quale cantiere, quale richiesta) arrivano come
// bottoni/liste interattive, non più come «scrivi il numero» (fragile: il
// modello doveva mappare un indice su un UUID). Il tap manda il nome/oggetto,
// che il bot ricerca da solo.
import { beforeEach, describe, expect, it } from "vitest";
import { DbMinimo } from "../helpers/edgeFinto";
import { statoCantiere } from "../../../supabase/functions/whatsapp-ai-processor/tools/titolare/stato_cantiere";
import { marginalitaCantiere } from "../../../supabase/functions/whatsapp-ai-processor/tools/titolare/marginalita_cantiere";
import { listaApprovazioni } from "../../../supabase/functions/whatsapp-ai-processor/tools/titolare/lista_approvazioni";
import type { ToolCtx } from "../../../supabase/functions/whatsapp-ai-processor/tools/shared/types";

let db: DbMinimo;
let ctx: ToolCtx;

beforeEach(() => {
  db = new DbMinimo();
  ctx = {
    supabase: db, company_id: "company", user_id: "titolare", kind: "admin",
    locale: "it", waNumberId: "number", sessionId: null, requestId: "m1", role_grants: [],
  } as unknown as ToolCtx;
});

const dueCantieri = () => {
  db.rpcs.search_cantieri_by_trigram = () => [
    { id: "c1", name: "Villa Rossi" },
    { id: "c2", name: "Villa Bianchi" },
  ];
};

describe("scelte a bottoni al posto di «scrivi il numero»", () => {
  it("stato_cantiere con più cantieri manda una lista a bottoni con i nomi, non un numero da scrivere", async () => {
    dueCantieri();
    const r = await statoCantiere(ctx, { query: "villa" });
    expect(r.ok).toBe(true);
    const inter = ((r as { data?: unknown }).data as { __interactive?: unknown })?.__interactive;
    expect(inter).toBeTruthy();
    const dump = JSON.stringify(inter);
    expect(dump).toContain("Villa Rossi");
    expect(dump).toContain("Villa Bianchi");
    expect(r.user_message ?? "").not.toContain("Scrivi il numero");
    expect(r.user_message ?? "").not.toContain("Quale intendevi");
  });

  it("marginalita con più cantieri manda una lista a bottoni", async () => {
    dueCantieri();
    const r = await marginalitaCantiere(ctx, { query: "villa" });
    expect(r.ok).toBe(true);
    const dump = JSON.stringify(((r as { data?: unknown }).data as { __interactive?: unknown })?.__interactive ?? "");
    expect(dump).toContain("Villa Rossi");
    expect(dump).toContain("Villa Bianchi");
  });

  it("lista_approvazioni manda le richieste come bottoni con l'oggetto, non un numero da scrivere", async () => {
    db.tabelle.tickets = [
      { id: "t1", company_id: "company", subject: "Betoniera rotta", priorita: "alta", status: "aperto", fonte: "campo", created_at: "2026-10-20", order_id: "o1" },
      { id: "t2", company_id: "company", subject: "Materiale mancante", priorita: "media", status: "aperto", fonte: "campo", created_at: "2026-10-19", order_id: "o2" },
    ];
    const r = await listaApprovazioni(ctx);
    expect(r.ok).toBe(true);
    const inter = ((r as { data?: unknown }).data as { __interactive?: unknown; items?: unknown[] })?.__interactive;
    expect(inter).toBeTruthy();
    const dump = JSON.stringify(inter);
    expect(dump).toContain("Betoniera rotta");
    expect(dump).toContain("Materiale mancante");
    expect(r.user_message ?? "").not.toContain("Scrivi il numero");
  });
});
