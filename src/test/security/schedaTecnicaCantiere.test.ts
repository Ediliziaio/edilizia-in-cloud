import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const pg = new PGlite();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [azienda, altra, ordine, secondo, estraneo, capo, operaio, geometra, ufficio, esterno, bloccato, fase, fase2] =
  Array.from({ length: 13 }, (_, i) => id(i + 1));
const migrazione = (nome: string) => readFileSync(`supabase/migrations/${nome}.sql`, "utf8");

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

    create table profiles (id uuid primary key, company_id uuid, is_blocked boolean, first_name text, last_name text, solo_lettura boolean default false);
    create type public.app_role as enum ('employee', 'company_staff', 'company_admin', 'customer', 'subcontractor', 'super_admin');
    create table user_roles(user_id uuid, role public.app_role);
    create table multi_company_access(user_id uuid, company_id uuid, access_role text, status text, expires_at timestamptz,
      primary key (user_id, company_id));
    create function public.has_role(p uuid, r public.app_role) returns boolean language sql stable as
    $$ select exists (select 1 from public.user_roles where user_id = p and role = r) $$;
    create function public.get_my_company_id() returns uuid language sql stable as
    $$ select company_id from public.profiles where id = auth.uid() $$;
    create function public.utente_bloccato() returns boolean language sql stable as
    $$ select coalesce((select is_blocked from public.profiles where id = auth.uid()), true) $$;
    create function public.utente_e_cliente_esterno() returns boolean language sql stable as
    $$ select public.has_role(auth.uid(), 'customer') $$;
    create function public.e_solo_campo() returns boolean language sql stable as
    $$ select not public.has_role(auth.uid(), 'company_admin') and not public.has_role(auth.uid(), 'company_staff') $$;
    create function public.utente_sola_lettura(uuid) returns boolean language sql stable as
    $$ select coalesce((select solo_lettura from public.profiles where id = auth.uid()), false) $$;
    create function public.has_permission_for_company(p uuid, r text, c uuid) returns boolean language sql stable as
    $$ select r in ('can_edit_orders','can_view_orders','can_view_sopralluoghi') and public.has_role(p, 'company_admin') and exists(select 1 from public.profiles where id = p and company_id = c) $$;
    create function public.aziende_con_permesso(r text) returns uuid[] language sql stable as
    $$ select array(select company_id from public.profiles where id = auth.uid() and public.has_permission_for_company(auth.uid(), r, company_id)) $$;
    create function public.e_amministratore_di(c uuid) returns boolean language sql stable as
    $$ select public.has_permission_for_company(auth.uid(), 'can_edit_orders', c) $$;
    create function public.can_access_company_people(c uuid) returns boolean language sql stable as
    $$ select exists(select 1 from public.profiles where id = auth.uid() and company_id = c) $$;

    create table orders (
      id uuid primary key, company_id uuid not null, deleted_at timestamptz,
      order_code text, description text, indirizzo_lavori text, work_start_date date, work_end_date date, percentuale_avanzamento numeric,
      customer_id uuid, work_address text
    );
    create table order_campo_assignments (order_id uuid, company_id uuid, user_id uuid, role_type text, is_capocantiere boolean);
    create table order_work_phases (
      id uuid primary key, order_id uuid, company_id uuid, name text, status text, percentuale numeric, notes text,
      start_date date, end_date date, completata_il timestamptz, position int, importo_venduto numeric,
      completata_da uuid, updated_at timestamptz
    );
    create table order_work_subphases (
      id uuid primary key, phase_id uuid, name text, position int, peso int, fatta boolean, fatta_il timestamptz,
      percentuale numeric, data_inizio date, data_fine date, giorni int, in_parallelo boolean, risorse int,
      iniziata_il date, giorni_lavorati int, fatta_da uuid, updated_at timestamptz
    );
    create table order_work_phase_voci (order_id uuid, subphase_id uuid, quantita numeric, unita text, importo numeric);
    create table company_fasi_settings (company_id uuid primary key, chi_spunta text, updated_at timestamptz);
    create function public.user_assigned_to_order(o uuid) returns boolean language sql stable security definer as
    $$ select exists(select 1 from public.order_campo_assignments a where a.order_id = o and a.user_id = auth.uid()) $$;
    create table order_employees (order_id uuid, employee_id uuid);
    create table employees (id uuid, user_id uuid);
    create table commessa_campo_sync (order_id uuid primary key, company_id uuid, revisione bigint default 1, aggiornato_il timestamptz);
    create table survey_templates (id uuid primary key, category text, name text, is_system boolean, is_active boolean, schema jsonb);
    create table surveys (
      id uuid primary key, company_id uuid, order_id uuid, client_id uuid, technician_id uuid, created_by uuid,
      template_id uuid references survey_templates(id), mode text, status text, header_data jsonb,
      address text, notes text, completed_at timestamptz, code text, deleted_at timestamptz, client_signature_at timestamptz,
      unique (company_id, code)
    );
    create table survey_activity_log (survey_id uuid references surveys(id), user_id uuid, event_type text, event_data jsonb);
    create table survey_assignees (survey_id uuid, user_id uuid, field_authorized boolean, role text);
    create table survey_areas (id uuid primary key, survey_id uuid);
    create table survey_elements (id uuid primary key, survey_id uuid, area_id uuid);
    create table survey_media (
      id uuid primary key default gen_random_uuid(), survey_id uuid references surveys(id), type text, storage_path text,
      url text, position integer, filename text, mime_type text, created_by uuid, area_id uuid, element_id uuid
    );
    create table campo_rapportini (
      order_id uuid, company_id uuid, data_lavoro date, annullato_at timestamptz, stato text, fasi_lavorate jsonb
    );
    create table order_attachments (
      id uuid primary key, order_id uuid, access_scope text, stato_revisione text, file_url text, file_name text,
      file_type text, cantiere_tipo text, revisione text, file_size bigint
    );
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (name text, bucket_id text, owner_id text, primary key (bucket_id, name));
    alter table storage.objects enable row level security;
    grant select, insert, update, delete on storage.objects to authenticated;
    create policy test_survey_read on storage.objects for select to authenticated using (bucket_id = 'surveys');
    create policy test_survey_upload on storage.objects for insert to authenticated with check (bucket_id = 'surveys');
    create policy test_survey_update on storage.objects for update to authenticated using (bucket_id = 'surveys');
    create function private.office_visible_order(p uuid) returns boolean language sql stable security definer set search_path = ''
    as $$ select exists(select 1 from public.orders o where o.id = p and public.has_permission_for_company(auth.uid(), 'can_edit_orders', o.company_id)) $$;
    create function private.office_attachment_file_allowed(b text, n text) returns boolean language sql stable security definer set search_path = ''
    as $$ select b = 'order-attachments' and exists(select 1 from public.order_attachments a where a.file_url = n and private.office_visible_order(a.order_id)) $$;
    create policy ufficio_vede_file on storage.objects for select to authenticated
      using (private.office_attachment_file_allowed(bucket_id,name));
    create policy office_attachment_file_read on storage.objects as restrictive for select to authenticated
      using (private.office_attachment_file_allowed(bucket_id,name));
  `);

  const faseSql = migrazione("20281007130000_sottofasi_commessa");
  const sottofaseSql = migrazione("20281207100000_avanzamento_della_sottofase");
  const quantitaSql = migrazione("20281213150000_rapportino_revoca_sicura");
  const faseDipendenze = [
    faseSql.slice(faseSql.indexOf("create or replace function public.fase_avanzamento_derivato"), faseSql.indexOf("create or replace function public.sottofase_guardia")),
    sottofaseSql.slice(0, sottofaseSql.indexOf("-- Una voce diventa sottofase")),
    quantitaSql.slice(quantitaSql.indexOf("create or replace function public.sottofase_quantita_totale"), quantitaSql.indexOf("-- Approvazione:")),
    quantitaSql.slice(quantitaSql.indexOf("create or replace function public.campo_quantita_sottofasi")),
    migrazione("20260710035300_order_progress_rollup"),
  ];
  for (const sql of faseDipendenze) await pg.transaction(tx => tx.exec(sql));
  const sync = migrazione("20281028022000_commessa_campo_sync_transazionale");
  await pg.exec(sync.slice(sync.indexOf("create or replace function public.commessa_campo_segnala_modifica"), sync.indexOf("drop trigger if exists commessa_campo_sync_rapportino")));
  await pg.exec(migrazione("20281005210000_surveys_codice_vede_tutti_i_sopralluoghi"));
  await pg.exec(`
    create trigger codice_rilievo before insert on surveys for each row execute function public.generate_survey_code();
    create trigger sottofase_guardia before insert or update on order_work_subphases for each row execute function public.sottofase_guardia();
  `);
  for (const file of ["20290422161000_documenti_qr_cantiere", "20290506173000_scheda_tecnica_cantiere", "20290506174000_attivita_tecniche_cantiere"]) {
    await pg.transaction(tx => tx.exec(migrazione(file)));
  }
  const surveyGuard = migrazione("20281028052100_sopralluoghi_campo_autorizzati");
  await pg.exec(surveyGuard.slice(surveyGuard.indexOf("create schema if not exists survey_private;"), surveyGuard.indexOf("alter table public.survey_assignees")));
  await pg.exec(surveyGuard.slice(surveyGuard.indexOf("create or replace function survey_private.field_actor"), surveyGuard.indexOf("-- Restrictive policies")));
  await pg.exec(surveyGuard.slice(surveyGuard.lastIndexOf("do $$", surveyGuard.indexOf("drop policy if exists field_surveys_")),
    surveyGuard.indexOf("create or replace function survey_private.guard_assignment")));
  await pg.exec(surveyGuard.slice(surveyGuard.indexOf("create or replace function survey_private.guard_child"),
    surveyGuard.indexOf("create or replace function public.survey_field_access")));
  await pg.transaction(tx => tx.exec(migrazione("20290506175000_invii_tecnici_offline")));
  // La ripetizione mantiene le stesse protezioni e non duplica bucket e trigger.
  for (const file of ["20290506174000_attivita_tecniche_cantiere", "20290506175000_invii_tecnici_offline"]) {
    await pg.transaction(tx => tx.exec(migrazione(file)));
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
    insert into storage.objects (name, bucket_id) select file_url, 'order-attachments' from order_attachments;
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
const abilitaRilievi = (persona: string, destinatario: string, consenti: boolean) => come(
  persona, "select public.commessa_permesso_rilievi($1,$2,$3)", [ordine, destinatario, consenti]);
const registraFase = (persona: string, args: unknown[]) => come(persona,
  "select public.campo_registra_avanzamento($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as id", args);
const registraVisita = (persona: string, cantiere: string, idVisita: string, tipo: string, misure: string | null, note: string | null) => come(persona,
  "select public.campo_registra_rilievo($1,$2,$3,$4,date '2025-01-19',$5,$6) as id",
  [azienda, cantiere, idVisita, tipo, misure, note]);

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
    expect(lista).toMatchObject({ accessi: expect.arrayContaining([{ id: esterno, ammissibile: true, abilitato: false,
      nome: "Utente interno", registra_rilievi: false }]) });
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

describe("Operazioni dalla scheda", () => {
  it("salva solo la fase del capocantiere e conferma il ritentativo senza riscrivere", async () => {
    const foto = `${azienda}/${ordine}/${capo}/${id(61)}/${id(62)}.jpg`;
    const args = [azienda, ordine, fase2, null, id(61), 35, 0, null, "Consegna verificata", [foto]];
    const leggiFoto = (persona: string) => come(persona, "select name from storage.objects where name = $1", [foto]);
    const caricaFoto = (persona: string, percorso: string) => come(persona,
      "insert into storage.objects values ($1,'campo-avanzamenti',$2)", [percorso, persona]);
    await abilita(ufficio, geometra, true);
    try {
      await expect(registraFase(operaio, args)).rejects.toMatchObject({ code: "42501" });
      await expect(registraFase(geometra, args)).rejects.toMatchObject({ code: "42501" });
      await expect(registraFase(capo, [azienda, secondo, ...args.slice(2)])).rejects.toMatchObject({ code: "42501" });
      await expect(registraFase(capo, args)).rejects.toMatchObject({ code: "22023" }); // Prima di caricare la foto.
      expect((await pg.query("select percentuale from order_work_phases where id = $1", [fase2])).rows).toEqual([{ percentuale: "0" }]);

      await expect(caricaFoto(capo, foto.replace(ordine, secondo))).rejects.toMatchObject({ code: "42501" });
      await expect(caricaFoto(geometra, foto.replace(capo, geometra))).rejects.toMatchObject({ code: "42501" });
      await caricaFoto(capo, foto);
      expect(await leggiFoto(geometra)).toEqual([]);
      expect(await registraFase(capo, args)).toEqual([{ id: id(61) }]);
      expect(await registraFase(capo, args)).toEqual([{ id: id(61) }]);
      const [risultato] = await scheda(capo, ordine, "piano");
      expect(risultato.scheda).toMatchObject({ permessi: { aggiorna_fasi: true, registra_rilievi: false },
        cantiere: { progresso: 68 }, fasi: [{ id: fase }, { id: fase2, status: "in_corso", percentuale: 35 }] });
      expect(await come(ufficio, "select campo_avanzamenti_cantiere($1,$2,$3) as registro", [azienda, ordine, fase2]))
        .toMatchObject([{ registro: [{ id: id(61), note: "Consegna verificata", foto: [foto], percentuale: 35 }] }]);
      expect(await leggiFoto(geometra)).toEqual([{ name: foto }]);
      expect(await leggiFoto(operaio)).toEqual([]);
      expect(await come(capo, "delete from storage.objects where name = $1 returning name", [foto])).toEqual([]);
      await expect(registraFase(capo, [azienda, ordine, fase2, null, id(63), 50, 0, null, null, []]))
        .rejects.toMatchObject({ code: "PT409", detail: "avanzamento-cambiato" });
      await expect(registraFase(capo, [azienda, ordine, fase2, id(20), id(64), 20, 0, null, null, []]))
        .rejects.toMatchObject({ code: "42501" });
      await expect(come(geometra, "select campo_avanzamenti_cantiere($1,$2,$3)", [azienda, secondo, fase2]))
        .rejects.toMatchObject({ code: "42501" });
    } finally {
      await abilita(ufficio, geometra, false);
    }
    expect(await leggiFoto(geometra)).toEqual([]);
  });

  it("rispetta l’avanzamento calcolato dalle sottofasi e le unità della distinta", async () => {
    await pg.query("insert into order_work_phase_voci values ($1,$2,20,'m',1000)", [ordine, id(20)]);
    const [prima] = await scheda(capo, ordine, "piano");
    expect(prima.scheda.misure).toEqual({ [id(20)]: { unita: "m", totale: 20, eseguita: 20 } });
    await expect(registraFase(capo, [azienda, ordine, fase, null, id(65), 30, 100, null, null, []]))
      .rejects.toMatchObject({ code: "22023" });
    expect(await registraFase(capo, [azienda, ordine, fase, id(20), id(66), 8, 20, 20, "Posati 8 m", []]))
      .toEqual([{ id: id(66) }]);
    expect((await scheda(capo, ordine, "piano"))[0].scheda).toMatchObject({
      cantiere: { progresso: 38 },
      fasi: [{ id: fase, status: "in_corso", percentuale: 40, sottofasi: [{ percentuale: 40, fatta: false }] }, { id: fase2 }],
      misure: { [id(20)]: { eseguita: 8 } },
    });
    await pg.query("update profiles set solo_lettura = true where id = $1", [capo]);
    try {
      await expect(registraFase(capo, [azienda, ordine, fase, id(20), id(67), 20, 8, 20, null, []]))
        .rejects.toMatchObject({ code: "42501" });
    } finally {
      await pg.query("update profiles set solo_lettura = false where id = $1", [capo]);
    }
  });

  it("registra rilievi e sopralluoghi nel registro esistente con il permesso per commessa", async () => {
    await expect(abilitaRilievi(ufficio, geometra, true)).rejects.toMatchObject({ code: "22023" });
    await abilita(ufficio, geometra, true);
    try {
      await expect(registraVisita(geometra, ordine, id(70), "rilievo", "Vano 120 × 150 cm", null))
        .rejects.toMatchObject({ code: "42501" });
      await expect(abilitaRilievi(geometra, geometra, true)).rejects.toMatchObject({ code: "42501" });
      await abilitaRilievi(ufficio, geometra, true);
      expect((await scheda(geometra, ordine, "piano"))[0].scheda).toMatchObject({
        permessi: { aggiorna_fasi: false, registra_rilievi: true }, misure: {},
      });
      await expect(registraVisita(geometra, secondo, id(70), "rilievo", "Vano 120 × 150 cm", null))
        .rejects.toMatchObject({ code: "42501" });
      await expect(registraVisita(capo, ordine, id(70), "rilievo", "Vano 120 × 150 cm", null))
        .rejects.toMatchObject({ code: "42501" });
      await expect(registraVisita(geometra, ordine, id(70), "rilievo", "", null))
        .rejects.toMatchObject({ code: "22023" });
      expect(await registraVisita(geometra, ordine, id(70), "rilievo", "Vano 120 × 150 cm", null)).toEqual([{ id: id(70) }]);
      expect(await registraVisita(geometra, ordine, id(70), "rilievo", "Vano 120 × 150 cm", null)).toHaveLength(1);
      expect(await registraVisita(geometra, ordine, id(71), "sopralluogo", null, "Verificati gli accessi")).toEqual([{ id: id(71) }]);
      expect(await come(geometra, "select campo_rilievi_cantiere($1,$2) as visite", [azienda, ordine])).toMatchObject([
        { visite: [{ misure: "Vano 120 × 150 cm", tipo: "rilievo", giorno: "2025-01-19" }, { note: "Verificati gli accessi", tipo: "sopralluogo" }] },
      ]);
      expect((await pg.query("select status, technician_id, order_id, code from surveys order by code")).rows)
        .toMatchObject(Array.from({ length: 2 }, () => ({ status: "completed", technician_id: geometra, order_id: ordine, code: expect.stringMatching(/^SOP-/) })));
      await abilitaRilievi(ufficio, geometra, false);
      expect((await scheda(geometra, ordine, "piano"))[0].scheda).toMatchObject({ permessi: { registra_rilievi: false } });
      await expect(come(geometra, "select campo_rilievi_cantiere($1,$2)", [azienda, ordine])).rejects.toMatchObject({ code: "42501" });
    } finally {
      await abilita(ufficio, geometra, false);
    }
  });
});

describe("Invii tecnici dopo la riconnessione", () => {
  const statoInvio = (persona: string, operazione: string, tipo: string, faseId?: string, cantiere = ordine, autore = persona) => come(
    persona, "select campo_stato_invio_tecnico($1,$2,$3,$4,$5,$6,null) as inviato",
    [azienda, cantiere, operazione, autore, tipo, faseId ?? null],
  );

  it("riconosce l’aggiornamento già registrato e controlla fase, autore e permesso prima delle foto", async () => {
    const op = id(80);
    const [iniziale] = (await pg.query<{ percentuale: string }>("select percentuale from order_work_phases where id = $1", [fase2])).rows;
    const scrivi = (autore: string, valore: number) => come(capo,
      "select campo_invia_avanzamento($1,$2,$3,null,$4,$5,$6,$7,null,'Dal telefono',array[]::text[]) as id",
      [azienda, ordine, fase2, op, autore, valore, Number(iniziale.percentuale)]);
    await expect(statoInvio(capo, op, "avanzamento", fase2, secondo)).rejects.toMatchObject({ code: "42501" });
    await expect(statoInvio(operaio, op, "avanzamento", fase2)).rejects.toMatchObject({ code: "42501" });
    await expect(scrivi(operaio, 50)).rejects.toMatchObject({ code: "PT409" });
    expect(await statoInvio(capo, op, "avanzamento", fase2)).toEqual([{ inviato: false }]);
    expect(await scrivi(capo, 50)).toEqual([{ id: op }]);
    expect(await scrivi(capo, 60)).toEqual([{ id: op }]);
    expect(await statoInvio(capo, op, "avanzamento", fase2)).toEqual([{ inviato: true }]);
    expect((await pg.query("select percentuale from order_work_phases where id = $1", [fase2])).rows).toEqual([{ percentuale: "50" }]);
  });

  it("pubblica visita e foto una volta sola e conserva il controllo dei permessi dopo la revoca", async () => {
    const op = id(81);
    const foto = `${azienda}/${op}/visite-campo/${ordine}/${geometra}/${id(82)}.jpg`;
    const altraFoto = foto.replace(id(82), id(83));
    const inserisci = (persona: string, percorso: string) => come(persona,
      "insert into storage.objects values ($1,'surveys',$2)", [percorso, persona]);
    const leggi = (persona: string) => come(persona, "select name from storage.objects where name = $1", [foto]);
    const registra = (fotoVisita: string[], autore = geometra) => come(geometra,
      "select campo_registra_visita_con_foto($1,$2,$3,$4,'rilievo',date '2025-01-19','120 cm',null,$5) as id",
      [azienda, ordine, op, autore, fotoVisita]);
    await abilita(ufficio, geometra, true);
    await abilitaRilievi(ufficio, geometra, true);
    // Il geometra può portare anche un ruolo di campo. Esercita il trigger reale.
    await pg.query("insert into user_roles values ($1, 'employee')", [geometra]);
    try {
      await expect(statoInvio(geometra, op, "rilievo", undefined, secondo)).rejects.toMatchObject({ code: "42501" });
      await expect(registra([foto], operaio)).rejects.toMatchObject({ code: "PT409" });
      await expect(inserisci(operaio, foto)).rejects.toMatchObject({ code: "42501" });
      await expect(inserisci(geometra, foto.replace(ordine, secondo))).rejects.toMatchObject({ code: "42501" });
      await expect(registra([foto])).rejects.toMatchObject({ code: "22023" });
      expect(await statoInvio(geometra, op, "rilievo")).toEqual([{ inviato: false }]);
      await inserisci(geometra, foto);
      expect(await leggi(geometra)).toEqual([{ name: foto }]);
      expect(await leggi(ufficio)).toEqual([]);
      await expect(registra([foto, altraFoto])).rejects.toMatchObject({ code: "22023" });
      expect((await pg.query("select id from surveys where id=$1", [op])).rows).toEqual([]);
      await inserisci(geometra, altraFoto);
      expect(await registra([foto, altraFoto])).toEqual([{ id: op }]);
      expect(await registra([foto, altraFoto])).toEqual([{ id: op }]);
      expect(await statoInvio(geometra, op, "rilievo")).toEqual([{ inviato: true }]);
      expect((await pg.query("select storage_path from survey_media where survey_id=$1 order by position", [op])).rows)
        .toEqual([{ storage_path: foto }, { storage_path: altraFoto }]);
      expect(await leggi(ufficio)).toEqual([{ name: foto }]);
      expect(await leggi(operaio)).toEqual([]);
      expect(await come(geometra, "select campo_rilievi_cantiere($1,$2) as visite", [azienda, ordine])).toMatchObject([
        { visite: expect.arrayContaining([{ id: op, foto: [foto, altraFoto], misure: "120 cm", tipo: "rilievo",
          giorno: "2025-01-19", codice: expect.any(String), note: null }]) },
      ]);
      await abilitaRilievi(ufficio, geometra, false);
      await expect(statoInvio(geometra, op, "rilievo")).rejects.toMatchObject({ code: "42501" });
      await expect(registra([foto])).rejects.toMatchObject({ code: "42501" });
      expect(await leggi(geometra)).toEqual([]);
    } finally {
      await pg.query("delete from user_roles where user_id=$1 and role='employee'", [geometra]);
      await abilitaRilievi(ufficio, geometra, false);
    }
  });
});
