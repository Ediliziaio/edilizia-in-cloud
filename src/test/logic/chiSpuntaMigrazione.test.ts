// src/test/logic/chiSpuntaMigrazione.test.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20281007143000_chi_spunta_sottofasi.sql"), "utf8");
const codice = sql.replace(/--.*$/gm, "");
const funzione = (nome: string) => codice.match(new RegExp(`create or replace function public\\.${nome}\\([\\s\\S]*?\\n\\$\\$;`))![0];

describe("migrazione chi_spunta_sottofasi", () => {
  it("non aspetta i lock, e di partenza non cambia niente: il default è «tutti»", () => {
    expect(codice).toMatch(/set local lock_timeout = '3s';/);
    expect(codice).toMatch(/add column if not exists chi_spunta text not null default 'tutti'\s+check \(chi_spunta in \('tutti', 'chi_la_fa', 'capi'\)\);/);
  });

  it("la regola si salva con una RPC: permesso delle impostazioni, solo valori noti", () => {
    const f = funzione("fasi_impostazioni_salva");
    expect(f).toContain("'can_edit_settings_orders'");
    expect(f).toMatch(/not in \('tutti', 'chi_la_fa', 'capi'\)/);
    expect(f).toMatch(/errcode = '22023'/);
    expect(codice).toContain("revoke all on function public.fasi_impostazioni_salva(uuid, jsonb) from public, anon;");
    expect(codice).toContain("grant execute on function public.fasi_impostazioni_salva(uuid, jsonb) to authenticated;");
  });

  it("la regola la legge una funzione del proprietario: la guardia gira con i diritti di chi spunta e non vede le impostazioni", () => {
    expect(funzione("fasi_regola_chi_spunta")).toMatch(/security definer\s+set search_path = public/);
    expect(codice).toContain("revoke all on function public.fasi_regola_chi_spunta(uuid) from public, anon;");
    expect(codice).toContain("grant execute on function public.fasi_regola_chi_spunta(uuid) to authenticated;");
  });

  it("la guardia resta a diritti di chi chiama e non ha EXECUTE per nessuno (la usa solo il trigger)", () => {
    const g = funzione("sottofase_guardia");
    expect(g).not.toMatch(/security definer/);
    expect(g).toMatch(/set search_path = ''/);
    expect(codice).toContain("revoke all on function public.sottofase_guardia() from public, anon, authenticated;");
  });

  it("l'ufficio spunta sempre, prima della regola; la regola tocca solo il cambio di «fatta»", () => {
    const g = funzione("sottofase_guardia");
    const ufficio = g.indexOf("has_permission_for_company(v_utente, 'can_edit_orders', v_azienda)");
    const regola = g.indexOf("fasi_regola_chi_spunta(v_azienda)");
    expect(ufficio).toBeGreaterThan(-1);
    expect(regola).toBeGreaterThan(ufficio);
    expect(g).toMatch(/if new\.fatta is distinct from old\.fatta then\s+v_regola := /);
  });

  it("le tre regole, con le frasi che l'operaio leggerà", () => {
    const g = funzione("sottofase_guardia");
    expect(g).toContain("campo_mio_ruolo(v_commessa)");
    expect(g).toContain("campo_mie_fasi(v_commessa)");
    expect(g).toContain("Le sottofasi le spunta il capocantiere.");
    expect(g).toContain("Le sottofasi le spunta chi fa quella fase, o il capocantiere.");
  });

  it("rispetta i guardiani delle migrazioni nuove", () => {
    expect(codice).not.toMatch(/(<>|!=)\s*(public\.)?(get_my_company_id|get_effective_company_id)\(\)/);
    expect(codice).not.toContain("'company_admin'");
  });
});
