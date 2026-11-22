import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

it("espone la ricevuta offline attraverso la vista protetta e mantiene le scritture dei rapportini", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create role authenticated;
      create role anon;
      create table public.campo_rapportini (
        id uuid primary key, visibile boolean not null default true,
        costo numeric, descrizione_lavori text
      );
      create view public.campo_rapportini_visibili with (security_barrier=true) as
        select cr.id, case when false then cr.costo else null end as costo, cr.descrizione_lavori
        from public.campo_rapportini cr where cr.visibile;
      alter view public.campo_rapportini_visibili alter column descrizione_lavori set default 'Bozza';
      grant select, insert on public.campo_rapportini_visibili to authenticated;
      create function public.scrivi_rapporto() returns trigger language plpgsql security definer as $f$
      begin
        insert into public.campo_rapportini(id, descrizione_lavori, invio_operazione_id)
          values (new.id, new.descrizione_lavori, new.invio_operazione_id);
        return new;
      end $f$;
      create trigger office_projection_write instead of insert on public.campo_rapportini_visibili
        for each row execute function public.scrivi_rapporto();
    `);
    const migrazione = await readFile("supabase/migrations/20290506171000_campo_rapportino_operazione_invio.sql", "utf8");
    await pg.transaction(tx => tx.exec(migrazione));
    await pg.transaction(tx => tx.exec(migrazione));

    const id = "aaaaaaaa-0000-4000-a000-000000000001";
    const operazione = "aaaaaaaa-0000-4000-a000-000000000002";
    await pg.exec("set role authenticated");
    await pg.query("insert into campo_rapportini_visibili(id, invio_operazione_id) values ($1, $2)", [id, operazione]);
    await pg.exec("reset role; update campo_rapportini set costo = 90; set role authenticated");
    expect((await pg.query("select * from campo_rapportini_visibili")).rows).toEqual([
      { id, costo: null, descrizione_lavori: "Bozza", invio_operazione_id: operazione },
    ]);
    await pg.exec("reset role; set role anon");
    await expect(pg.query("select invio_operazione_id from campo_rapportini_visibili")).rejects.toMatchObject({ code: "42501" });
  } finally {
    await pg.close();
  }
}, 15000);
