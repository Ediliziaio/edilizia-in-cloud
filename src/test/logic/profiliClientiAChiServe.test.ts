/**
 * Profili dei clienti del portale a chi lavora coi clienti (26/09/2026).
 *
 * Provato in una transazione annullata e poi sul database: un utente interno
 * senza nessun permesso sui clienti leggeva tutti i 358 profili dei clienti
 * della sua azienda (telefono, indirizzo). Dopo: 0, e i 24 colleghi li vede
 * ancora; il dipendente in cantiere vede il cliente delle sue commesse (3 su
 * 3); l'amministratore e chi ha Clienti vedono tutto come prima.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const leggi = (percorso: string) => readFileSync(resolve(process.cwd(), percorso), "utf8");
const codice = leggi("supabase/migrations/20280926054500_profili_clienti_a_chi_serve.sql").replace(/--.*$/gm, "");
const regola = codice.match(/create policy profiles_lettura_authenticated on public\.profiles\s+for select([\s\S]*?\);)\n/)![1];

describe("migrazione profili_clienti_a_chi_serve", () => {
  it("non aspetta i lock", () => {
    expect(codice).toMatch(/set local lock_timeout = '3s';/);
  });

  it("la clausola «stessa azienda» vale solo per i colleghi, non per i clienti", () => {
    expect(regola).toContain("not public.profilo_solo_cliente(id)");
    // Nessun ramo che dia tutti i profili dell'azienda senza altre condizioni.
    expect(regola).not.toMatch(/or \(\(company_id = \(select public\.get_user_company_id\(\(select auth\.uid\(\)\)\)\)\)\s+and not \(select public\.utente_e_cliente_esterno\(\)\)\)\s*\)/);
  });

  it("i clienti li vede chi ha un permesso sui clienti o lavora a una loro commessa", () => {
    for (const permesso of ["can_view_customers", "can_view_orders", "can_view_preventivi", "can_view_marketing_contacts", "can_manage_portal", "can_view_tickets"]) {
      expect(regola, permesso).toContain(`'${permesso}'`);
    }
    expect(regola).toContain("public.cliente_di_una_mia_commessa(id)");
    expect(regola).toContain("(id = (select auth.uid()))");
  });

  it("«lavora a una commessa del cliente» non passa dalla RLS di orders (sarebbe una ricorsione)", () => {
    const funzione = codice.match(/create or replace function public\.cliente_di_una_mia_commessa[\s\S]*?\$function\$([\s\S]*?)\$function\$/)![1];
    expect(codice).toMatch(/create or replace function public\.cliente_di_una_mia_commessa[\s\S]*?security definer/);
    for (const via of ["o.assigned_to = auth.uid()", "public.order_has_employee_for_user(o.id, auth.uid())",
      "public.order_has_salesperson_for_user(o.id, auth.uid())", "public.order_campo_assignments oca"]) {
      expect(funzione, via).toContain(via);
    }
    expect(funzione).toContain("o.company_id = public.get_my_company_id()");
    // La policy non interroga orders direttamente.
    expect(regola).not.toMatch(/from public\.orders/);
  });

  it("le due funzioni non le chiama un anonimo", () => {
    expect(codice).toContain("revoke all on function public.profilo_solo_cliente(uuid) from public, anon;");
    expect(codice).toContain("revoke all on function public.cliente_di_una_mia_commessa(uuid) from public, anon;");
  });
});

describe("il cantiere vede ancora il suo cliente", () => {
  it("il dettaglio del lavoro legge il cliente dalla commessa (embed su profiles)", () => {
    expect(leggi("src/pages/campo/CampoLavoroDetail.tsx")).toContain("customer:profiles!orders_customer_id_fkey(");
  });
});
