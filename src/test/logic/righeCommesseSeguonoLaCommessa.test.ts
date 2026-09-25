/**
 * Le righe delle commesse seguono la commessa (25/09/2026).
 *
 * Provato in una transazione annullata e poi sul database: uno staff con
 * «Solo i propri» che non vede nessuna commessa leggeva 164 voci, 66 righe di
 * squadra, 23 fasi e 17 righe di storico di tutta l'azienda, e modificava voci
 * di commesse non sue. Dopo: zero; staff senza restrizioni e amministratore
 * vedono come prima.
 *
 * Tiene ferme le due regole: la riga si legge se si vede la commessa, si
 * modifica se la commessa è tra le proprie (can_see_order). E che has_permission
 * non si apra in questa migrazione (aprirebbe troppo ai subappaltatori).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20280926023000_righe_commesse_seguono_la_commessa.sql"),
  "utf8",
);
// Le istruzioni, senza i commenti (che raccontano anche com'era prima).
const codice = sql.replace(/--.*$/gm, "");

type Policy = { tabella: string; nome: string; comando: string; testo: string };
const policy: Policy[] = [
  ...codice.matchAll(/create policy ("[^"]+"|\S+) on public\.(\w+)\s+for (\w+)([\s\S]*?\);)\n/g),
].map(([, nome, tabella, comando, testo]) => ({ tabella, nome: nome.replace(/"/g, ""), comando, testo }));

const FIGLIE = [
  "order_items", "order_attachments", "order_commission_ledger", "order_employees", "order_errors",
  "order_salespeople", "order_status_history", "order_variable_compensations", "order_work_phases",
];

describe("migrazione righe_commesse_seguono_la_commessa", () => {
  it("non aspetta i lock e si può rilanciare", () => {
    expect(codice).toMatch(/set local lock_timeout = '3s';/);
    for (const p of policy) {
      expect(codice, p.nome).toContain(`drop policy if exists ${/\s/.test(p.nome) ? `"${p.nome}"` : p.nome} on public.${p.tabella};`);
    }
  });

  it("riscrive 13 policy sulle 9 tabelle figlie della commessa", () => {
    expect(policy).toHaveLength(13);
    expect([...new Set(policy.map((p) => p.tabella))].sort()).toEqual([...FIGLIE].sort());
  });

  it("ogni policy dello staff lega la riga alla sua commessa", () => {
    for (const p of policy) {
      expect(p.testo, `${p.tabella} / ${p.nome}`).toContain(`from public.orders o where o.id = ${p.tabella}.order_id`);
    }
  });

  it("chi modifica deve avere la commessa tra le sue (can_see_order), in USING e in WITH CHECK", () => {
    const scritture = policy.filter((p) => p.comando === "all");
    expect(scritture.map((p) => p.tabella).sort()).toEqual(
      ["order_attachments", "order_items", "order_variable_compensations", "order_work_phases"],
    );
    for (const p of scritture) {
      expect(p.testo, p.nome).toContain("'can_edit_orders'");
      expect(p.testo.match(/public\.can_see_order\(o\.id, o\.assigned_to, o\.destination_warehouse_id\)/g), p.nome).toHaveLength(2);
      expect(p.testo, p.nome).toMatch(/with check \(/);
    }
  });

  it("has_permission resta com'è", () => {
    expect(codice).not.toMatch(/create or replace function public\.has_permission/);
  });
});
