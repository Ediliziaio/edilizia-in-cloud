// src/test/logic/nuovaCommessaMigrazione.test.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20281007160000_nuova_commessa.sql"), "utf8");
const codice = sql.replace(/--.*$/gm, "");
const funzione = (nome: string) => codice.match(new RegExp(`create or replace function public\\.${nome}\\([\\s\\S]*?\\n\\$\\$;`))![0];

describe("migrazione nuova_commessa", () => {
  it("è rilanciabile, non aspetta i lock e non cambia nessun dato", () => {
    expect(codice).toMatch(/set local lock_timeout = '3s';/);
    expect(codice).toContain("add column if not exists modello_fasi_predefinito uuid references public.work_phase_templates(id) on delete set null");
    expect(codice).toContain("add column if not exists controlli_avvio text[] not null default array['indirizzo', 'date', 'fasi', 'chi', 'pagamenti']::text[]");
    // Applicarla non scrive nessun dato: update, delete e insert stanno solo dentro le funzioni.
    expect(codice.replace(/\$\$[\s\S]*?\$\$/g, "")).not.toMatch(/\b(update\s+public\.|delete\s+from|insert\s+into)\b/i);
  });

  it("i controlli ammessi sono cinque, e il vincolo si crea una volta sola", () => {
    expect(codice).toMatch(/if not exists \(select 1 from pg_constraint where conname = 'company_fasi_settings_controlli_avvio_check'\)/);
    expect(codice).toContain("check (controlli_avvio <@ array['indirizzo', 'date', 'fasi', 'chi', 'pagamenti']::text[])");
  });

  it("fasi_impostazioni_salva tiene le regole di prima e aggiunge le due nuove, col permesso delle impostazioni", () => {
    const f = funzione("fasi_impostazioni_salva");
    expect(f).toContain("'can_edit_settings_orders'");
    for (const chiave of ["chi_spunta", "peso_media", "modello_fasi_predefinito", "controlli_avvio"]) expect(f).toContain(`p_valori ? '${chiave}'`);
    // il peso nella media ricalcola le commesse dell'azienda, come nella versione di prima
    expect(f).toContain("perform public.recompute_order_progress(o.order_id)");
    // un modello di un'altra azienda non si può scegliere; un controllo sconosciuto non passa
    expect(f).toMatch(/t\.id = v_modello and t\.company_id = p_company_id/);
    expect(f).toMatch(/errcode = 'P0002'/);
    expect(f).toMatch(/x <> all \(v_ammessi\)/);
    expect(f).toMatch(/errcode = '22023'/);
    // l'ordine è sempre quello della lista, senza doppioni
    expect(f).toMatch(/array_agg\(c order by array_position\(v_ammessi, c\)\)/);
    expect(f).toMatch(/select distinct x as c/);
  });

  it("aggiungi_fasi_commessa porta il venduto di ogni fase, solo a chi vede gli importi di vendita", () => {
    const f = funzione("aggiungi_fasi_commessa");
    expect(f).toMatch(/v_azienda uuid := public\.get_order_company_id\(p_order_id\);/);
    expect(f).toMatch(/has_permission_for_company\(auth\.uid\(\), 'can_edit_orders', v_azienda\)/);
    expect(f).toMatch(/has_permission_for_company\(auth\.uid\(\), 'can_view_order_amounts', v_azienda\)/);
    expect(f).toMatch(/greatest\(0, round\(\(v_fase->>'venduto'\)::numeric, 2\)\)/);
    expect(f).not.toMatch(/has_permission\(/);
    // una fase senza «venduto» non ne scrive uno: nessun permesso richiesto per quello
    expect(f).toMatch(/if nullif\(v_fase->>'venduto', ''\) is not null then/);
  });

  it("commessa_avvia: permesso dell'azienda della COMMESSA, fasi solo se la commessa non ne ha, esito in json", () => {
    const f = funzione("commessa_avvia");
    expect(f).toMatch(/security definer\s+set search_path = public/);
    expect(f).toMatch(/v_azienda uuid := public\.get_order_company_id\(p_order_id\);/);
    expect(f).toMatch(/has_permission_for_company\(auth\.uid\(\), 'can_edit_orders', v_azienda\)/);
    expect(f).toMatch(/not exists \(select 1 from public\.order_work_phases f where f\.order_id = p_order_id\)/);
    expect(f).toContain("return jsonb_build_object('fasi', v_n_fasi);");
  });

  it("le funzioni nuove sono chiuse ad anon e aperte ad authenticated", () => {
    for (const f of ["fasi_impostazioni_salva(uuid, jsonb)", "aggiungi_fasi_commessa(uuid, jsonb)", "commessa_avvia(uuid)"]) {
      expect(codice).toContain(`revoke all on function public.${f} from public, anon;`);
      expect(codice).toContain(`grant execute on function public.${f} to authenticated;`);
    }
  });

  it("rispetta i guardiani delle migrazioni nuove", () => {
    expect(codice).not.toMatch(/(<>|!=)\s*(public\.)?(get_my_company_id|get_effective_company_id)\(\)/);
    expect(codice).not.toContain("'company_admin'");
  });
});
