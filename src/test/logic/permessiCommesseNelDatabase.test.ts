/**
 * Permessi delle commesse rispettati dal database (25/09/2026).
 *
 * Provato in una transazione annullata, prima della correzione:
 *   · delete_order_cascading (SECURITY DEFINER) controllava solo l'azienda:
 *     un venditore con i soli permessi marketing e un cliente del portale
 *     cancellavano una commessa;
 *   · la policy dello staff su orders era FOR ALL con can_edit_orders: si
 *     cancellava senza «Elimina Ordini»;
 *   · la cronologia (order_events) la leggeva e la scriveva chiunque fosse
 *     interno all'azienda;
 *   · rilascia_numero_documento cancellava bozze fiscali senza «Fatturazione»;
 *   · commessa_salva ignorava «Solo i propri».
 * Dopo: 17 casi su 17 come atteso, compresi quelli che devono continuare a
 * funzionare (amministratore, super admin, staff con «Elimina Ordini»).
 *
 * Tiene fermo che la regola del database sia la stessa del pulsante nell'app.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const leggi = (percorso: string) => readFileSync(resolve(process.cwd(), percorso), "utf8");
const sql = leggi("supabase/migrations/20280925235847_permessi_commesse_nel_database.sql");
// Le istruzioni, senza i commenti (che raccontano anche com'era prima).
const codice = sql.replace(/--.*$/gm, "");

/** Il corpo di una funzione creata nella migrazione. */
function corpo(nome: string): string {
  const m = codice.match(new RegExp(`create or replace function public\\.${nome}\\([\\s\\S]*?\\$function\\$([\\s\\S]*?)\\$function\\$`));
  expect(m, `funzione ${nome} nella migrazione`).not.toBeNull();
  return m![1];
}

describe("migrazione permessi_commesse_nel_database", () => {
  it("non aspetta i lock", () => {
    expect(codice).toMatch(/set local lock_timeout = '3s';/);
  });

  it("delete_order_cascading: amministratore o «Elimina Ordini», e solo le commesse che si vedono", () => {
    const f = corpo("delete_order_cascading");
    expect(f).toContain("public.aziende_con_permesso('can_delete_orders')");
    expect(f).toContain("public.utente_bloccato()");
    expect(f).toContain("public.utente_e_cliente_esterno()");
    expect(f).toContain("public.can_see_order(p_order_id, v_assegnata, v_magazzino)");
    expect(f).toMatch(/USING ERRCODE = '42501'/);
    // Il controllo viene PRIMA di ogni cancellazione.
    expect(f.indexOf("aziende_con_permesso('can_delete_orders')")).toBeLessThan(f.indexOf("DELETE FROM"));
    expect(f.indexOf("can_see_order(")).toBeLessThan(f.indexOf("DELETE FROM"));
  });

  it("orders: la modifica non basta più per cancellare", () => {
    expect(codice).toContain('drop policy if exists "Staff can manage orders if permitted" on public.orders;');
    const insert = codice.match(/create policy "Staff inserisce commesse col permesso" on public\.orders\s+for insert[\s\S]*?\);/);
    const update = codice.match(/create policy "Staff modifica commesse col permesso" on public\.orders\s+for update[\s\S]*?\);\n/);
    const del = codice.match(/create policy "Staff elimina commesse col permesso" on public\.orders\s+for delete[\s\S]*?\);/);
    expect(insert?.[0]).toContain("'can_edit_orders'");
    expect(update?.[0]).toContain("'can_edit_orders'");
    expect(del?.[0]).toContain("'can_delete_orders'");
    expect(del?.[0]).not.toContain("'can_edit_orders'");
    for (const p of [insert, update, del]) expect(p?.[0]).toContain("public.can_see_order(id, assigned_to, destination_warehouse_id)");
    // Nessuna policy staff FOR ALL su orders.
    expect(codice).not.toMatch(/create policy "Staff[^"]*" on public\.orders\s+for all/);
  });

  it("order_events: solo lettura, per le commesse che si vedono", () => {
    expect(codice).toContain("drop policy if exists order_events_company_isolation on public.order_events;");
    const politiche = [...codice.matchAll(/create policy (\S+) on public\.order_events\s+for (\w+)/g)];
    expect(politiche.map((p) => p[2])).toEqual(["select"]);
    expect(codice).toMatch(/exists \(select 1 from public\.orders o where o\.id = order_events\.order_id\)/);
  });

  it("rilascia_numero_documento: «Fatturazione» o commercialista con scrittura; il service role passa", () => {
    const f = corpo("rilascia_numero_documento");
    expect(f).toContain("public.aziende_con_permesso('can_view_billing')");
    expect(f).toContain("public.user_can_write_accountant_company(v_azienda_doc)");
    expect(f).toContain("auth.uid() IS NOT NULL");
    expect(f.indexOf("aziende_con_permesso('can_view_billing')")).toBeLessThan(f.indexOf("DELETE FROM"));
  });

  it("le pulizie del cestino le lancia solo il cron", () => {
    expect(codice).toContain("revoke all on function public.cleanup_cestino_documenti() from public, anon, authenticated;");
    expect(codice).toContain("revoke all on function public.purge_cestino_preventivi() from public, anon, authenticated;");
  });

  it("commessa_salva: il controllo di «Solo i propri» si aggiunge una volta sola, dopo il permesso", () => {
    expect(codice).toContain("perform public.assert_permesso(''can_edit_orders'', ''salvare una commessa'');");
    expect(codice).toContain("public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id)");
    // Rilanciata non la applica due volte.
    expect(codice).toMatch(/if position\('public\.can_see_order\(o\.id, o\.assigned_to, o\.destination_warehouse_id\)' in v_def\) > 0 then\s+return;/);
    expect(codice).toMatch(/if v_volte <> 1 then/);
  });
});

describe("la regola del database è quella del pulsante", () => {
  it("l'app elimina le commesse solo con amministratore o «Elimina Ordini», e passa dalla funzione", () => {
    expect(leggi("src/pages/azienda/OrdersList.tsx")).toMatch(/isAdmin \|\| orderPerms\.canDeleteOrders/);
    expect(leggi("src/pages/azienda/OrderDetail.tsx")).toMatch(/!permissions\.isAdmin && !permissions\.canDeleteOrders/);
    expect(leggi("src/lib/orderUtils.ts")).toContain('rpc("delete_order_cascading"');
  });

  it("la cronologia l'app la legge soltanto", () => {
    const dettaglio = leggi("src/pages/azienda/OrderDetail.tsx");
    expect(dettaglio).toMatch(/from\("order_events"\)\.select\(/);
    expect(dettaglio).not.toMatch(/from\("order_events"\)\.(insert|update|delete|upsert)\(/);
  });
});
