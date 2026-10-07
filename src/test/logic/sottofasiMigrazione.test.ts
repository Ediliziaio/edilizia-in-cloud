// src/test/logic/sottofasiMigrazione.test.ts
/**
 * Sottofasi della commessa (07/10/2026): cosa tiene ferma la migrazione.
 * Il comportamento vero si prova sul database (Task 3); qui si impedisce che
 * un ritocco al file tolga una protezione senza che nessuno se ne accorga.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20281007130000_sottofasi_commessa.sql"), "utf8");
const codice = sql.replace(/--.*$/gm, "");
const funzione = (nome: string) => codice.match(new RegExp(`create or replace function public\\.${nome}\\([\\s\\S]*?\\n\\$\\$;`))![0];

describe("migrazione sottofasi_commessa", () => {
  it("è rilanciabile e non aspetta i lock", () => {
    expect(codice).toMatch(/set local lock_timeout = '3s';/);
    expect(codice).toMatch(/create table if not exists public\.order_work_subphases/);
    expect(codice).toMatch(/drop trigger if exists trg_sottofasi_guardia/);
    expect(codice).toMatch(/drop policy if exists sottofasi_lettura/);
  });

  it("le sottofasi non copiano azienda e commessa: seguono la fase", () => {
    const tabella = codice.match(/create table if not exists public\.order_work_subphases \([\s\S]*?\n\);/)![0];
    expect(tabella).not.toMatch(/company_id|order_id/);
    expect(tabella).toMatch(/phase_id uuid not null references public\.order_work_phases\(id\) on delete cascade/);
  });

  it("non aggiunge colonne né vincoli a order_work_phases", () => {
    expect(codice).not.toMatch(/alter table public\.order_work_phases/i);
  });

  it("il calcolo sta in un solo posto e il trigger sulla fase lo applica a ogni scrittura", () => {
    expect(codice).toMatch(/create or replace function public\.fase_avanzamento_derivato/);
    expect(funzione("fase_deriva_da_sottofasi")).toContain("public.fase_avanzamento_derivato(");
    expect(funzione("ricalcola_fase_da_sottofasi")).toContain("public.fase_avanzamento_derivato(");
    expect(codice).toMatch(/create trigger trg_fase_deriva_da_sottofasi\s+before update on public\.order_work_phases\s+for each row/);
  });

  it("la guardia guarda current_user (INVOKER); il calcolo e il ricalcolo scrivono come proprietario (DEFINER)", () => {
    const guardia = funzione("sottofase_guardia");
    expect(guardia).not.toMatch(/security definer/i);
    expect(guardia).toMatch(/current_user not in \('authenticated', 'anon'\)/);
    for (const f of ["fase_avanzamento_derivato", "fase_deriva_da_sottofasi", "ricalcola_fase_da_sottofasi", "trg_sottofasi_ricalcola"]) {
      expect(funzione(f), f).toMatch(/security definer\s+set search_path = public/);
    }
  });

  it("dal cantiere cambiano solo fatta, fatta_il, fatta_da e updated_at", () => {
    expect(codice).toMatch(/v_cantiere constant text\[\] := array\['fatta', 'fatta_il', 'fatta_da', 'updated_at'\];/);
  });

  it("la regola dello stato è quella del piano", () => {
    const calcolo = funzione("fase_avanzamento_derivato");
    expect(calcolo).toMatch(/when p\.pct >= 100 then 'completata'/);
    expect(calcolo).toMatch(/when p\.pct > 0 then 'in_corso'/);
    expect(calcolo).toMatch(/when p_status_proposto in \('da_iniziare', 'in_corso'\) then p_status_proposto/);
    expect(calcolo).toMatch(/when p_status_precedente = 'completata' then 'in_corso'/);
  });

  it("RLS: le sottofasi seguono la fase; scrive l'ufficio con la commessa tra le proprie; il cantiere solo aggiorna", () => {
    expect(codice).toMatch(/alter table public\.order_work_subphases enable row level security;/);
    expect(codice).toMatch(/revoke all on public\.order_work_subphases from anon;/);
    const policy = [...codice.matchAll(/create policy (\w+) on public\.order_work_subphases\s+(?:as restrictive\s+)?for (\w+) to authenticated([\s\S]*?\);)\n/g)]
      .map(([, nome, comando, testo]) => ({ nome, comando, testo }));
    expect(policy.map((p) => `${p.nome}:${p.comando}`).sort()).toEqual([
      "blocco_utente_bloccato:all", "sottofasi_lettura:select", "sottofasi_segna_cantiere:update", "sottofasi_ufficio:all",
    ]);
    const ufficio = policy.find((p) => p.nome === "sottofasi_ufficio")!;
    expect(ufficio.testo).toContain("'can_edit_orders'");
    expect(ufficio.testo.match(/public\.can_see_order\(o\.id, o\.assigned_to, o\.destination_warehouse_id\)/g)).toHaveLength(2);
    expect(policy.find((p) => p.nome === "sottofasi_lettura")!.testo).toContain("from public.order_work_phases f where f.id = order_work_subphases.phase_id");
  });

  it("le funzioni nuove non sono eseguibili da nessuno", () => {
    for (const f of ["fase_avanzamento_derivato(uuid, text, text)", "fase_deriva_da_sottofasi()", "ricalcola_fase_da_sottofasi(uuid)", "trg_sottofasi_ricalcola()", "sottofase_guardia()"]) {
      expect(codice).toContain(`revoke all on function public.${f} from public, anon, authenticated;`);
    }
  });

  it("rispetta i guardiani delle migrazioni nuove", () => {
    expect(codice).not.toMatch(/(<>|!=)\s*(public\.)?(get_my_company_id|get_effective_company_id)\(\)/);
    expect(codice).not.toContain("'company_admin'");
  });
});
