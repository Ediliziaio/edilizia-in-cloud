/**
 * Scadenze e incassi col permesso della finanza (25/09/2026).
 *
 * Provato in una transazione annullata e poi sul database: uno staff senza
 * nessun permesso di finanza leggeva 310 scadenze (2.223 in un'altra azienda),
 * ne creava, le modificava, le segnava pagate (con la prima nota) e leggeva il
 * riepilogo dello scadenzario. Dopo: niente di tutto questo; chi ha lo
 * Scadenzario e l'amministratore come prima.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const leggi = (percorso: string) => readFileSync(resolve(process.cwd(), percorso), "utf8");
const sql = leggi("supabase/migrations/20280926044500_scadenze_e_incassi_col_permesso.sql");
const codice = sql.replace(/--.*$/gm, "");

const policy = (nome: string) => {
  const m = codice.match(new RegExp(`create policy ${nome} on public\\.scadenze\\s+for (\\w+)([\\s\\S]*?\\);)\\n`));
  expect(m, nome).not.toBeNull();
  return { comando: m![1], testo: m![2] };
};

const SCRITTURA = ["can_view_billing", "can_view_scadenzario", "can_view_tesoreria", "can_manage_payments", "can_edit_tickets", "can_edit_settings_suppliers"];

describe("migrazione scadenze_e_incassi_col_permesso", () => {
  it("non aspetta i lock e toglie le regole «stessa azienda»", () => {
    expect(codice).toMatch(/set local lock_timeout = '3s';/);
    for (const vecchia of ["scadenze_lettura_authenticated", "scadenze_tenant_insert", "scadenze_tenant_update", "scadenze_tenant_delete"]) {
      expect(codice).toContain(`drop policy if exists ${vecchia} on public.scadenze;`);
    }
  });

  it("si leggono con un permesso di finanza (o col commercialista), mai da un cliente", () => {
    const p = policy("scadenze_lettura");
    expect(p.comando).toBe("select");
    expect(p.testo).toContain("public.user_can_read_accountant_company(company_id)");
    expect(p.testo).toContain("not (select public.utente_e_cliente_esterno())");
    // Chi modifica i ticket li vede sempre (permessi_modifica_segue_visibilita):
    // in lettura basta can_view_tickets.
    for (const permesso of [...SCRITTURA.filter((x) => x !== "can_edit_tickets"), "can_view_prima_nota", "can_view_forecast", "can_view_cruscotto", "can_view_tickets"]) {
      expect(p.testo, permesso).toContain(`'${permesso}'`);
    }
  });

  it.each([
    ["scadenze_inserimento", "insert", 1],
    ["scadenze_modifica", "update", 2],
  ] as const)("%s: solo con un permesso di scrittura della finanza", (nome, comando, volte) => {
    const p = policy(nome);
    expect(p.comando).toBe(comando);
    expect(p.testo.match(/public\.aziende_con_uno_dei_permessi\(/g) ?? []).toHaveLength(volte);
    for (const permesso of SCRITTURA) expect(p.testo, permesso).toContain(`'${permesso}'`);
    expect(p.testo).not.toContain("'can_view_prima_nota'");
  });

  it("cancellare resta a Fatturazione, Scadenzario, Tesoreria e Pagamenti", () => {
    const p = policy("scadenze_cancellazione");
    expect(p.comando).toBe("delete");
    expect(p.testo).not.toContain("'can_edit_tickets'");
    expect(p.testo).toContain("'can_view_scadenzario'");
  });

  it("chi può vedere e gestire: niente clienti né bloccati; nessuno le esegue da anonimo", () => {
    for (const funzione of ["puo_vedere_scadenze", "puo_gestire_scadenze"]) {
      const corpo = codice.match(new RegExp(`create or replace function public\\.${funzione}[\\s\\S]*?\\$function\\$([\\s\\S]*?)\\$function\\$`))![1];
      expect(corpo, funzione).toContain("auth.uid() is not null");
      expect(corpo, funzione).toContain("not public.utente_bloccato()");
      expect(corpo, funzione).toContain("not public.utente_e_cliente_esterno()");
      expect(codice).toContain(`revoke all on function public.${funzione}(uuid) from public, anon;`);
    }
  });

  it("le cinque funzioni di scadenze e incassi ricevono il controllo (il servizio senza utente passa)", () => {
    const chiamate = [...codice.matchAll(/select pg_temp\.aggiungi_controllo\(\s*'([^']+)', '([^']+)'/g)].map((m) => `${m[1]} ${m[2]}`);
    expect(chiamate.sort()).toEqual([
      "public.email_scadenza_conferma(uuid) puo_gestire_scadenze(",
      "public.get_scadenzario_summary(uuid,date,date) puo_vedere_scadenze(",
      "public.mark_scadenza_paid(uuid,numeric,text,date,text,text) puo_gestire_scadenze(",
      "public.registra_incasso_atomico(uuid,uuid,numeric,text,date,text,text) puo_gestire_scadenze(",
      "public.storna_incasso_atomico(uuid,uuid) puo_gestire_scadenze(",
    ]);
    expect(codice.match(/auth\.uid\(\) (is|IS) not null and not public\.puo_(vedere|gestire)_scadenze/gi) ?? []).toHaveLength(5);
    expect(codice).toMatch(/if v_volte <> 1 then/);
  });
});

describe("nella casella email la stessa regola", () => {
  it("«Aggiungi a scadenzario» lo vede solo chi può scrivere scadenze", () => {
    const pannello = leggi("src/components/email-ai/DocumentoEstrattoPanel.tsx");
    expect(pannello).toContain("const puoScadenzario = p.canViewScadenzario || p.canViewBilling || p.canViewTesoreria || p.canManagePayments;");
    expect(pannello).toContain("if (!puoScadenzario || visibili.length === 0) return null;");
  });
});
