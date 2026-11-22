import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const pg = new PGlite();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [azienda, altra, ordine, secondo, estraneo, capo, operaio, geometra, ufficio, esterno, bloccato, fase, fase2] =
  Array.from({ length: 13 }, (_, i) => id(i + 1));

async function come<T>(persona: string, sql: string, args: unknown[] = [], societa = azienda) {
  return pg.transaction(async tx => {
    await tx.query("select set_config('request.jwt.claim.sub', $1, true), set_config('test.azienda', $2, true)", [persona, societa]);
    await tx.exec("set local role authenticated");
    return (await tx.query<T>(sql, args)).rows;
  });
}

beforeAll(async () => {
  await pg.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create schema private;
    create schema storage;
    grant usage on schema private, storage, auth to authenticated;
    create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function public.get_effective_company_id() returns uuid language sql stable as
    $$ select nullif(current_setting('test.azienda', true), '')::uuid $$;

    create table profiles (id uuid primary key, company_id uuid, is_blocked boolean, first_name text, last_name text);
    create type public.app_role as enum ('employee', 'company_staff', 'company_admin', 'customer', 'subcontractor', 'super_admin');
    create table user_roles(user_id uuid, ruolo public.app_role);
    create table multi_company_access(user_id uuid, company_id uuid, access_role text, status text, expires_at timestamptz,
      primary key (user_id, company_id));
    create function public.has_role(p uuid, r public.app_role) returns boolean language sql stable as
    $$ select exists (select 1 from public.user_roles where user_id = p and ruolo = r) $$;
    create function public.utente_bloccato() returns boolean language sql stable as
    $$ select coalesce((select is_blocked from public.profiles where id = auth.uid()), true) $$;
    create function public.utente_e_cliente_esterno() returns boolean language sql stable as
    $$ select public.has_role(auth.uid(), 'customer') $$;
    create function public.e_solo_campo() returns boolean language sql stable as
    $$ select not public.has_role(auth.uid(), 'company_admin') and not public.has_role(auth.uid(), 'company_staff') $$;
    create function public.utente_sola_lettura(uuid) returns boolean language sql stable as $$ select false $$;
    create function public.has_permission_for_company(p uuid, r text, c uuid) returns boolean language sql stable as
    $$ select r = 'can_edit_orders' and public.has_role(p, 'company_admin') and exists(select 1 from public.profiles where id = p and company_id = c) $$;
    create function public.e_amministratore_di(c uuid) returns boolean language sql stable as
    $$ select public.has_permission_for_company(auth.uid(), 'can_edit_orders', c) $$;
    create function public.can_access_company_people(c uuid) returns boolean language sql stable as
    $$ select exists(select 1 from public.profiles where id = auth.uid() and company_id = c) $$;

    create table orders (
      id uuid primary key, company_id uuid not null, deleted_at timestamptz,
      order_code text, description text, indirizzo_lavori text, work_start_date date, work_end_date date, percentuale_avanzamento numeric
    );
    create table order_campo_assignments (order_id uuid, company_id uuid, user_id uuid, role_type text, is_capocantiere boolean);
    create table order_work_phases (
      id uuid primary key, order_id uuid, company_id uuid, name text, status text, percentuale numeric, notes text,
      start_date date, end_date date, completata_il timestamptz, position int, importo_venduto numeric
    );
    create table order_work_subphases (
      id uuid primary key, phase_id uuid, name text, position int, peso int, fatta boolean, fatta_il timestamptz,
      percentuale numeric, data_inizio date, data_fine date, giorni int, in_parallelo boolean, risorse int,
      iniziata_il date, giorni_lavorati int
    );
    create table campo_rapportini (
      order_id uuid, company_id uuid, data_lavoro date, annullato_at timestamptz, stato text, fasi_lavorate jsonb
    );
    create table order_attachments (
      id uuid primary key, order_id uuid, access_scope text, stato_revisione text, file_url text, file_name text,
      file_type text, cantiere_tipo text, revisione text, file_size bigint
    );
    create table storage.objects (name text, bucket_id text);
    alter table storage.objects enable row level security;
    grant select on storage.objects to authenticated;
    create function private.office_visible_order(p uuid) returns boolean language sql stable security definer set search_path = ''
    as $$ select exists(select 1 from public.orders o where o.id = p and public.has_permission_for_company(auth.uid(), 'can_edit_orders', o.company_id)) $$;
    create function private.office_attachment_file_allowed(b text, n text) returns boolean language sql stable security definer set search_path = ''
    as $$ select b = 'order-attachments' and exists(select 1 from public.order_attachments a where a.file_url = n and private.office_visible_order(a.order_id)) $$;
    create policy ufficio_vede_file on storage.objects for select to authenticated
      using (private.office_attachment_file_allowed(bucket_id,name));
    create policy office_attachment_file_read on storage.objects as restrictive for select to authenticated
      using (private.office_attachment_file_allowed(bucket_id,name));
  `);

  for (const file of ["20290422161000_documenti_qr_cantiere.sql", "20290506173000_scheda_tecnica_cantiere.sql"]) {
    await pg.transaction(tx => tx.exec(readFileSync(`supabase/migrations/${file}`, "utf8")));
  }
  await pg.exec(`
    insert into profiles (id, company_id, is_blocked) values
      ('${capo}', '${azienda}', false), ('${operaio}', '${azienda}', false), ('${geometra}', '${azienda}', false),
      ('${ufficio}', '${azienda}', false), ('${esterno}', '${altra}', false), ('${bloccato}', '${azienda}', true);
    update profiles set first_name = 'Giulia', last_name = 'Rossi' where id = '${geometra}';
    insert into user_roles values ('${capo}','employee'), ('${operaio}','employee'), ('${geometra}','company_staff'),
      ('${ufficio}','company_admin'), ('${esterno}','company_staff'), ('${bloccato}','employee');
    insert into orders values
      ('${ordine}','${azienda}',null,'C-18','Scuola','Via Roma','2026-11-12','2026-12-12',55),
      ('${secondo}','${azienda}',null,'C-19','Centro civico',null,null,null,0),
      ('${estraneo}','${altra}',null,'EST','Altro cantiere',null,null,null,0);
    insert into order_campo_assignments values
      ('${ordine}','${azienda}','${capo}','employee',true), ('${ordine}','${azienda}','${operaio}','employee',false),
      ('${secondo}','${azienda}','${bloccato}','employee',true);
    insert into order_work_phases values
      ('${fase}','${ordine}','${azienda}','Demolizione','completata',100,'Istruzioni interne','2026-11-12','2026-11-18','2026-11-20 13:00Z',0,1234),
      ('${fase2}','${ordine}','${azienda}','Posa','da_iniziare',0,null,'2026-11-23','2026-12-09',null,1,9876);
    insert into order_work_subphases values
      ('${id(20)}','${fase}','Rimozione pavimento',1,50,true,'2026-11-20 13:00Z',100,'2026-11-12','2026-11-18',5,false,2,'2026-11-13',4);
    insert into campo_rapportini values
      ('${ordine}','${azienda}','2026-11-11','2026-11-12','approvato','[{"phase_id":"${fase}"}]'),
      ('${ordine}','${azienda}','2026-11-13',null,'approvato','[{"phase_id":"${fase}","ore":5}]'),
      ('${ordine}','${azienda}','2026-11-18',null,'inviato','[{"phase_id":"${fase}"}]'),
      ('${ordine}','${azienda}','2026-11-20',null,'rifiutato','[{"phase_id":"${fase}"}]'),
      ('${ordine}','${azienda}','2026-11-22',null,'inviato','{}');
    insert into order_attachments (id, order_id, access_scope, stato_revisione, file_url, file_name, file_type, cantiere_tipo, revisione) values
      ('${id(30)}','${ordine}','operativo','approvato','orders/${ordine}/pos.pdf','POS approvato.pdf','application/pdf','pos','02'),
      ('${id(31)}','${ordine}','operativo',null,'${ordine}/tavola.pdf','Tavola.pdf','application/pdf','tavole',null),
      ('${id(32)}','${ordine}','costi','approvato','orders/${ordine}/costi.pdf','Costi.pdf','application/pdf','altro',null),
      ('${id(33)}','${ordine}','operativo','bozza','orders/${ordine}/bozza.pdf','Bozza.pdf','application/pdf','pos',null),
      ('${id(34)}','${secondo}','operativo','approvato','orders/${secondo}/altro.pdf','Altro.pdf','application/pdf','altro',null),
      ('${id(35)}','${ordine}','operativo','approvato','orders/${estraneo}/finto.pdf','Percorso non valido.pdf','application/pdf','altro',null),
      ('${id(36)}','${ordine}','operativo','approvato','orders/${ordine}/ufficio.pdf','Allegato generale.pdf','application/pdf',null,null);
    insert into storage.objects select file_url, 'order-attachments' from order_attachments;
    insert into storage.objects values ('orders/${ordine}/scollegato.pdf','order-attachments');
  `);
}, 15000);

afterAll(async () => { await pg.close(); });

const elenco = (persona: string, societa = azienda) => come<{ schede: unknown[] }>(persona,
  "select public.campo_cantieri_tecnici($1) as schede", [societa], societa);
const scheda = (persona: string, cantiere: string, sezione: string, societa = azienda) => come<{ scheda: Record<string, unknown> }>(
  persona, "select public.campo_scheda_cantiere($1,$2,$3) as scheda", [societa, cantiere, sezione], societa);
const abilita = (persona: string, destinatario: string, consenti: boolean) => come(
  persona, "select public.commessa_accesso_tecnico($1,$2,$3)", [ordine, destinatario, consenti]);

describe("Scheda tecnica di cantiere", () => {
  it("mostra al capocantiere il piano completo e traguardi reali senza quantità economiche", async () => {
    expect(await elenco(capo)).toMatchObject([{ schede: [{ id: ordine, codice: "C-18" }] }]);
    const [risultato] = await scheda(capo, ordine, "piano");
    expect(risultato.scheda).toMatchObject({
      cantiere: { codice: "C-18" },
      fasi: [
        { id: fase, primo: "2026-11-13", ultimo: "2026-11-18", sottofasi: [{ name: "Rimozione pavimento", giorni: 5 }] },
        { id: fase2, sottofasi: [] },
      ],
    });
    expect(JSON.stringify(risultato.scheda)).not.toMatch(/importo|1234|9876|"ore"/);
    await expect(scheda(capo, secondo, "piano")).rejects.toMatchObject({ code: "42501" });
    await expect(scheda(capo, ordine, "piano", altra)).rejects.toMatchObject({ code: "42501" });
  });

  it("limita la consultazione ai documenti approvati operativi della commessa e ai file registrati", async () => {
    const [risultato] = await scheda(capo, ordine, "documenti");
    expect(risultato.scheda.documenti).toMatchObject([
      { nome: "POS approvato.pdf", revisione: "02" }, { nome: "Tavola.pdf" },
    ]);
    const file = "select name from storage.objects order by name";
    expect(await come(capo, file)).toEqual([
      { name: `${ordine}/tavola.pdf` }, { name: `orders/${ordine}/pos.pdf` },
    ]);
    expect(await come(operaio, file)).toEqual([]);
    expect(await come(ufficio, "select name from storage.objects where name = $1", [`orders/${ordine}/costi.pdf`])).toHaveLength(1);
  });

  it("l’ufficio abilita e revoca la sola consultazione a un geometra della sua azienda", async () => {
    expect(await elenco(geometra)).toEqual([{ schede: [] }]);
    expect(await elenco(operaio)).toEqual([{ schede: [] }]);
    expect(await elenco(bloccato)).toEqual([{ schede: [] }]);
    await expect(scheda(operaio, ordine, "documenti")).rejects.toMatchObject({ code: "42501" });
    await expect(abilita(operaio, operaio, true)).rejects.toMatchObject({ code: "42501" });
    await expect(abilita(ufficio, esterno, true)).rejects.toMatchObject({ code: "22023" });
    await expect(abilita(ufficio, bloccato, true)).rejects.toMatchObject({ code: "22023" });

    await abilita(ufficio, geometra, true);
    await abilita(ufficio, geometra, true);
    const [lista] = await come<{ accessi: { id: string; abilitato: boolean }[] }>(ufficio,
      "select public.commessa_accessi_tecnici($1) as accessi", [ordine]);
    expect(lista.accessi.filter(p => p.abilitato)).toMatchObject([{ id: geometra, nome: "Giulia Rossi" }]);
    expect(await elenco(geometra)).toMatchObject([{ schede: [{ id: ordine }] }]);
    expect(await scheda(geometra, ordine, "piano")).toHaveLength(1);
    expect(await come(geometra, "select 1 from storage.objects")).toHaveLength(2);
    expect((await pg.query("select user_id from order_campo_assignments where user_id = $1", [geometra])).rows).toEqual([]);
    await expect(scheda(geometra, secondo, "documenti")).rejects.toMatchObject({ code: "42501" });

    await abilita(ufficio, geometra, false);
    expect(await elenco(geometra)).toEqual([{ schede: [] }]);
    expect(await come(geometra, "select 1 from storage.objects")).toEqual([]);
    await expect(scheda(geometra, ordine, "piano")).rejects.toMatchObject({ code: "42501" });
  });

  it("verifica ruolo e scadenza anche per chi lavora in più aziende", async () => {
    await pg.query("insert into multi_company_access values ($1, $2, 'company_staff', 'active', now() + interval '1 day')", [esterno, azienda]);
    const [lista] = await come(ufficio, "select public.commessa_accessi_tecnici($1) as accessi", [ordine]);
    expect(lista).toMatchObject({ accessi: expect.arrayContaining([{ id: esterno, ammissibile: true, abilitato: false, nome: "Utente interno" }]) });
    await abilita(ufficio, esterno, true);
    expect(await elenco(esterno)).toMatchObject([{ schede: [{ id: ordine }] }]);
    expect(await elenco(esterno, altra)).toEqual([{ schede: [] }]);
    await pg.query("update multi_company_access set access_role = 'subcontractor' where user_id = $1 and company_id = $2", [esterno, azienda]);
    expect(await elenco(esterno)).toEqual([{ schede: [] }]);
    await pg.query("update multi_company_access set access_role = 'company_staff', expires_at = now() where user_id = $1 and company_id = $2",
      [esterno, azienda]);
    await expect(scheda(esterno, ordine, "documenti")).rejects.toMatchObject({ code: "42501" });
    expect(await come(esterno, "select 1 from storage.objects")).toEqual([]);
  });

  it("il QR conserva la selezione dell’ufficio e l’app legge l’intero fascicolo autorizzato", async () => {
    const [{ token }] = await come<{ token: string }>(ufficio,
      "insert into commessa_qr_cantiere(order_id,documento_ids) values ($1, $2) returning token", [ordine, [id(30)]]);
    const leggiQr = () => pg.transaction(async tx => {
      await tx.exec("set local role service_role");
      return (await tx.query<{ docs: { documenti: { id: string }[] } }>("select leggi_qr_cantiere($1) as docs", [token])).rows[0];
    });
    const qr = await leggiQr();
    expect(qr.docs.documenti.map(doc => doc.id)).toEqual([id(30)]);
    const [app] = await scheda(capo, ordine, "documenti");
    expect(app.scheda.documenti).toHaveLength(2);
    await expect(come(capo, "select leggi_qr_cantiere($1)", [token])).rejects.toMatchObject({ code: "42501" });

    await pg.query("update order_attachments set stato_revisione = 'obsoleto' where id = $1", [id(30)]);
    expect((await leggiQr()).docs.documenti).toEqual([]);
    expect((await scheda(capo, ordine, "documenti"))[0].scheda.documenti).toHaveLength(1);
    expect(await come(capo, "select 1 from storage.objects where name = $1", [`orders/${ordine}/pos.pdf`])).toEqual([]);
  });
});
