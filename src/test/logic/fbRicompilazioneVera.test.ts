/**
 * «Ha compilato di nuovo il modulo Meta» solo se il lead è nuovo (12/11/2026).
 *
 * Renova Solution: dal 9 novembre il token della pagina Facebook non
 * funzionava più e per due giorni non è entrato un lead. Ricollegati i moduli,
 * il recupero ne ha riportati 7 — e a tutti e 7 è comparso in cronologia «Ha
 * compilato di nuovo il modulo Meta», con il flusso Facebook iscritto una
 * seconda volta. Nessuno aveva ricompilato niente: il recupero crea il
 * contatto per la sua strada e lo stesso lead passa poi anche dalla coda degli
 * eventi; al secondo giro il contatto esiste già, parte
 * `facebook_lead_updated`, e il trigger lo prendeva per una ricompilazione.
 * Nelle 7 attività il leadgen_id era identico a quello del primo passaggio.
 *
 * La prova gira sul motore PostgreSQL vero, perché la regola sta in un trigger.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";

const AZIENDA = "00000000-0000-0000-0000-0000000000a1";
const CONTATTO = "00000000-0000-0000-0000-0000000000c1";
const LEAD_VECCHIO = "111111111111111";
const LEAD_NUOVO = "222222222222222";

let db: PGlite;

/** La migrazione viva, cercata per nome: se la rinominano, il test lo dice. */
function migrazione(): string {
  const file = readdirSync("supabase/migrations")
    .filter((f) => f.endsWith("_fb_ricompilazione_vera_solo_lead_nuovo.sql"));
  if (file.length !== 1) throw new Error(`attesa una migrazione, trovate ${file.length}`);
  return readFileSync(`supabase/migrations/${file[0]}`, "utf8");
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon;
    create table automation_trigger_events (
      id uuid primary key default gen_random_uuid(),
      company_id uuid not null,
      trigger_event text not null,
      entity_id text,
      entity_type text,
      payload jsonb,
      processed boolean not null default false,
      created_at timestamptz not null default now()
    );
    create table marketing_contact_activities (
      id uuid primary key default gen_random_uuid(),
      contact_id uuid not null,
      company_id uuid not null,
      activity_type text,
      description text,
      metadata jsonb,
      created_at timestamptz not null default now()
    );
    -- Il trigger in produzione esiste già: qui si ricrea com'è, perché la
    -- migrazione sostituisce solo il corpo della funzione e controlla che
    -- l'aggancio ci sia.
    create function fb_repeat_lead_reentry() returns trigger language plpgsql as $$begin return new; end$$;
    create trigger trg_fb_repeat_lead_reentry after insert on automation_trigger_events
      for each row when (new.trigger_event = 'facebook_lead_updated')
      execute function fb_repeat_lead_reentry();
  `);
  await db.exec(migrazione());
}, 60000);

afterAll(async () => db?.close());

beforeEach(async () => {
  await db.exec("begin");
  // Il primo passaggio del lead: il contatto è nato e l'evento è passato.
  await db.query(
    `insert into automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload)
     values ($1,'facebook_lead_received',$2,'contact', jsonb_build_object('leadgen_id',$3::text,'is_new_contact',true))`,
    [AZIENDA, CONTATTO, LEAD_VECCHIO],
  );
});

afterEach(async () => {
  await db.exec("rollback");
});

/** Inserisce un `facebook_lead_updated` e dice cosa ne è venuto. */
async function aggiornamento(leadgen: string | null) {
  await db.query(
    `insert into automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload)
     values ($1,'facebook_lead_updated',$2,'contact',$3::jsonb)`,
    [AZIENDA, CONTATTO, JSON.stringify(leadgen === null ? {} : { leadgen_id: leadgen })],
  );
  const attivita = await db.query<{ n: string }>(
    `select count(*)::text n from marketing_contact_activities where metadata->>'repeat'='true'`,
  );
  const rientri = await db.query<{ n: string }>(
    `select count(*)::text n from automation_trigger_events
      where trigger_event='facebook_lead_received' and (payload->>'repeat_submission')::boolean`,
  );
  return { attivita: Number(attivita.rows[0].n), rientri: Number(rientri.rows[0].n) };
}

describe("lo stesso lead lavorato due volte non è una ricompilazione", () => {
  it("non scrive «ha compilato di nuovo» in cronologia", async () => {
    expect((await aggiornamento(LEAD_VECCHIO)).attivita).toBe(0);
  });

  it("non fa ripartire il flusso Facebook", async () => {
    expect((await aggiornamento(LEAD_VECCHIO)).rientri).toBe(0);
  });

  it("vale anche al terzo passaggio dello stesso lead", async () => {
    await aggiornamento(LEAD_VECCHIO);
    expect(await aggiornamento(LEAD_VECCHIO)).toEqual({ attivita: 0, rientri: 0 });
  });
});

describe("una ricompilazione vera continua a funzionare", () => {
  it("un leadgen_id mai visto scrive l'attività e fa ripartire il flusso", async () => {
    expect(await aggiornamento(LEAD_NUOVO)).toEqual({ attivita: 1, rientri: 1 });
  });

  it("il rientro porta repeat_submission e is_new_contact a false", async () => {
    await aggiornamento(LEAD_NUOVO);
    const r = await db.query<{ repeat: boolean; nuovo: boolean; lead: string }>(
      `select (payload->>'repeat_submission')::boolean repeat,
              (payload->>'is_new_contact')::boolean nuovo,
              payload->>'leadgen_id' lead
         from automation_trigger_events
        where trigger_event='facebook_lead_received' and (payload->>'repeat_submission')::boolean`,
    );
    expect(r.rows[0]).toEqual({ repeat: true, nuovo: false, lead: LEAD_NUOVO });
  });

  it("il rientro che il trigger stesso emette non blocca la ricompilazione dopo", async () => {
    await aggiornamento(LEAD_NUOVO);               // rientro con repeat_submission
    const terzo = "333333333333333";
    expect((await aggiornamento(terzo)).attivita).toBe(2);
  });

  it("un contatto diverso non si porta dietro i lead di un altro", async () => {
    const altro = "00000000-0000-0000-0000-0000000000c2";
    await db.query(
      `insert into automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload)
       values ($1,'facebook_lead_updated',$2,'contact', jsonb_build_object('leadgen_id',$3::text))`,
      [AZIENDA, altro, LEAD_VECCHIO],
    );
    const r = await db.query<{ n: string }>(
      `select count(*)::text n from marketing_contact_activities where contact_id=$1`, [altro],
    );
    expect(Number(r.rows[0].n)).toBe(1);
  });

  it("la stessa azienda non blocca il lead di un'altra", async () => {
    const altraAzienda = "00000000-0000-0000-0000-0000000000a2";
    await db.query(
      `insert into automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload)
       values ($1,'facebook_lead_updated',$2,'contact', jsonb_build_object('leadgen_id',$3::text))`,
      [altraAzienda, CONTATTO, LEAD_VECCHIO],
    );
    const r = await db.query<{ n: string }>(
      `select count(*)::text n from marketing_contact_activities where company_id=$1`, [altraAzienda],
    );
    expect(Number(r.rows[0].n)).toBe(1);
  });
});

describe("senza leadgen_id non si può dimostrare niente", () => {
  it("si tiene il comportamento di prima: meglio un'attività di troppo che una ricompilazione persa", async () => {
    expect((await aggiornamento(null)).attivita).toBe(1);
  });
});

describe("la funzione resta chiusa", () => {
  it("anon non può eseguirla", async () => {
    const r = await db.query<{ acl: string | null }>(
      `select array_to_string(proacl,',') acl from pg_proc where proname='fb_repeat_lead_reentry'`,
    );
    expect(r.rows[0].acl ?? "").not.toMatch(/\banon=/);
  });
});
