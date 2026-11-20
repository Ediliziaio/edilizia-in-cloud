import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const azienda = "70000000-0000-0000-0000-000000000001";
const altraAzienda = "70000000-0000-0000-0000-000000000002";
const cantiere = "80000000-0000-0000-0000-000000000001";
const capo = "90000000-0000-0000-0000-000000000001";
const operaio = "90000000-0000-0000-0000-000000000002";
const sospeso = "90000000-0000-0000-0000-000000000003";
const vocale = "60000000-0000-0000-0000-000000000001";
const giorno = "2026-11-20";

try {
  // Modello minimo isolato. Le funzioni native di Campo sono rappresentate
  // dalle interfacce che usa il worker, con ruoli e assegnazioni distinti.
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema private;
    grant usage on schema auth to service_role, authenticated;
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
    create table public.orders(id uuid primary key, company_id uuid not null, deleted_at timestamptz);
    create table public.whatsapp_messages(id uuid primary key, company_id uuid not null, direction text);
    alter table public.whatsapp_messages enable row level security;
    grant select, insert, update, delete on public.whatsapp_messages to authenticated;
    create policy regola_generica on public.whatsapp_messages for all to authenticated using (true) with check (true);
    create table public.campo_rapportini(order_id uuid not null, data_lavoro date not null, company_id uuid not null);
    grant select, insert on public.campo_rapportini to authenticated;
    create function public.campo_e_ufficio(uuid) returns boolean language sql as $$select false$$;
    create function public.has_permission_for_company(uuid, text, uuid) returns boolean language sql as $$select false$$;
    create function public.user_can_access_company(uuid) returns boolean language sql as
      $$select $1 = '${azienda}'::uuid and auth.uid() in ('${capo}'::uuid,'${operaio}'::uuid,'${sospeso}'::uuid)$$;
    create function public.utente_bloccato() returns boolean language sql as $$select auth.uid() = '${sospeso}'::uuid$$;
    create function public.utente_e_cliente_esterno() returns boolean language sql as $$select false$$;
    create function public.utente_sola_lettura(uuid) returns boolean language sql as $$select false$$;
    create function public.campo_lavoro_su_commessa(uuid) returns boolean language sql as $$select $1 = '${cantiere}'::uuid$$;
    create function private.office_visible_order(uuid) returns boolean language sql as $$select $1 = '${cantiere}'::uuid$$;
    create function public.campo_mio_ruolo(uuid) returns jsonb language sql as $$
      select jsonb_build_object('caposquadra', auth.uid() = '${capo}'::uuid, 'esiste_capo', true)$$;
    create function public.campo_regole_per_ordine(uuid) returns jsonb language sql as
      $$select '{"chi_compila":"capo","giorni_indietro_rapportino":5}'::jsonb$$;
    create function public.campo_squadra_rapportino(uuid, date) returns jsonb language sql as $$
      select jsonb_build_array(jsonb_build_object('user_id',auth.uid(),'sono_io',true))$$;
    insert into public.orders values ('${cantiere}','${azienda}',null);
    insert into public.whatsapp_messages values ('${vocale}','${azienda}','inbound');
  `);
  const migrazione = await readFile(new URL("../supabase/migrations/20290422230000_whatsapp_rapportini_squadra.sql", import.meta.url), "utf8");
  await db.exec(`begin; ${migrazione} commit; begin; ${migrazione} commit;`);

  await db.exec("set role authenticated;");
  const leggi = (utente, tenant = azienda) => db.query(
    "select public.whatsapp_contesto_rapportino($1,$2,$3,$4) as risposta", [tenant, utente, cantiere, giorno],
  );
  await assert.rejects(leggi(capo), /permission denied/);
  await assert.rejects(db.query("insert into whatsapp_messages values ($1,$2,'inbound')", [vocale, azienda]), /permission denied/);
  await assert.rejects(db.query("insert into campo_rapportini(order_id,data_lavoro,company_id,whatsapp_message_id) values ($1,$2,$3,$4)", [cantiere, giorno, azienda, vocale]), /Provenienza WhatsApp riservata/);

  await db.exec("set role service_role;");
  const permesso = (await leggi(capo)).rows[0].risposta;
  assert.equal(permesso.persone[0].user_id, capo);
  assert.equal(permesso.giorni_indietro, 5);
  assert.equal(permesso.solo_timbratura, false);
  const oreProprie = (await leggi(operaio)).rows[0].risposta;
  assert.deepEqual(oreProprie.persone, []);
  assert.equal(oreProprie.solo_timbratura, true);
  await assert.rejects(leggi(sospeso), /Permessi/);
  await assert.rejects(leggi(capo, altraAzienda), /Commessa non disponibile/);
  assert.equal((await db.query("select auth.uid() as utente")).rows[0].utente, null);
  await db.exec(`begin;
    select set_config('request.jwt.claims', '{"role":"service_role"}', true),
           set_config('request.jwt.claim.role', 'service_role', true);
    savepoint prima;
  `);
  await leggi(capo);
  const contesto = "select auth.uid() as utente, current_setting('request.jwt.claims')::jsonb as claims, current_setting('request.jwt.claim.role') as ruolo";
  const atteso = { utente: null, claims: { role: "service_role" }, ruolo: "service_role" };
  assert.deepEqual((await db.query(contesto)).rows[0], atteso);
  await assert.rejects(leggi(sospeso), /Permessi/);
  await db.exec("rollback to prima;");
  assert.deepEqual((await db.query(contesto)).rows[0], atteso);
  await db.exec("rollback;");

  await db.exec("reset role;");
  const scrivi = () => db.query(
    "insert into public.campo_rapportini(order_id,data_lavoro,company_id,whatsapp_message_id) values ($1,$2,$3,$4)", [cantiere, giorno, azienda, vocale],
  );
  await scrivi();
  await assert.rejects(scrivi(), /campo_rapportini_messaggio_whatsapp/);
  console.log("Migrazione verificata due volte. Contesto squadra, sola timbratura, isolamento, revoca e univocità del vocale verificati.");
} finally {
  await db.close();
}
