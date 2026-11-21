import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const pg = new PGlite();
const azienda = "10000000-0000-4000-8000-000000000001";
const altra = "10000000-0000-4000-8000-000000000002";
const utente = "10000000-0000-4000-8000-000000000003";
const collega = "10000000-0000-4000-8000-000000000004";
const id = ["10000000-0000-4000-8000-000000000011", "10000000-0000-4000-8000-000000000012", "10000000-0000-4000-8000-000000000013"];

beforeAll(async () => {
  await pg.exec(`
    CREATE ROLE authenticated;
    CREATE ROLE anon;
    CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    GRANT USAGE ON SCHEMA auth TO authenticated, service_role;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE public.companies(id uuid PRIMARY KEY);
    CREATE TABLE public.quotes(id uuid PRIMARY KEY, company_id uuid NOT NULL REFERENCES public.companies(id));
    CREATE TYPE public.app_role AS ENUM ('super_admin');
    CREATE PUBLICATION supabase_realtime;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT current_setting('prova.utente', true)::uuid $$;
    CREATE FUNCTION public.get_effective_company_id() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT current_setting('prova.azienda', true)::uuid $$;
    CREATE FUNCTION public.has_role(uuid, public.app_role) RETURNS boolean LANGUAGE sql STABLE
      AS $$ SELECT current_setting('prova.ruolo', true) = 'super' $$;
    CREATE FUNCTION public.user_can_access_company(uuid) RETURNS boolean LANGUAGE sql STABLE
      AS $$ SELECT $1 = public.get_effective_company_id() OR public.has_role(auth.uid(), 'super_admin') $$;
    CREATE FUNCTION public.utente_bloccato() RETURNS boolean LANGUAGE sql STABLE
      AS $$ SELECT current_setting('prova.ruolo', true) = 'bloccato' $$;
    CREATE FUNCTION public.has_permission_for_company(uuid, text, uuid) RETURNS boolean LANGUAGE sql STABLE
      AS $$ SELECT current_setting('prova.ruolo', true) <> 'senza_permesso' $$;
    CREATE FUNCTION public.e_amministratore_di(uuid) RETURNS boolean LANGUAGE sql STABLE
      AS $$ SELECT $1 = public.get_effective_company_id() AND current_setting('prova.ruolo', true) = 'admin' $$;
    INSERT INTO auth.users VALUES ('${utente}'), ('${collega}');
    INSERT INTO public.companies VALUES ('${azienda}'), ('${altra}');
  `);
  const sql = await readFile("supabase/migrations/20290502100000_ai_attivita_live.sql", "utf8");
  await pg.exec(sql);
  await pg.exec(sql);
  await pg.exec(`
    SET ROLE service_role;
    INSERT INTO public.ai_attivita_live
      (id, company_id, actor_user_id, attore, flusso, stato, fase, passaggi, started_at, updated_at)
    VALUES
      ('${id[0]}', '${azienda}', '${utente}', 'Utente', 'silvio', 'in_corso', 'elaborazione', '[{}]', now(), now()),
      ('${id[1]}', '${azienda}', '${collega}', 'Collega', 'preventivo', 'in_corso', 'listino', '[{}]', now(), now()),
      ('${id[2]}', '${altra}', '${utente}', 'Utente', 'whatsapp', 'in_corso', 'smistamento', '[{}]', now(), now());
    RESET ROLE;
  `);
}, 30_000);
afterAll(() => pg.close());

async function leggiCome(ruolo: string) {
  const lettura = await pg.transaction(async tx => {
    await tx.query("SELECT set_config('prova.utente', $1, true), set_config('prova.azienda', $2, true), set_config('prova.ruolo', $3, true)", [utente, azienda, ruolo]);
    await tx.exec("SET LOCAL ROLE authenticated");
    return tx.query<{ id: string }>("SELECT id FROM public.ai_attivita_live ORDER BY id");
  });
  return lettura.rows.map(r => r.id);
}

describe("Attività AI visibile per azienda e ruolo", () => {
  it("isola le attività di chi ha accesso alle impostazioni, inclusa la propria attività di un’altra azienda", async () => {
    expect(await leggiCome("staff")).toEqual([id[0]]);
    expect(await leggiCome("senza_permesso")).toEqual([]);
    expect(await leggiCome("bloccato")).toEqual([]);
  });

  it("mostra agli amministratori le attività dell’azienda aperta", async () => {
    expect(await leggiCome("admin")).toEqual(id.slice(0, 2));
  });

  it("il browser può leggere secondo RLS e la tabella è pubblicata per Realtime", async () => {
    const { rows } = await pg.query(`SELECT has_table_privilege('anon', 'public.ai_attivita_live', 'select') AS anonimo,
      has_table_privilege('authenticated', 'public.ai_attivita_live', 'insert,update,delete') AS scrittura,
      EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='ai_attivita_live') AS realtime`);
    expect(rows).toEqual([{ anonimo: false, scrittura: false, realtime: true }]);
  });

  it("conserva la data di associazione al preventivo nei salvataggi successivi", async () => {
    const aggiunto = await pg.query<{ ai_richiesta_salvata_il: Date }>(
      "INSERT INTO public.quotes (id, company_id, ai_richiesta_id) VALUES ($1, $2, $3) RETURNING ai_richiesta_salvata_il",
      [id[0], azienda, id[1]],
    );
    const bloccato = await pg.query<{ ai_richiesta_salvata_il: Date }>(
      "UPDATE public.quotes SET ai_richiesta_id = $2, ai_richiesta_salvata_il = '2000-01-01' WHERE id = $1 RETURNING ai_richiesta_salvata_il",
      [id[0], id[1]],
    );
    expect(aggiunto.rows[0].ai_richiesta_salvata_il).toBeInstanceOf(Date);
    expect(bloccato.rows).toEqual(aggiunto.rows);
  });
});
