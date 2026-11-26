import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";

const db = new PGlite();
const azienda = "a1000000-0000-4000-8000-000000000001";
type Attore = { campo?: boolean; esterno?: boolean; bloccato?: boolean; lettura?: boolean; permessi?: string[]; azienda?: string };

async function come(attore: Attore, sql: string) {
  return db.transaction(async tx => {
    for (const [nome, valore] of Object.entries({
      azienda: attore.azienda ?? azienda, campo: !!attore.campo, esterno: !!attore.esterno,
      bloccato: !!attore.bloccato, lettura: !!attore.lettura, permessi: (attore.permessi ?? []).join(","),
    })) await tx.query("select set_config($1,$2,true)", [`test.${nome}`, String(valore)]);
    await tx.exec("set local role authenticated");
    return (await tx.query(sql)).rows;
  });
}

beforeAll(async () => {
  await db.exec(`
    create role authenticated;
    create role service_role bypassrls;
    create schema storage;
    grant usage on schema storage to authenticated, service_role;
    create table storage.objects(bucket_id text, name text, note text);
    alter table storage.objects enable row level security;
    grant select,insert,update,delete on storage.objects to authenticated,service_role;
    create function public.get_my_company_id() returns uuid language sql stable as $$ select current_setting('test.azienda')::uuid $$;
    create function public.utente_bloccato() returns boolean language sql stable as $$ select current_setting('test.bloccato')::boolean $$;
    create function public.e_solo_campo() returns boolean language sql stable as $$ select current_setting('test.campo')::boolean $$;
    create function public.utente_e_cliente_esterno() returns boolean language sql stable as $$ select current_setting('test.esterno')::boolean $$;
    create function public.utente_super_admin() returns boolean language sql stable as $$ select false $$;
    create function public.utente_sola_lettura(uuid) returns boolean language sql stable as $$ select current_setting('test.lettura')::boolean $$;
    create function public.aziende_con_uno_dei_permessi(p text[]) returns uuid[] language sql stable as $$
      select case when p && string_to_array(current_setting('test.permessi'),',')
        then array[public.get_my_company_id()] else array[]::uuid[] end $$;
    create function public.aziende_con_permesso(p text) returns uuid[] language sql stable as $$
      select public.aziende_con_uno_dei_permessi(array[p]) $$;
    create policy precedente_prefisso_azienda on storage.objects for all to authenticated
      using(split_part(name,'/',1)=public.get_my_company_id()::text)
      with check(split_part(name,'/',1)=public.get_my_company_id()::text);
    create policy firmati_solo_server on storage.objects as restrictive for all to authenticated
      using(bucket_id <> 'quote-pdfs' or split_part(name,'/',2) <> 'firmati')
      with check(bucket_id <> 'quote-pdfs' or split_part(name,'/',2) <> 'firmati');
    insert into storage.objects values ('quote-pdfs','${azienda}/moduli/preventivo.pdf','originale'),
      ('quote-pdfs','${azienda}/firmati/copia.pdf','firma'), ('hr-documenti','${azienda}/persona/attestato.pdf','attestato');
  `);
  // La fixture riproduce la falla: il solo prefisso azienda lasciava leggere il PDF all'operaio.
  expect(await come({ campo: true }, "select note from storage.objects where bucket_id='quote-pdfs'")).toEqual([{ note: "originale" }]);
  const sql = readFileSync("supabase/migrations/20290622100000_quote_pdfs_permessi_ufficio.sql", "utf8");
  await db.transaction(tx => tx.exec(sql));
  await db.transaction(tx => tx.exec(sql));
});
afterAll(async () => { await db.close(); });

it.each<Attore>([
  { campo: true, permessi: ["can_view_preventivi", "can_edit_preventivi"] },
  { esterno: true, permessi: ["can_view_orders"] },
  {},
  { bloccato: true, permessi: ["can_view_preventivi"] },
])("nega il PDF riservato a un account privo dell'accesso ufficio: %j", async attore => {
  expect(await come(attore, "select note from storage.objects where bucket_id='quote-pdfs'")).toEqual([]);
  await expect(come(attore, `insert into storage.objects values ('quote-pdfs','${azienda}/moduli/nuovo.pdf','nuovo')`)).rejects.toMatchObject({ code: "42501" });
});

it.each(["can_view_preventivi", "can_view_orders"])("con %s legge, ma non carica o riscrive PDF", async permesso => {
  const attore = { permessi: [permesso] };
  expect(await come(attore, "select note from storage.objects where bucket_id='quote-pdfs'")).toEqual([{ note: "originale" }]);
  expect(await come(attore, "update storage.objects set note='vietato' where bucket_id='quote-pdfs' returning name")).toEqual([]);
});

it("chi modifica i preventivi può caricare, aggiornare ed eliminare la propria bozza", async () => {
  const attore = { permessi: ["can_view_preventivi", "can_edit_preventivi"] };
  await come(attore, `insert into storage.objects values ('quote-pdfs','${azienda}/moduli/nuovo.pdf','nuovo')`);
  expect(await come(attore, "update storage.objects set note='aggiornato' where note='nuovo' returning note")).toEqual([{ note: "aggiornato" }]);
  expect(await come(attore, "delete from storage.objects where note='aggiornato' returning note")).toEqual([{ note: "aggiornato" }]);
});

it("la sola lettura e l'azienda diversa mantengono i propri limiti", async () => {
  const attore = { lettura: true, permessi: ["can_view_preventivi", "can_edit_preventivi"] };
  expect(await come(attore, "select note from storage.objects where bucket_id='quote-pdfs'")).toEqual([{ note: "originale" }]);
  await expect(come(attore, `insert into storage.objects values ('quote-pdfs','${azienda}/moduli/nuovo.pdf','nuovo')`)).rejects.toMatchObject({ code: "42501" });
  expect(await come({ ...attore, azienda: "b1000000-0000-4000-8000-000000000001" }, "select note from storage.objects")).toEqual([]);
});

it("non chiude gli attestati HR dell'operaio e conserva le copie firmate riservate al server", async () => {
  expect(await come({ campo: true }, "select note from storage.objects where bucket_id='hr-documenti'")).toEqual([{ note: "attestato" }]);
  const righe = await db.transaction(async tx => {
    await tx.exec("set local role service_role");
    return (await tx.query("select note from storage.objects where note='firma'")).rows;
  });
  expect(righe).toEqual([{ note: "firma" }]);
});
