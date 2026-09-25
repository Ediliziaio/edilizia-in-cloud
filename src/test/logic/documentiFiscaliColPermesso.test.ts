/**
 * Documenti fiscali col permesso (25/09/2026).
 *
 * Provato in una transazione annullata e poi sul database: un venditore
 * creava fatture con documento_crea, e uno staff senza «Fatturazione» vedeva
 * tutti i 40 documenti della sua azienda e ne modificava le bozze. Dopo: il
 * venditore riceve 42501, lo staff vede i 3 che gli servono (DDT e documenti
 * delle sue commesse) e non modifica niente; amministratore e staff con
 * «Fatturazione» come prima.
 *
 * Tiene ferma anche la stessa regola nell'app: nella commessa i pulsanti per
 * fattura, proforma e nota di credito li vede solo chi ha «Fatturazione».
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const leggi = (percorso: string) => readFileSync(resolve(process.cwd(), percorso), "utf8");
const sql = leggi("supabase/migrations/20280926041500_documenti_fiscali_col_permesso.sql");
const codice = sql.replace(/--.*$/gm, "");

const policy = (tabella: string, nome: string) => {
  const m = codice.match(new RegExp(`create policy ${nome} on public\\.${tabella}\\s+for (\\w+)([\\s\\S]*?\\);)\\n`));
  expect(m, `${tabella} / ${nome}`).not.toBeNull();
  return { comando: m![1], testo: m![2] };
};

describe("migrazione documenti_fiscali_col_permesso", () => {
  it("non aspetta i lock e toglie la regola «stessa azienda»", () => {
    expect(codice).toMatch(/set local lock_timeout = '3s';/);
    expect(codice).toContain("drop policy if exists company_isolation on public.documenti_fiscali;");
  });

  it("chi può gestire: Fatturazione, commercialista con scrittura, per i DDT magazzino o commesse; mai un cliente", () => {
    const f = codice.match(/create or replace function public\.puo_gestire_documento_fiscale[\s\S]*?\$function\$([\s\S]*?)\$function\$/)![1];
    expect(f).toContain("auth.uid() is not null");
    expect(f).toContain("not public.utente_bloccato()");
    expect(f).toContain("not public.utente_e_cliente_esterno()");
    expect(f).toContain("public.aziende_con_permesso('can_view_billing')");
    expect(f).toContain("public.user_can_write_accountant_company(_company_id)");
    expect(f).toMatch(/_tipo = 'ddt'\s+and \(_company_id = any \(public\.aziende_con_permesso\('can_view_warehouse'\)\)/);
    expect(codice).toContain("revoke all on function public.puo_gestire_documento_fiscale(uuid, text) from public, anon;");
    expect(codice).toContain("revoke all on function public.aziende_con_uno_dei_permessi(text[]) from public, anon;");
  });

  it("documenti_fiscali: si scrive solo con puo_gestire_documento_fiscale (la modifica in USING e in WITH CHECK)", () => {
    for (const [nome, comando, volte] of [
      ["documenti_fiscali_inserimento", "insert", 1],
      ["documenti_fiscali_modifica", "update", 2],
      ["documenti_fiscali_cancellazione", "delete", 1],
    ] as const) {
      const p = policy("documenti_fiscali", nome);
      expect(p.comando).toBe(comando);
      expect(p.testo.match(/public\.puo_gestire_documento_fiscale\(company_id, tipo\)/g) ?? [], nome).toHaveLength(volte);
    }
  });

  it("documenti_fiscali: si legge con un permesso di finanza, i DDT col magazzino, il resto dalla commessa", () => {
    const p = policy("documenti_fiscali", "documenti_fiscali_lettura");
    expect(p.comando).toBe("select");
    expect(p.testo).toContain("not (select public.utente_e_cliente_esterno())");
    expect(p.testo).toContain("'can_view_billing'");
    expect(p.testo).toMatch(/tipo = 'ddt'\s+and company_id in/);
    expect(p.testo).toContain("exists (select 1 from public.orders o where o.id = documenti_fiscali.ordine_id)");
    expect(p.testo).toContain("public.aziende_con_permesso('can_view_order_amounts')");
  });

  it("fattura_ordine: niente «stessa azienda» e nessun giro verso documenti_fiscali (sarebbe una ricorsione)", () => {
    for (const vecchia of ["fattura_ordine_delete", "fattura_ordine_insert", "fattura_ordine_lettura_authenticated", "fo_del", "fo_ins", "fo_upd"]) {
      expect(codice).toContain(`drop policy if exists ${vecchia} on public.fattura_ordine;`);
    }
    const lettura = policy("fattura_ordine", "fattura_ordine_lettura").testo;
    const scrittura = policy("fattura_ordine", "fattura_ordine_scrittura").testo;
    expect(lettura).not.toContain("documenti_fiscali");
    expect(scrittura).not.toContain("documenti_fiscali");
    expect(scrittura).toContain("public.puo_gestire_documento_fiscale(company_id, 'fattura')");
  });

  it("le sei funzioni che scrivono documenti fiscali ricevono il controllo, una volta sola", () => {
    const chiamate = [...codice.matchAll(/select pg_temp\.aggiungi_controllo\(\s*'([^']+)'/g)].map((m) => m[1]);
    expect(chiamate.sort()).toEqual([
      "public.claim_documento_per_invio(uuid)",
      "public.collega_rata_fattura(uuid,uuid)",
      "public.create_ddt_from_uscita(uuid,jsonb)",
      "public.documento_crea(uuid,jsonb)",
      "public.documento_emetti(uuid)",
      "public.documento_fiscale_aggiorna(uuid,jsonb)",
    ]);
    expect(codice).toMatch(/if position\('puo_gestire_documento_fiscale\(' in v_def\) > 0 then\s+return;/);
    expect(codice).toMatch(/if v_volte <> 1 then/);
    // Lo SDI lo chiama il servizio senza utente: per lui non cambia niente.
    expect(codice).toContain("IF auth.uid() IS NOT NULL");
  });
});

describe("nella commessa la stessa regola", () => {
  const pagina = leggi("src/pages/azienda/OrderDetail.tsx");

  it("fattura, proforma e nota di credito solo con «Fatturazione»; il DDT anche con commesse o magazzino", () => {
    const scheda = pagina.slice(pagina.indexOf("Fatturazione e Documenti"), pagina.indexOf('<TabsContent value="cantiere"'));
    expect(scheda.match(/\{permissions\.canViewBilling && \(/g) ?? []).toHaveLength(3);
    expect(scheda).toContain("{(permissions.canViewBilling || permissions.canEditOrders || permissions.canViewWarehouse) && (");
    for (const azione of ["setCreaFatturaOpen(true)", "setCreaProformaOpen(true)", "setCreaNotaCreditoOpen(true)", "setCreaDDTOpen(true)"]) {
      expect(scheda).toContain(azione);
    }
  });

  it("la scheda la vede chi vede gli importi della commessa o ha «Fatturazione»", () => {
    expect(pagina).toContain("{(permissions.canViewOrderAmounts || permissions.canViewBilling) && (\n            <QuoteCard");
  });
});
