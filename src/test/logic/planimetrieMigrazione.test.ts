import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// La migrazione delle planimetrie non è ancora applicata: questo test tiene ferme le
// regole del progetto (CLAUDE.md) finché il founder non la applica.

const FILE = "20281030260000_planimetrie_base.sql";
const sql = readFileSync(resolve(process.cwd(), "supabase/migrations", FILE), "utf8");
const codice = sql.replace(/--.*$/gm, "");
const TABELLE = ["planimetrie", "planimetrie_versioni", "planimetrie_file"];
const RPC = [
  "planimetria_crea(uuid, text, jsonb, jsonb, text, text, uuid, uuid, uuid, uuid, uuid)",
  "planimetria_salva_versione(uuid, jsonb, jsonb, text, text, integer)",
];
const TRIGGER = [
  "planimetrie_collegamenti_stessa_azienda()",
  "planimetrie_versione_corrente_esiste()",
  "planimetrie_figlio_stessa_azienda()",
  "computo_misure_planimetria_stessa_azienda()",
];

describe("migrazione planimetrie_base", () => {
  it("la versione è sua e solo sua", () => {
    expect(readdirSync(resolve(process.cwd(), "supabase/migrations")).filter(f => f.startsWith("20281030260000_"))).toEqual([FILE]);
  });

  it("è rilanciabile e non aspetta i lock", () => {
    expect(codice).toMatch(/set local lock_timeout = '3s';/);
    expect(codice).not.toMatch(/create table public\./);
    expect(codice).not.toMatch(/create index (?!if not exists)/);
    expect(codice).not.toMatch(/add column (?!if not exists)/);
    const policy = [...codice.matchAll(/create policy (\w+) on ([\w.]+)/g)];
    for (const [, nome, tabella] of policy) expect(codice).toContain(`drop policy if exists ${nome} on ${tabella};`);
    for (const t of [...codice.matchAll(/create trigger (\w+)\s+\w+[\s\S]*? on ([\w.]+)/g)]) {
      expect(codice).toContain(`drop trigger if exists ${t[1]} on ${t[2]};`);
    }
  });

  it("le tabelle hanno le regole di accesso accese e niente per anon", () => {
    for (const t of TABELLE) {
      expect(codice).toContain(`create table if not exists public.${t} (`);
      expect(codice).toContain(`alter table public.${t} enable row level security;`);
      expect(codice).toContain(`revoke all on public.${t} from public, anon;`);
      expect(codice).toMatch(new RegExp(`create policy blocco_utente_bloccato on public\\.${t} as restrictive`));
    }
    expect(codice).not.toMatch(/to anon\b/);
  });

  it("le versioni non si modificano: ai client solo lettura e aggiunta", () => {
    expect(codice).toContain("grant select, insert on public.planimetrie_versioni to authenticated;");
    expect(codice).not.toMatch(/create policy \w+ on public\.planimetrie_versioni for (update|delete)/);
  });

  it("le funzioni nuove sono chiuse ad anon; le RPC aperte solo a chi è dentro", () => {
    for (const f of RPC) {
      expect(codice).toContain(`revoke all on function public.${f} from public, anon;`);
      expect(codice).toContain(`grant execute on function public.${f} to authenticated, service_role;`);
    }
    for (const f of TRIGGER) expect(codice).toContain(`revoke all on function public.${f} from public, anon, authenticated;`);
    const definite = [...codice.matchAll(/create or replace function public\.(\w+)\(/g)].map(m => m[1]);
    expect(definite.sort()).toEqual([...RPC, ...TRIGGER].map(f => f.slice(0, f.indexOf("("))).sort());
    // le RPC rispettano le regole di accesso di chi chiama; tutte con search_path fisso
    expect(codice.match(/security invoker/g)).toHaveLength(RPC.length);
    expect(codice.match(/set search_path = ''/g)).toHaveLength(RPC.length + TRIGGER.length);
  });

  it("collega il computo alla pianta con le tre colonne del piano", () => {
    for (const c of ["planimetria_id uuid references public.planimetrie(id)", "planimetria_versione integer", "planimetria_chiavi text[]"]) {
      expect(codice).toContain(`alter table public.computo_voci_misure add column if not exists ${c}`);
    }
  });

  it("i file stanno in un contenitore privato, sotto la cartella dell'azienda", () => {
    expect(codice).toMatch(/values \('planimetrie', 'planimetrie', false,/);
    expect(codice).toContain("on conflict (id) do update set public = false");
    expect(codice.match(/\(storage\.foldername\(name\)\)\[1\] in \(select p\.company_id::text/g)).toHaveLength(3);
  });

  it("dice chiaramente che non è ancora applicata", () => {
    expect(sql).toMatch(/PRONTA, NON APPLICATA/);
  });
});
