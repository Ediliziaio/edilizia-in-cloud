import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';

const pilot = 'd2000000-0000-4000-a000-000000000002';
const otherCompany = '50000000-0000-4000-a000-000000000001';
const member = '50000000-0000-4000-a000-000000000002';
const outsider = '50000000-0000-4000-a000-000000000003';
const staff = '50000000-0000-4000-a000-000000000004';
const db = new PGlite();

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create schema storage;
    grant usage on schema auth, storage to anon, authenticated;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid stable language sql
      as $$select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid$$;
    create function auth.jwt() returns jsonb stable language sql
      as $$select coalesce(nullif(current_setting('request.jwt.claims', true),''), '{}')::jsonb$$;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    create function storage.foldername(name text) returns text[] immutable language sql
      as $$select string_to_array(name, '/')$$;
    alter table storage.objects enable row level security;
    grant select, insert, update, delete on storage.objects to anon, authenticated;
    create policy existing_storage_policy on storage.objects for all to public using (true) with check (true);
    create table public.companies (id uuid primary key, name text, status text);
    create table public.profiles (
      id uuid primary key references auth.users, company_id uuid references public.companies,
      first_name text, last_name text, is_blocked boolean default false, deleted_at timestamptz
    );
    create table public.user_roles (user_id uuid references auth.users, role text);
    create table public.staff_permissions (user_id uuid references auth.users, company_id uuid, can_manage_purchasing boolean);
    insert into public.companies values ('${pilot}', 'Demo Azienda 2 S.r.l.', 'active'), ('${otherCompany}', 'Altra azienda', 'active');
    insert into auth.users values ('${member}'), ('${outsider}'), ('${staff}');
    insert into public.profiles(id, company_id) values ('${member}', '${pilot}'), ('${outsider}', '${otherCompany}'), ('${staff}', '${pilot}');
    insert into public.user_roles values ('${member}','company_admin'), ('${outsider}','company_admin'), ('${staff}','company_staff');
    insert into storage.objects (bucket_id, name) values ('other-bucket','unchanged.txt');
    begin;
  `);
  const migration = await readFile(new URL('../supabase/migrations/20290528113200_gare_pilota_bozze.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec('commit');

  async function use(role, id = '', claims = '{}') {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)", [id, claims]);
    await db.exec(`set role ${role}`);
  }
  async function roleFor() {
    return (await db.query('select public.gare_pilot_role($1) as role', [pilot])).rows[0].role;
  }

  await use('authenticated', member);
  assert.equal(await roleFor(), null, 'the pilot is off by default');
  await use('postgres');
  await db.exec('update gare_private.pilot set enabled = true');
  await use('authenticated', member);
  assert.equal(await roleFor(), 'admin');

  const { rows: [{ id }] } = await db.query(
    "insert into public.gare_tenders (company_id, title, authority, territory) values ($1,'Gara sintetica','Ente','Lazio') returning id",
    [pilot],
  );
  const { rows: [{ id: participationId }] } = await db.query(
    "insert into public.gare_participations(company_id,tender_id,responsible) values ($1,$2,'Prova') returning id",
    [pilot, id],
  );
  await db.query("update public.gare_participations set stage = 'in_revisione' where id = $1", [participationId]);
  await assert.rejects(db.query("update public.gare_participations set stage = 'presentata' where id = $1", [participationId]));
  await assert.rejects(db.query("update public.gare_participations set stage = 'pronta' where id = $1", [participationId]));
  await assert.rejects(db.query("update public.gare_participations set outcome = 'Aggiudicata' where id = $1", [participationId]));
  await assert.rejects(db.query('select public.gare_record_submission($1,null,null,now(),null,1)', [participationId]), /permission denied/);
  await db.query("insert into storage.objects (bucket_id,name) values ('gare-private',$1)", [`${pilot}/bozza.pdf`]);
  await assert.rejects(db.query("insert into storage.objects (bucket_id,name) values ('gare-private',$1)", [`${otherCompany}/bozza.pdf`]));

  await use('authenticated', outsider);
  assert.equal(await roleFor(), null);
  assert.equal((await db.query('select id from public.gare_tenders')).rows.length, 0);
  assert.equal((await db.query("select id from storage.objects where bucket_id = 'gare-private'")).rows.length, 0);
  await assert.rejects(db.query("insert into public.gare_tenders (company_id,title,authority,territory) values ($1,'Gara negata','Ente','Lazio')", [pilot]));

  await use('anon');
  await assert.rejects(db.query('select public.gare_pilot_role($1)', [pilot]), /permission denied/);
  assert.equal((await db.query('select bucket_id from storage.objects')).rows[0].bucket_id, 'other-bucket');
  assert.equal((await db.query("select id from storage.objects where bucket_id='gare-private'")).rows.length, 0);

  await use('authenticated', member, '{"is_anonymous":true}');
  assert.equal(await roleFor(), null);
  await use('authenticated', staff);
  assert.equal(await roleFor(), null);
  await use('postgres');
  await db.query('insert into public.staff_permissions values ($1,$2,true)', [staff, pilot]);
  await use('authenticated', staff);
  assert.equal(await roleFor(), 'editor');
  await use('postgres');
  await db.query('update public.profiles set is_blocked = true where id = $1', [member]);
  await use('authenticated', member);
  assert.equal(await roleFor(), null);
  await use('postgres');
  await db.exec('update gare_private.pilot set enabled = false');
  await use('authenticated', staff);
  assert.equal(await roleFor(), null);
  assert.equal((await db.query('select id from public.gare_tenders')).rows.length, 0);
  console.log('Gare: migrazione, bozza, accesso aziendale, sospensione e storage verificati.');
} finally {
  await db.close();
}
