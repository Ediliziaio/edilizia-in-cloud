// src/test/logic/modelliFasiMigrazione.test.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20281007140000_modelli_fasi_azienda.sql"), "utf8");
const codice = sql.replace(/--.*$/gm, "");
const funzione = (nome: string) => codice.match(new RegExp(`create or replace function public\\.${nome}\\([\\s\\S]*?\\n\\$\\$;`))![0];
const RPC = [
  "salva_modello_fasi(uuid, jsonb)",
  "elimina_modello_fasi(uuid, uuid)",
  "salva_commessa_come_modello(uuid, text)",
  "inizializza_modelli_fasi(uuid, jsonb, boolean)",
  "aggiungi_fasi_commessa(uuid, jsonb)",
];

describe("migrazione modelli_fasi_azienda", () => {
  it("è rilanciabile e non aspetta i lock", () => {
    expect(codice).toMatch(/set local lock_timeout = '3s';/);
    for (const t of ["work_phase_templates", "work_phase_template_phases", "work_phase_template_subphases", "company_fasi_settings"]) {
      expect(codice).toContain(`create table if not exists public.${t}`);
      expect(codice).toContain(`alter table public.${t} enable row level security;`);
    }
  });

  it("le tabelle sono chiuse in scrittura: ai client resta la lettura (più il blocco degli utenti bloccati)", () => {
    expect(codice).toMatch(/revoke all on public\.work_phase_templates[^;]*from anon, authenticated;/);
    expect(codice).toMatch(/grant select on public\.work_phase_templates[^;]*to authenticated;/);
    const policy = [...codice.matchAll(/create policy (\w+) on public\.(\w+)\s+(?:as restrictive\s+)?for (\w+) to authenticated/g)];
    expect(policy.length).toBeGreaterThanOrEqual(8);
    // Nessuna policy permette di scrivere: solo lettura, più il blocco restrittivo degli utenti bloccati.
    expect(policy.filter((m) => m[1] !== "blocco_utente_bloccato" && m[3] !== "select")).toEqual([]);
  });

  it("le RPC sono SECURITY DEFINER con search_path fisso, chiuse ad anon e aperte ad authenticated", () => {
    for (const f of RPC) {
      expect(codice).toContain(`revoke all on function public.${f} from public, anon;`);
      expect(codice).toContain(`grant execute on function public.${f} to authenticated;`);
    }
    expect(codice.match(/security definer\s+set search_path = public/g) ?? []).toHaveLength(RPC.length);
  });

  it("i modelli si scrivono col permesso delle impostazioni, le fasi in commessa con «Ordini e Commesse» dell'azienda della COMMESSA", () => {
    expect(codice.match(/'can_edit_settings_orders'/g)!.length).toBeGreaterThanOrEqual(4);
    const aggiungi = funzione("aggiungi_fasi_commessa");
    expect(aggiungi).toMatch(/v_azienda uuid := public\.get_order_company_id\(p_order_id\);/);
    expect(aggiungi).toMatch(/has_permission_for_company\(auth\.uid\(\), 'can_edit_orders', v_azienda\)/);
    expect(aggiungi).not.toMatch(/has_permission\(/);
  });

  it("le sottofasi di una commessa si scrivono senza azienda né commessa: le porta la fase", () => {
    expect(funzione("aggiungi_fasi_commessa")).toMatch(/insert into public\.order_work_subphases \(phase_id, name, position, peso\)/);
  });

  it("i modelli di partenza: una volta sola, serializzati dal blocco della riga, rifiutati a chi non può", () => {
    const f = funzione("inizializza_modelli_fasi");
    expect(f).toMatch(/select modelli_inizializzati into v_gia from public\.company_fasi_settings where company_id = p_company_id for update;/);
    expect(f).toMatch(/if v_gia and not p_solo_mancanti then\s+return 0;/);
    expect(f).toContain("'can_edit_settings_orders'");
    expect(f).toMatch(/exception when unique_violation then null;/);
  });

  it("il nome di un modello è unico nell'azienda, senza badare a maiuscole e spazi", () => {
    expect(codice).toMatch(/create unique index if not exists work_phase_templates_nome_uk on public\.work_phase_templates \(company_id, lower\(btrim\(name\)\)\);/);
  });

  it("non tocca order_work_phases (nessuna colonna, nessun trigger)", () => {
    expect(codice).not.toMatch(/alter table public\.order_work_phases/i);
    expect(codice).not.toMatch(/trigger[^;]*on public\.order_work_phases/i);
  });

  it("rispetta i guardiani delle migrazioni nuove", () => {
    expect(codice).not.toMatch(/(<>|!=)\s*(public\.)?(get_my_company_id|get_effective_company_id)\(\)/);
    expect(codice).not.toContain("'company_admin'");
  });
});
