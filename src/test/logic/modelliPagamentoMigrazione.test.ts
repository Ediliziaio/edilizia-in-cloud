// src/test/logic/modelliPagamentoMigrazione.test.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20281007170000_modelli_pagamento.sql"), "utf8");
const codice = sql.replace(/--.*$/gm, "");
const funzione = (nome: string) => codice.match(new RegExp(`create or replace function public\\.${nome}\\([\\s\\S]*?\\n\\$\\$;`))![0];
const TABELLE = ["payment_plan_templates", "payment_plan_template_rows", "company_pagamenti_settings"];
const RPC = [
  "salva_modello_pagamento(uuid, jsonb)",
  "elimina_modello_pagamento(uuid, uuid)",
  "inizializza_modelli_pagamento(uuid, jsonb, boolean)",
  "pagamenti_impostazioni_salva(uuid, jsonb)",
];

describe("migrazione modelli_pagamento", () => {
  it("è rilanciabile e non aspetta i lock", () => {
    expect(codice).toMatch(/set local lock_timeout = '3s';/);
    for (const t of TABELLE) {
      expect(codice).toContain(`create table if not exists public.${t}`);
      expect(codice).toContain(`alter table public.${t} enable row level security;`);
    }
  });

  it("le tabelle sono chiuse in scrittura: ai client resta la lettura (più il blocco degli utenti bloccati)", () => {
    expect(codice).toMatch(/revoke all on public\.payment_plan_templates[^;]*from anon, authenticated;/);
    expect(codice).toMatch(/grant select on public\.payment_plan_templates[^;]*to authenticated;/);
    const policy = [...codice.matchAll(/create policy (\w+) on public\.(\w+)\s+(?:as restrictive\s+)?for (\w+) to authenticated/g)];
    expect(policy).toHaveLength(6);
    expect(policy.filter((m) => m[1] !== "blocco_utente_bloccato" && m[3] !== "select")).toEqual([]);
  });

  it("le RPC dei modelli sono SECURITY DEFINER con search_path fisso, chiuse ad anon e aperte ad authenticated", () => {
    for (const f of RPC) {
      expect(codice).toContain(`revoke all on function public.${f} from public, anon;`);
      expect(codice).toContain(`grant execute on function public.${f} to authenticated;`);
    }
    expect(codice).toMatch(/revoke all on function public\.commessa_avvia\(uuid\) from public, anon;/);
    expect(codice).toMatch(/grant execute on function public\.commessa_avvia\(uuid\) to authenticated;/);
  });

  it("il conto delle rate è una funzione interna: nessuno la può chiamare dal browser", () => {
    expect(codice).toContain("revoke all on function public.rate_da_modello(uuid, numeric) from public, anon, authenticated;");
    expect(codice).not.toMatch(/grant execute on function public\.rate_da_modello/);
  });

  it("i modelli si scrivono col permesso delle impostazioni dell'azienda passata", () => {
    for (const f of ["salva_modello_pagamento", "elimina_modello_pagamento", "inizializza_modelli_pagamento", "pagamenti_impostazioni_salva"]) {
      expect(funzione(f)).toMatch(/has_permission_for_company\(auth\.uid\(\), 'can_edit_settings_orders', p_company_id\)/);
    }
  });

  it("un modello vale solo se è un piano vero: percentuali a cento, saldo in fondo, SAL con il suo numero", () => {
    const f = funzione("salva_modello_pagamento");
    expect(f).toMatch(/abs\(v_somma - 100\) > 0\.01/);
    expect(f).toMatch(/v_pos < v_n and v_tipo <> 'deposit'/);
    expect(f).toMatch(/v_pos = v_n and v_tipo <> 'balance'/);
    expect(f).toMatch(/v_numero = any \(v_sal\)/);
    expect(f).toMatch(/v_n > 12/);
    // «stato commessa» dipende da uno stato scelto sulla singola rata: non è tra gli eventi dei modelli
    expect(f).not.toContain("'stato_commessa'");
    expect(codice).toContain("constraint payment_plan_template_rows_sal_numero check (trigger_evento <> 'sal_numero' or trigger_numero is not null)");
  });

  it("un modello non si scrive a metà: tutte le rate si controllano prima di scrivere", () => {
    const f = funzione("salva_modello_pagamento");
    expect(f.indexOf("abs(v_somma - 100) > 0.01")).toBeLessThan(f.indexOf("insert into public.payment_plan_templates"));
  });

  it("il modello di partenza è uno dell'azienda, e se il modello sparisce non resta un puntatore a vuoto", () => {
    expect(funzione("pagamenti_impostazioni_salva")).toMatch(/t\.id = v_modello and t\.company_id = p_company_id/);
    expect(codice).toContain("modello_predefinito uuid references public.payment_plan_templates(id) on delete set null");
  });

  it("le rate da modello sommano sempre al totale: ogni rata al centesimo, l'ultima prende il resto", () => {
    const f = funzione("rate_da_modello");
    expect(f).toMatch(/v_importo := round\(v_totale \* r\.percent \/ 100, 2\);/);
    expect(f).toMatch(/v_importo := greatest\(0, v_resto\);/);
  });

  it("commessa_avvia dà le rate solo a una commessa senza rate e con un importo, con l'IVA (22 se manca)", () => {
    const f = funzione("commessa_avvia");
    expect(f).toMatch(/not exists \(select 1 from public\.order_installments i where i\.order_id = p_order_id\)/);
    expect(f).toContain("round(o.total_amount * (1 + coalesce(o.vat_rate, 22) / 100.0), 2)");
    expect(f).toMatch(/if coalesce\(v_lordo, 0\) > 0 then/);
    expect(f).toContain("v_n_rate := public.order_rate_sostituisci(p_order_id, v_rate);");
    expect(f).toContain("return jsonb_build_object('fasi', v_n_fasi, 'rate', v_n_rate);");
  });

  it("rispetta i guardiani delle migrazioni nuove", () => {
    expect(codice).not.toMatch(/(<>|!=)\s*(public\.)?(get_my_company_id|get_effective_company_id)\(\)/);
    expect(codice).not.toContain("'company_admin'");
  });
});
