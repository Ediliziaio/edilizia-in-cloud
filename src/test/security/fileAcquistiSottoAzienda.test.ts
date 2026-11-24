import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Controllo documento fornitore e offerte RDO salvano in order-attachments sotto l'azienda
 * (`<azienda>/controlli-fornitore/…`, `<azienda>/rdo/<richiesta>/…`). La regola restrittiva dello storage
 * ammetteva solo cartelle di commessa: dall'11/11/2026 il caricamento era rifiutato a tutti.
 * Qui si carica la migrazione vera e si prova chi scrive e chi legge.
 */
const pg = new PGlite();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [azienda, altra, acquisti, lettore, nessuno, solaLettura, cliente, bloccato, rdo, rdoAltra, ordine] =
  Array.from({ length: 11 }, (_, i) => id(i + 1));
const MIGRAZIONE = "supabase/migrations/20290601100000_file_acquisti_sotto_azienda.sql";

async function come(persona: string, sql: string, args: unknown[] = []) {
  return pg.transaction(async tx => {
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [persona]);
    await tx.exec("set local role authenticated");
    return (await tx.query<{ ok: boolean }>(sql, args)).rows[0]?.ok;
  });
}
const scrive = (p: string, path: string, bucket = "order-attachments") =>
  come(p, "select private.office_attachment_file_write_allowed($1, $2) as ok", [bucket, path]);
const legge = (p: string, path: string) =>
  come(p, "select private.office_attachment_file_allowed('order-attachments', $1) as ok", [path]);

beforeAll(async () => {
  await pg.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema private;
    grant usage on schema private, auth to authenticated;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

    create table public.utenti(id uuid primary key, company_id uuid, permessi text[] default '{}',
      sola_lettura boolean default false, cliente boolean default false, bloccato boolean default false);
    create function public.utente_bloccato() returns boolean language sql stable as
      $$ select coalesce((select bloccato from public.utenti where id = auth.uid()), true) $$;
    create function public.utente_e_cliente_esterno() returns boolean language sql stable as
      $$ select coalesce((select cliente from public.utenti where id = auth.uid()), false) $$;
    create function public.utente_sola_lettura(uuid) returns boolean language sql stable as
      $$ select coalesce((select sola_lettura from public.utenti where id = auth.uid()), false) $$;
    create function public.user_can_access_company(c uuid) returns boolean language sql stable as
      $$ select exists(select 1 from public.utenti where id = auth.uid() and company_id = c) $$;
    create function public.has_permission_for_company(u uuid, p text, c uuid) returns boolean language sql stable as
      $$ select exists(select 1 from public.utenti where id = u and company_id = c and p = any(permessi)) $$;

    create table public.orders(id uuid primary key, company_id uuid);
    create table public.order_attachments(order_id uuid, file_url text, thumb_path text, access_scope text, visible_to_customer boolean);
    create table public.supplier_rfqs(id uuid primary key, company_id uuid);
    create function public.get_order_company_id(o uuid) returns uuid language sql stable as
      $$ select company_id from public.orders where id = o $$;
    create function private.office_visible_order(o uuid) returns boolean language sql stable as
      $$ select public.user_can_access_company(public.get_order_company_id(o)) $$;
    create function private.office_attachment_allowed(o uuid, s text) returns boolean language sql stable as
      $$ select public.user_can_access_company(public.get_order_company_id(o)) $$;

    insert into public.utenti(id, company_id, permessi, sola_lettura, cliente, bloccato) values
      ('${acquisti}', '${azienda}', '{can_manage_purchasing}', false, false, false),
      ('${lettore}', '${azienda}', '{can_view_orders}', false, false, false),
      ('${nessuno}', '${azienda}', '{}', false, false, false),
      ('${solaLettura}', '${azienda}', '{can_manage_purchasing}', true, false, false),
      ('${cliente}', '${azienda}', '{can_view_orders}', false, true, false),
      ('${bloccato}', '${azienda}', '{can_manage_purchasing}', false, false, true);
    insert into public.supplier_rfqs values ('${rdo}', '${azienda}'), ('${rdoAltra}', '${altra}');
    insert into public.orders values ('${ordine}', '${azienda}');
  `);
  // Le due funzioni vere esistono già prima della migrazione: create or replace.
  await pg.exec(`
    create function private.office_attachment_file_write_allowed(p_bucket text, p_path text) returns boolean language sql as $$ select false $$;
    create function private.office_attachment_file_allowed(p_bucket text, p_path text) returns boolean language sql as $$ select false $$;
  `);
  await pg.exec(readFileSync(MIGRAZIONE, "utf8"));
});
afterAll(() => pg.close());

describe("file degli acquisti sotto l'azienda in order-attachments", () => {
  const controllo = `${azienda}/controlli-fornitore/abc-originale.pdf`;

  it("chi fa gli acquisti carica e rilegge il documento del controllo", async () => {
    expect(await scrive(acquisti, controllo)).toBe(true);
    expect(await legge(acquisti, controllo)).toBe(true);
  });

  it("chi vede le commesse lo rilegge ma non lo carica", async () => {
    expect(await scrive(lettore, controllo)).toBe(false);
    expect(await legge(lettore, controllo)).toBe(true);
  });

  it("fuori: senza permessi, sola lettura in scrittura, cliente esterno, bloccato, altra azienda", async () => {
    expect(await scrive(nessuno, controllo)).toBe(false);
    expect(await legge(nessuno, controllo)).toBe(false);
    expect(await scrive(solaLettura, controllo)).toBe(false);
    expect(await legge(cliente, controllo)).toBe(false);
    expect(await scrive(bloccato, controllo)).toBe(false);
    expect(await legge(bloccato, controllo)).toBe(false);
    expect(await scrive(acquisti, `${altra}/controlli-fornitore/abc-originale.pdf`)).toBe(false);
    expect(await legge(acquisti, `${altra}/controlli-fornitore/abc-originale.pdf`)).toBe(false);
  });

  it("solo le due cartelle, senza risalite e solo nel bucket delle commesse", async () => {
    expect(await scrive(acquisti, `${azienda}/altro/abc.pdf`)).toBe(false);
    expect(await scrive(acquisti, `${azienda}/controlli-fornitore/../x.pdf`)).toBe(false);
    expect(await scrive(acquisti, `${azienda}/controlli-fornitore/`)).toBe(false);
    expect(await scrive(acquisti, controllo, "order-variation-documents")).toBe(false);
  });

  it("offerta RDO: solo sotto una richiesta della stessa azienda", async () => {
    expect(await scrive(acquisti, `${azienda}/rdo/${rdo}/1-offerta.pdf`)).toBe(true);
    expect(await legge(acquisti, `${azienda}/rdo/${rdo}/1-offerta.pdf`)).toBe(true);
    expect(await scrive(acquisti, `${azienda}/rdo/${rdoAltra}/1-offerta.pdf`)).toBe(false);
  });

  it("le cartelle delle commesse restano com'erano", async () => {
    expect(await scrive(acquisti, `orders/${ordine}/x.pdf`)).toBe(false); // serve can_edit_orders
    await pg.query("update public.utenti set permessi = '{can_manage_purchasing,can_edit_orders}' where id = $1", [acquisti]);
    expect(await scrive(acquisti, `orders/${ordine}/x.pdf`)).toBe(true);
    expect(await legge(acquisti, `orders/${ordine}/x.pdf`)).toBe(false); // nessuna riga in order_attachments
  });

  it("il browser salva proprio in quelle cartelle", () => {
    const hook = readFileSync("src/hooks/useControlloDocumento.ts", "utf8");
    expect(hook).toContain("`${effectiveCompany.id}/controlli-fornitore/${hash}-originale.");
    const rfq = readFileSync("src/hooks/useSupplierRfqs.ts", "utf8");
    expect(rfq).toContain("`${companyId}/rdo/${rfqId}/");
  });
});
