import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20281231120000_giornale_eventi.sql"), "utf8");
const codice = sql.replace(/--.*$/gm, "");
const funzione = (nome: string) => codice.match(new RegExp(`create or replace function public\\.${nome}\\([\\s\\S]*?\\n\\$\\$;`))![0];

describe("migrazione giornale_eventi", () => {
  it("non aspetta i lock ed è idempotente", () => {
    expect(codice).toMatch(/set local lock_timeout = '3s';/);
    expect(codice).toMatch(/set local statement_timeout = '60s';/);
    const politiche = codice.match(/create policy (\w+)/g)!.map((c) => c.split(" ")[2]);
    expect(politiche).toHaveLength(2);
    for (const nome of politiche) expect(codice).toContain(`drop policy if exists ${nome} `);
    for (const nome of codice.match(/create trigger (\w+)/g)!.map((c) => c.split(" ")[2])) expect(codice).toContain(`drop trigger if exists ${nome} `);
    expect(codice).not.toMatch(/create (unique )?(function|table|index) (?!if not exists)(?!or replace)/);
  });

  it("anon fuori da tutto, gli invii solo al service role", () => {
    expect(codice).toContain("revoke all on table public.giornale_eventi from public, anon;");
    expect(codice).toContain("revoke all on table public.giornale_invii_dl from public, anon, authenticated;");
    expect(codice).toContain("grant all on table public.giornale_invii_dl to service_role;");
    expect(codice).toContain("alter table public.giornale_invii_dl enable row level security;");
    expect(codice).not.toMatch(/create policy \w+ on public\.giornale_invii_dl/);
    expect(codice).toContain("revoke all on function public.giornale_eventi_guardia() from public, anon, authenticated;");
    expect(codice).toContain("revoke all on function public.giornale_testo_canonico(public.giornale_lavori) from public, anon;");
  });

  it("RLS: lettura stessa azienda e non cliente, scrittura col permesso", () => {
    expect(codice).toMatch(/giornale_eventi_select[\s\S]*?utente_e_cliente_esterno/);
    expect(codice).toMatch(/create policy giornale_eventi_scrittura[\s\S]*?using \(public\.puo_modificare_giornale\(company_id\)\)\s+with check \(public\.puo_modificare_giornale\(company_id\)\)/);
  });

  it("il trigger blocca la firmata: solo chiusura, i collegamenti solo verso NULL", () => {
    const g = funzione("giornale_eventi_guardia");
    expect(g).toContain("array['stato', 'chiuso_il', 'chiuso_da', 'nota_chiusura', 'ddt_id', 'ticket_id', 'fase_id']");
    expect(g).toContain("(to_jsonb(new) - chiusura) is distinct from (to_jsonb(old) - chiusura)");
    expect(g).toMatch(/new\.ddt_id is not null and new\.ddt_id is distinct from old\.ddt_id/);
    expect(g).toMatch(/if tg_op = 'DELETE' then[\s\S]*not exists \(select 1 from public\.companies c where c\.id = old\.company_id\)/);
    expect(g).toContain("non si possono aggiungere eventi");
    expect(g).toContain("for share");
    expect(codice).toMatch(/before insert or update or delete on public\.giornale_eventi/);
  });

  it("l'impronta aggiunge gli eventi solo se ci sono, senza stato né collegamenti", () => {
    const c = funzione("giornale_testo_canonico");
    expect(c).toContain("having count(*) > 0), '{}'::jsonb)");
    expect(c).toContain("jsonb_build_array(e.id, e.tipo, e.ora, e.testo)");
    // Il resto come nel lotto 3: stessa impronta per le pagine senza eventi.
    expect(c).toMatch(/array\[\s+'stato', 'pm_signed_at', 'pm_signed_by', 'pm_signature_hash', 'created_by',\s+'visibile_cliente', 'archived_storage_path', 'archived_at',\s+'dl_notified_at', 'dl_notification_method'\s+\]/);
  });

  it("backup e purga: company_id in cascata, collegamenti a NULL, indici unici interi per l'upsert", () => {
    expect(codice).toMatch(/giornale_eventi \([\s\S]*?company_id uuid not null references public\.companies\(id\) on delete cascade/);
    for (const c of ["ddt_ricezione", "tickets", "order_work_phases"]) expect(codice).toContain(`references public.${c}(id) on delete set null`);
    expect(codice).toMatch(/create unique index if not exists uq_giornale_eventi_ddt on public\.giornale_eventi \(giornale_id, ddt_id\);/);
  });

  it("il cliente vede solo le firmate: policy cambiate, non affiancate", () => {
    expect(codice).toMatch(/alter policy giornale_lavori_lettura_authenticated[\s\S]*?stato = 'firmata'/);
    expect(codice).toMatch(/alter policy giornale_foto_cliente_select[\s\S]*?g\.stato = 'firmata'/);
  });
});
