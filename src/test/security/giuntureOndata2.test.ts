/**
 * Ondata 2 — le giunture lato server.
 *   2.2  i costi di un intervento arrivano al margine di commessa
 *   2.3  le azioni di stato chiedono il permesso, non solo l'azienda
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const DIR = resolve(__dirname, "../../../supabase/migrations");
const migrazione = (frammento: string): string => {
  const nome = readdirSync(DIR).find((f) => f.includes(frammento));
  if (!nome) throw new Error(`migrazione non trovata: ${frammento}`);
  return readFileSync(resolve(DIR, nome), "utf8");
};

const costi    = migrazione("costi_ticket_nel_margine");
const permessi = migrazione("permesso_su_conversione_e_stati");

describe("2.2 · i costi dell'intervento entrano nel margine", () => {
  it("il costo comprende materiali, trasferta e manodopera", () => {
    expect(costi).toMatch(/coalesce\(NEW\.costo_materiale, 0\)/);
    expect(costi).toMatch(/coalesce\(NEW\.costo_trasferta, 0\)/);
    expect(costi).toMatch(/v_ore \* coalesce\(NEW\.costo_orario_applicato, 0\)/);
  });

  it("le ore preventivate fanno da ripiego a quelle effettive", () => {
    // un intervento chiuso senza consuntivo ore non deve valere zero manodopera
    expect(costi).toMatch(/coalesce\(NEW\.ore_effettive, NEW\.durata_ore, 0\)/);
  });

  it("una sola riga di costo per ticket, altrimenti il margine crolla due volte", () => {
    expect(costi).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS ux_company_costs_ticket/);
    expect(costi).toMatch(/ON CONFLICT \(ticket_id\) WHERE ticket_id IS NOT NULL DO UPDATE SET/);
  });

  it("staccare il ticket dalla commessa toglie il costo, non lo lascia lì", () => {
    expect(costi).toMatch(/IF NEW\.order_id IS NULL OR v_totale <= 0 THEN\s+DELETE FROM public\.company_costs WHERE ticket_id = NEW\.id;/);
  });

  it("il costo è variabile e legato alla commessa: così la vista lo somma", () => {
    // v_ordine_marginalita somma company_costs con order_id e senza purchase_order_id
    expect(costi).toMatch(/'variable'/);
    expect(costi).toMatch(/order_id, ticket_id/);
    // purchase_order_id compare solo nel commento che spiega la vista: il
    // costo generato NON deve averlo, altrimenti la vista lo escluderebbe
    const corpo = costi.split("FUNCTION public.sincronizza_costo_da_ticket()")[1];
    expect(corpo).not.toMatch(/purchase_order_id/);
  });

  it("lo storico entra subito, senza aspettare la prossima modifica", () => {
    expect(costi).toMatch(/INSERT INTO public\.company_costs[\s\S]*FROM public\.tickets t/);
    expect(costi).toMatch(/ON CONFLICT \(ticket_id\) WHERE ticket_id IS NOT NULL DO NOTHING/);
  });

  it("il trigger scatta su ogni campo che cambia il costo", () => {
    for (const campo of ["order_id", "costo_materiale", "costo_trasferta",
                         "costo_orario_applicato", "ore_effettive", "durata_ore"]) {
      expect(costi, `il trigger non ascolta ${campo}`).toContain(campo);
    }
  });
});

describe("2.3 · il permesso, non solo l'azienda", () => {
  it("create_order_atomic non prende più l'identità dal parametro", () => {
    // era COALESCE(p_user_id, auth.uid()): bastava passare l'uuid di un
    // super_admin per superare il controllo di autorizzazione
    expect(permessi).toMatch(/'v_caller_id  := COALESCE\(auth\.uid\(\), p_user_id\);'/);
    expect(permessi).toMatch(/elevazione di privilegi/);
  });

  it("le tre azioni chiedono can_edit_orders", () => {
    expect(permessi).toMatch(/creare una commessa/);
    expect(permessi).toMatch(/cambiare stato a una commessa/);
    expect(permessi).toMatch(/convertire un preventivo in commessa/);
  });

  it("se non ne corregge tre, la migrazione si ferma", () => {
    expect(permessi).toMatch(/attese 3 funzioni corrette/);
  });

  it("senza sessione non si passa, col service role sì", () => {
    const g = permessi.split("FUNCTION public.assert_permesso(")[1];
    expect(g).toMatch(/v_uid IS NULL AND public\.ai_is_service_role\(\) THEN RETURN/);
    expect(g).toMatch(/Accesso negato: serve una sessione/);
  });

  it("l'attore del cambio stato non lo decide più il client", () => {
    expect(permessi).toMatch(/'WHERE id = COALESCE\(auth\.uid\(\), p_changed_by\);'/);
  });

  it("il messaggio usa % e non %s, che lascerebbe la lettera attaccata", () => {
    expect(permessi).toMatch(/serve "%"', p_azione, p_permesso/);
    expect(permessi).not.toMatch(/serve "%s"/);
  });
});
