import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20281231100000_giornale_bozza_firma_annotazioni.sql"), "utf8");
const codice = sql.replace(/--.*$/gm, "");
const funzione = (nome: string) => codice.match(new RegExp(`create or replace function public\\.${nome}\\([\\s\\S]*?\\n\\$\\$;`))![0];

describe("migrazione giornale_bozza_firma_annotazioni", () => {
  it("non aspetta i lock ed è idempotente", () => {
    expect(codice).toMatch(/set local lock_timeout = '3s';/);
    expect(codice).toMatch(/set local statement_timeout = '60s';/);
    expect(codice).toMatch(/add column if not exists stato text not null default 'bozza'/);
    expect(codice).toContain("create table if not exists public.giornale_annotazioni");
    const create = codice.match(/create policy (\w+)/g)!.map((c) => c.split(" ")[2]);
    for (const nome of create) expect(codice).toContain(`drop policy if exists ${nome} `);
    const trigger = codice.match(/create trigger (\w+)/g)!.map((c) => c.split(" ")[2]);
    for (const nome of trigger) expect(codice).toContain(`drop trigger if exists ${nome} `);
    expect(codice).not.toMatch(/create (function|table|index) (?!if not exists)(?!or replace)/);
  });

  it("le funzioni nuove sono chiuse ad anon, la firma è aperta solo ad authenticated", () => {
    for (const firma of ["giornale_firma(uuid)", "puo_modificare_giornale(uuid)", "giornale_testo_canonico(public.giornale_lavori)"]) {
      expect(codice).toContain(`revoke all on function public.${firma} from public, anon`);
    }
    expect(codice).toContain("grant execute on function public.giornale_firma(uuid) to authenticated;");
    expect(codice).toContain("revoke all on function public.giornale_lavori_guardia_firma() from public, anon, authenticated;");
    expect(codice).toContain("revoke all on function public.giornale_foto_guardia_firma() from public, anon, authenticated;");
    expect(funzione("giornale_firma")).toMatch(/security definer\s+set search_path = public/);
    expect(funzione("giornale_firma")).toContain("puo_modificare_giornale(g.company_id)");
    expect(funzione("puo_modificare_giornale")).toContain("'can_edit_giornale_lavori'");
  });

  it("la pagina firmata non si cancella né si modifica, tranne i campi di servizio", () => {
    const g = funzione("giornale_lavori_guardia_firma");
    expect(g).toMatch(/if tg_op = 'DELETE' then\s+[\s\S]*old\.stato = 'firmata'/);
    expect(g).toContain("Una pagina firmata non torna in bozza.");
    expect(g).toMatch(/array\['visibile_cliente', 'archived_storage_path', 'archived_at',\s+'dl_notified_at', 'dl_notification_method', 'created_by'\]/);
    expect(g).toContain("sha256(convert_to(public.giornale_testo_canonico(new), 'UTF8'))");
    expect(codice).toMatch(/before insert or update or delete on public\.giornale_lavori/);
    expect(codice).toMatch(/before insert or update or delete on public\.giornale_foto/);
  });

  it("annotazioni: solo aggiunta, solo su pagine firmate", () => {
    expect(codice).toContain("revoke update, delete, truncate on table public.giornale_annotazioni from authenticated;");
    expect(codice).toContain("grant select, insert on table public.giornale_annotazioni to authenticated;");
    expect(codice).not.toMatch(/on public\.giornale_annotazioni\s+for (update|delete|all)/);
    expect(codice).toMatch(/giornale_annotazioni_insert[\s\S]*g\.stato = 'firmata'/);
  });

  it("scrivere il giornale richiede il permesso: la vecchia FOR ALL diventa solo lettura", () => {
    expect(codice).toMatch(/create policy company_access_giornale on public\.giornale_lavori\s+for select/);
    for (const op of ["insert", "update", "delete"]) {
      expect(codice).toMatch(new RegExp(`create policy giornale_lavori_modifica_${op} on public\\.giornale_lavori\\s+for ${op}[\\s\\S]*?puo_modificare_giornale\\(company_id\\)`));
    }
  });
});
