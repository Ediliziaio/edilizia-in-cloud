// src/test/logic/pesoMediaMigrazione.test.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20281007150000_peso_media_avanzamento.sql"), "utf8");
const codice = sql.replace(/--.*$/gm, "");
const funzione = (nome: string) => codice.match(new RegExp(`create or replace function public\\.${nome}\\([\\s\\S]*?\\n\\$\\$;`))![0];

describe("migrazione peso_media_avanzamento", () => {
  it("non aspetta i lock, e di partenza non cambia niente: il default è «uguale»", () => {
    expect(codice).toMatch(/set local lock_timeout = '3s';/);
    expect(codice).toMatch(/add column if not exists peso_media text not null default 'uguale'\s+check \(peso_media in \('uguale', 'durata', 'venduto'\)\);/);
  });

  it("la media alla pari è quella di sempre, ed è il ripiego quando manca un dato", () => {
    const f = funzione("recompute_order_progress");
    expect(f).toMatch(/else round\(avg\(f\.pct\)\)/);
    expect(f).toMatch(/v_peso = 'durata' and n\.con_giorni = n\.tot/);
    expect(f).toMatch(/v_peso = 'venduto' and n\.con_venduto = n\.tot/);
    expect(f).toMatch(/when status = 'completata' then 100/);
  });

  it("senza fasi non scrive niente, e scrive solo se il valore cambia", () => {
    const f = funzione("recompute_order_progress");
    expect(f).toMatch(/if v_pct is null then\s+return;/);
    expect(f).toMatch(/coalesce\(percentuale_avanzamento, -1\) <> v_pct/);
  });

  it("la funzione tiene i privilegi di oggi: la migrazione non li tocca", () => {
    expect(funzione("recompute_order_progress")).toMatch(/security definer\s+set search_path = public/);
    expect(codice).not.toMatch(/(grant|revoke)[^;]*recompute_order_progress/i);
  });

  it("il rollup scatta anche cambiando date e venduto; è l'unico ritocco a order_work_phases", () => {
    expect(codice).toMatch(/after insert or delete or update of percentuale, status, start_date, end_date, importo_venduto\s+on public\.order_work_phases\s+for each row execute function public\.trg_owp_recompute_order_progress\(\);/);
    expect(codice).not.toMatch(/alter table public\.order_work_phases/i);
  });

  it("la RPC delle impostazioni accetta anche il peso, tiene la regola di chi spunta e riallinea le commesse", () => {
    const f = funzione("fasi_impostazioni_salva");
    expect(f).toContain("'can_edit_settings_orders'");
    expect(f).toMatch(/p_valori \? 'chi_spunta'/);
    expect(f).toMatch(/not in \('uguale', 'durata', 'venduto'\)/);
    expect(f).toMatch(/perform public\.recompute_order_progress\(o\.order_id\)/);
    expect(codice).toContain("grant execute on function public.fasi_impostazioni_salva(uuid, jsonb) to authenticated;");
  });

  it("rispetta i guardiani delle migrazioni nuove", () => {
    expect(codice).not.toMatch(/(<>|!=)\s*(public\.)?(get_my_company_id|get_effective_company_id)\(\)/);
    expect(codice).not.toContain("'company_admin'");
  });
});
