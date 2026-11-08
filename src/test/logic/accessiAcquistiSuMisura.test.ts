import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20290109100000_accessi_acquisti_su_misura.sql"),
  "utf8",
);

describe("accessi acquisti su misura: i punti che contano", () => {
  it("la riga dell'ordine resta nell'azienda dell'ordine e della commessa", () => {
    expect(sql).toMatch(/purchase_order_items_stessa_azienda\(\)[\s\S]*security definer/);
    expect(sql).toMatch(/po\.id = new\.purchase_order_id and po\.company_id = new\.company_id/);
    expect(sql).toMatch(/oi\.id = new\.order_item_id and o\.company_id = new\.company_id/);
    // Il nome sta prima degli altri trigger BEFORE: nessun messaggio dice il nome della riga altrui.
    expect(sql).toMatch(/create trigger a_poi_stessa_azienda\s+before insert or update of company_id, purchase_order_id, order_item_id/);
  });

  it("riordino e «Ordina comunque» non si scrivono dal browser, le funzioni sì", () => {
    expect(sql).toMatch(/create trigger a_poi_riordino_protetto\s+before insert or update of riordino_motivo/);
    expect(sql).toMatch(/current_user = 'authenticated'\s+and new\.riordino_motivo is distinct from/);
    expect(sql).toMatch(/if current_user <> 'authenticated' then\s+return new;/);
    for (const colonna of ["motivo", "il", "da", "righe"]) {
      expect(sql).toContain(`new.ordina_comunque_${colonna} is distinct from old.ordina_comunque_${colonna}`);
    }
    // I trigger che guardano current_user non possono essere DEFINER: vedrebbero sempre il proprietario.
    for (const nome of ["purchase_order_items_riordino_protetto", "purchase_orders_campi_protetti"]) {
      const corpo = sql.slice(sql.indexOf(`function public.${nome}()`), sql.indexOf("$$;", sql.indexOf(`function public.${nome}()`)));
      expect(corpo).not.toMatch(/security definer/i);
    }
  });

  it("lo stato dell'ordine cambia solo con un permesso di lavoro", () => {
    expect(sql).toMatch(/new\.status is distinct from old\.status and not exists/);
    expect(sql).toContain("'can_edit_warehouse'");
    expect(sql).toContain("'can_manage_purchasing'");
    expect(sql).not.toMatch(/array\['can_manage_purchasing', 'can_edit_orders', 'can_approve_orders',\s+'can_view_orders'/);
  });

  it("i costi dello storico e di misure_conferma restano a chi li può vedere", () => {
    expect(sql).toContain("revoke select on public.order_item_misure_storico from authenticated");
    const grant = sql.slice(sql.indexOf("grant select (id, company_id"), sql.indexOf("to authenticated;", sql.indexOf("grant select (id, company_id")));
    expect(grant).not.toMatch(/\bdati\b/);
    expect(sql).toMatch(/materiali_puo\('can_view_orders', company_id\)\);/);
    expect(sql).toMatch(/'can_view_costs', v_azienda\) is not true[\s\S]*e - 'costo_prima' - 'costo_dopo'/);
  });

  it("le funzioni guardano permesso e azienda giusti", () => {
    expect(sql).toMatch(/has_permission_for_company\(v_attore, 'can_edit_orders', v_company\) is not true/);
    expect(sql).toMatch(/v_order is null and not \(public\.materiali_puo\('can_view_orders', v_company\)/);
    expect(sql).toContain("(d.purchase_order_id = po.id or d.purchase_order_id is null))");
    expect(sql).toMatch(/array\['can_view_sopralluoghi', 'can_edit_orders', 'can_validate_bom'\]/);
    expect(sql.match(/or not \(public\.materiali_puo\('can_view_orders', azienda\)/g)).toHaveLength(2);
    expect(sql).toMatch(/array\['can_view_orders', 'can_edit_orders', 'can_view_warehouse',\s+'can_edit_warehouse', 'can_manage_purchasing'\]/);
  });

  it("le funzioni di trigger non restano eseguibili", () => {
    for (const nome of ["purchase_order_items_stessa_azienda", "purchase_order_items_riordino_protetto", "purchase_orders_campi_protetti"]) {
      expect(sql).toContain(`revoke all on function public.${nome}() from public, anon, authenticated`);
    }
  });
});
