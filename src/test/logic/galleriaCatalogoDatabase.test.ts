import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const azienda = "00000000-0000-0000-0000-000000000001";
const altra = "00000000-0000-0000-0000-000000000002";
const galleria = [{ id: "prima", url: "https://example.test/profilo.jpg", ruolo: "sezione", didascalia: "Profilo autentico" }];
beforeAll(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table public.listino_schede_linea (
      id uuid primary key default gen_random_uuid(), company_id uuid not null, macrocategoria_id uuid,
      chiave text, nome text, descrizione text, immagine_url text, profondita_mm integer,
      camere smallint, guarnizioni smallint, uw numeric, scheda_tecnica_url text, scheda_tecnica_nome text
    );
    create table public.supplier_product_lines(id uuid primary key default gen_random_uuid(), company_id uuid not null);
    alter table public.listino_schede_linea enable row level security;
    create policy azienda on public.listino_schede_linea to authenticated
      using (company_id = current_setting('app.company_id')::uuid)
      with check (company_id = current_setting('app.company_id')::uuid);
    grant select,insert,update on public.listino_schede_linea to authenticated;
    create function public.listino_copia_tipologia() returns void language plpgsql as $fn$
    begin
      -- Existing authorization marker must not be removed by the migration.
      insert into public.listino_schede_linea
        (company_id, macrocategoria_id, chiave, nome, descrizione, immagine_url, profondita_mm,
         camere, guarnizioni, uw, scheda_tecnica_url, scheda_tecnica_nome)
      select s.company_id, s.macrocategoria_id, s.chiave, s.nome || ' copia', s.descrizione, s.immagine_url, s.profondita_mm,
             s.camere, s.guarnizioni, s.uw, s.scheda_tecnica_url, s.scheda_tecnica_nome
        from public.listino_schede_linea s where s.nome = 'Originale';
    end; $fn$;
    create function public.listino_modello_installa_core(contenuto jsonb) returns void language plpgsql as $fn$
    begin
      insert into public.listino_schede_linea
        (company_id, macrocategoria_id, chiave, nome, descrizione, immagine_url, profondita_mm, camere,
         guarnizioni, uw, scheda_tecnica_url, scheda_tecnica_nome)
      select '${azienda}', null, s ->> 'chiave', s ->> 'nome', s ->> 'descrizione', s ->> 'immagine_url',
             (s ->> 'profondita_mm')::int, (s ->> 'camere')::smallint, (s ->> 'guarnizioni')::smallint,
             (s ->> 'uw')::numeric, s ->> 'scheda_tecnica_url', s ->> 'scheda_tecnica_nome'
        from jsonb_array_elements(contenuto) s;
    end; $fn$;
  `);
  await db.exec(await readFile("supabase/migrations/20281026140001_immagini_linee_prodotto.sql", "utf8"));
}, 60_000);
afterAll(async () => db.close());

describe("Gallerie: database locale reale, copie e isolamento aziende", () => {
  it("salva e rilegge ordine, ruoli e didascalie", async () => {
    await db.query("insert into listino_schede_linea(company_id,nome,immagini) values($1,'Originale',$2::jsonb)", [azienda, JSON.stringify(galleria)]);
    const result = await db.query<{ immagini: unknown }>("select immagini from listino_schede_linea where nome='Originale'");
    expect(result.rows[0].immagini).toEqual(galleria);
  });
  it("rifiuta strutture non valide, ruoli sconosciuti e principali duplicate", async () => {
    for (const invalid of [{}, [{ ...galleria[0], ruolo: "fantasia" }], [galleria[0], galleria[0]],
      [{ ...galleria[0], ruolo: "principale" }, { ...galleria[0], id: "b", ruolo: "principale" }],
      [{ ...galleria[0], url: "javascript:alert(1)" }]]) {
      await expect(db.query("insert into supplier_product_lines(company_id,immagini) values($1,$2::jsonb)", [azienda, JSON.stringify(invalid)])).rejects.toThrow();
    }
  });
  it("non perde la galleria quando copia una tipologia", async () => {
    await db.query("select listino_copia_tipologia()");
    const result = await db.query<{ immagini: unknown }>("select immagini from listino_schede_linea where nome='Originale copia'");
    expect(result.rows[0].immagini).toEqual(galleria);
    const fn = await db.query<{ def: string }>("select pg_get_functiondef('listino_copia_tipologia()'::regprocedure) as def");
    expect(fn.rows[0].def).toContain("Existing authorization marker");
  });
  it("installa gallerie nuove e modelli precedenti senza immagini", async () => {
    await db.query("select listino_modello_installa_core($1::jsonb)", [JSON.stringify([
      { nome: "Modello nuovo", immagini: galleria }, { nome: "Modello precedente", immagine_url: "https://example.test/legacy.jpg" },
    ])]);
    const result = await db.query<{ nome: string; immagini: unknown; immagine_url: string }>("select nome,immagini,immagine_url from listino_schede_linea where nome like 'Modello%' order by nome");
    expect(result.rows[0].immagini).toEqual(galleria);
    expect(result.rows[1].immagini).toEqual([]);
    expect(result.rows[1].immagine_url).toContain("legacy.jpg");
  });
  it("le nuove immagini restano protette dalla RLS esistente", async () => {
    await db.query("insert into listino_schede_linea(company_id,nome,immagini) values($1,'Riservata',$2::jsonb)", [altra, JSON.stringify(galleria)]);
    await db.exec(`set role authenticated; set app.company_id = '${azienda}';`);
    try {
      expect((await db.query("select * from listino_schede_linea where nome='Riservata'")).rows).toHaveLength(0);
      expect((await db.query("select * from listino_schede_linea where nome='Originale'")).rows).toHaveLength(1);
      await expect(db.query("insert into listino_schede_linea(company_id,nome,immagini) values($1,'Non autorizzata',$2::jsonb)", [altra, JSON.stringify(galleria)])).rejects.toThrow();
    } finally { await db.exec("reset role"); }
  });
});
