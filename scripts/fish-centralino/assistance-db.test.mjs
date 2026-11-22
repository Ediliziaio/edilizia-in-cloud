import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const A = "11111111-1111-4111-8111-111111111111",
  B = "22222222-2222-4222-8222-222222222222",
  AG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  CAL = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const migration = await readFile(
  new URL(
    "../../supabase/migrations/20261117165309_fish_silvio_assistance.sql",
    import.meta.url,
  ),
  "utf8",
);
test("support journey: real SQL identity, ticket/appointment transactions, retries, tenant RLS and Silvio steps", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.user',true),'')::uuid $$;
 CREATE FUNCTION get_effective_company_id() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.company',true),'')::uuid $$;
 CREATE FUNCTION utente_bloccato() RETURNS boolean LANGUAGE sql AS $$ SELECT current_setting('test.blocked',true)='true' $$;
 CREATE FUNCTION has_permission(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('test.ticket_permission',true),'false')='true' $$;
 CREATE TABLE companies(id uuid PRIMARY KEY);
 CREATE TABLE profiles(id uuid PRIMARY KEY,company_id uuid,first_name text,last_name text,phone text,country text,address text,site_address text,city text,site_city text,deleted_at timestamptz,updated_at timestamptz DEFAULT now());
 CREATE TABLE user_roles(user_id uuid,role text);
 CREATE TABLE ai_agents_v2(id uuid PRIMARY KEY,company_id uuid,tools_config jsonb,UNIQUE(company_id,id));
 CREATE TABLE marketing_calendars(id uuid PRIMARY KEY,company_id uuid,is_active boolean);
 CREATE TABLE tickets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,customer_id uuid,subject text,titolo text,descrizione text,indirizzo_intervento text,status text,priority text,priorita text,fonte text,tipo text);
 ALTER TABLE tickets ENABLE ROW LEVEL SECURITY; GRANT SELECT ON tickets TO authenticated;
 CREATE POLICY ticket_read ON tickets FOR SELECT TO authenticated USING(company_id=get_effective_company_id() AND has_permission(auth.uid(),'can_view_tickets'));
 CREATE TABLE appointments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,calendar_id uuid,appointment_date date,appointment_time time,appointment_end_time time,status text,title text,description text,UNIQUE(calendar_id,appointment_date,appointment_time));
 CREATE TABLE silvio_task(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,titolo text,origine text,stato text,contesto jsonb,passo_corrente int DEFAULT 0,updated_at timestamptz DEFAULT now());
 CREATE TABLE silvio_task_passi(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),task_id uuid,ordine int,azione_chiave text,stato text DEFAULT 'da_fare',eseguito_at timestamptz);
 CREATE TABLE conversation_links(company_id uuid,agent_id uuid,session_id text,ticket_id uuid,UNIQUE(company_id,agent_id,session_id));
 CREATE FUNCTION fish_link_ticket_conversation(c uuid,a uuid,s text,t uuid) RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN INSERT INTO conversation_links VALUES(c,a,s,t) ON CONFLICT(company_id,agent_id,session_id) DO UPDATE SET ticket_id=excluded.ticket_id; RETURN '{"linked":true}'; END $$;
 CREATE FUNCTION fish_apply_ticket_update(c uuid,u uuid,a uuid,k text,s text,t uuid,n text,b boolean) RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN IF NOT EXISTS(SELECT 1 FROM tickets WHERE id=t AND company_id=c AND customer_id=u AND status='aperto') THEN RETURN '{"aggiornato":false}'; END IF; RETURN jsonb_build_object('aggiornato',true,'ticket_id',t); END $$;
 CREATE TABLE test_reservations(calendar_id uuid,request_key text,appointment_id uuid,UNIQUE(calendar_id,request_key));
 CREATE FUNCTION reserve_calendar_booking(p_calendar_id uuid,p_company_id uuid,p_data date,p_inizio time,p_fine time,p_buffer_prima int,p_buffer_dopo int,p_durata_min int,p_riga jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE existing uuid; BEGIN
 IF current_setting('test.booking_failure',true)='true' THEN RAISE EXCEPTION 'booking failure'; END IF;
 SELECT appointment_id INTO existing FROM test_reservations WHERE calendar_id=p_calendar_id AND request_key=p_riga->>'request_key';
 IF FOUND THEN RETURN jsonb_build_object('id',existing,'duplicate',true); END IF;
 IF EXISTS(SELECT 1 FROM appointments WHERE calendar_id=p_calendar_id AND appointment_date=p_data AND appointment_time=p_inizio) THEN RETURN NULL; END IF;
 INSERT INTO appointments(company_id,calendar_id,appointment_date,appointment_time,appointment_end_time,status,title,description) VALUES(p_company_id,p_calendar_id,p_data,p_inizio,p_fine,'confermato',p_riga->>'title',p_riga->>'description') RETURNING id INTO existing;
 INSERT INTO test_reservations VALUES(p_calendar_id,p_riga->>'request_key',existing); RETURN jsonb_build_object('id',existing,'duplicate',false); END $$;
 INSERT INTO companies VALUES('${A}'),('${B}'); INSERT INTO marketing_calendars VALUES('${CAL}','${A}',true);
 INSERT INTO ai_agents_v2 VALUES('${AG}','${A}','{"voice_provider":"fish_audio","fish":{"flow_id":"support_appointment","calendar_id":"${CAL}"}}');
 INSERT INTO profiles(id,company_id,first_name,last_name,phone,country,address) VALUES('${C}','${A}','Cliente','Esempio','0302345678','IT','Via Esempio 7'); INSERT INTO user_roles VALUES('${C}','customer');`);
    const customerSql = await readFile(
      new URL(
        "../../supabase/migrations/20261110165759_fish_crm_live_trial.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await db.exec(
      customerSql.slice(
        customerSql.indexOf("CREATE FUNCTION public.fish_customer_phone"),
        customerSql.indexOf("ALTER TABLE public.ai_fish_agents"),
      ),
    );
    await db.exec(migration);
    const start = async (session = "call-one", company = A) =>
      (
        await db.query("SELECT fish_assistance_start($1,$2,$3) r", [
          company,
          AG,
          session,
        ])
      ).rows[0].r;
    const [one, two] = await Promise.all([start(), start()]);
    assert.equal(one.id, two.id);
    assert.equal(
      (await db.query("SELECT count(*)::int n FROM silvio_task")).rows[0].n,
      1,
    );
    await assert.rejects(start("foreign", B), /Flusso assistenza/);
    const revision = (
      await db.query("SELECT updated_at FROM profiles WHERE id=$1", [C])
    ).rows[0].updated_at;
    const identity = (id = one.id, customer = C, rev = revision) =>
      db.query("SELECT fish_assistance_identity($1,$2,$3,$4,$5)", [
        id,
        A,
        customer,
        rev,
        "+390302345678",
      ]);
    const ticket = (
      id = one.id,
      description = "La finestra non si chiude bene",
      existing = null,
    ) =>
      db.query("SELECT fish_assistance_ticket($1,$2,$3,$4,false,$5) r", [
        id,
        A,
        "+390302345678",
        description,
        existing,
      ]);
    await assert.rejects(ticket(), /Verifica prima/);
    await assert.rejects(identity(one.id, AG), /Identita/);
    await identity();
    const [t1, t2] = await Promise.all([
      ticket(),
      ticket(one.id, "Stessa chiamata con descrizione riformulata"),
    ]);
    assert.equal(t1.rows[0].r.ticket_id, t2.rows[0].r.ticket_id);
    const ticketId = t1.rows[0].r.ticket_id;
    assert.equal(
      (await db.query("SELECT count(*)::int n FROM tickets")).rows[0].n,
      1,
    );
    assert.equal(
      (await db.query("SELECT ticket_id FROM conversation_links")).rows[0]
        .ticket_id,
      ticketId,
    );
    const book = (
      id = one.id,
      day = "2026-11-25",
      time = "10:00",
      calendar = CAL,
      company = A,
    ) =>
      db.query(
        "SELECT fish_reserve_assistance_booking($1,$2,$3,$4,$5,$6,$7,0,0,30,'{}') r",
        [
          id,
          "+390302345678",
          calendar,
          company,
          day,
          time,
          time === "10:00" ? "10:30" : "11:30",
        ],
      );
    await assert.rejects(book(one.id, "2026-11-25", "10:00", AG), /calendario/);
    await db.exec("SET test.booking_failure='true'");
    await assert.rejects(book(), /booking failure/);
    assert.equal(
      (
        await db.query("SELECT stage FROM ai_fish_assistance WHERE id=$1", [
          one.id,
        ])
      ).rows[0].stage,
      "awaiting_appointment",
    );
    assert.equal(
      (await db.query("SELECT count(*)::int n FROM appointments")).rows[0].n,
      0,
    );
    await db.exec("SET test.booking_failure='false'");
    const [a1, a2] = await Promise.all([
      book(),
      book(one.id, "2026-11-26", "11:00"),
    ]);
    assert.equal(a1.rows[0].r.id, a2.rows[0].r.id);
    assert.equal(a2.rows[0].r.data, "2026-11-25");
    assert.equal(a2.rows[0].r.ora, "10:00");
    assert.equal(
      (await db.query("SELECT count(*)::int n FROM appointments")).rows[0].n,
      1,
    );
    const appointment = (await db.query("SELECT * FROM appointments")).rows[0];
    assert.match(appointment.description, new RegExp(ticketId));
    assert.match(appointment.description, /Via Esempio 7/);
    assert.equal(
      (
        await db.query("SELECT stage FROM ai_fish_assistance WHERE id=$1", [
          one.id,
        ])
      ).rows[0].stage,
      "scheduled",
    );
    assert.equal(
      (
        await db.query("SELECT stato FROM silvio_task WHERE id=$1", [
          one.task_id,
        ])
      ).rows[0].stato,
      "completato",
    );
    assert.deepEqual(
      (
        await db.query(
          "SELECT stato FROM silvio_task_passi WHERE task_id=$1 ORDER BY ordine",
          [one.task_id],
        )
      ).rows.map((r) => r.stato),
      ["fatto", "fatto", "fatto"],
    );
    const returning = await start("returning");
    await identity(returning.id);
    const resumed = await ticket(
      returning.id,
      "Richiama per il problema ancora presente",
      ticketId,
    );
    assert.equal(resumed.rows[0].r.aggiornato, true);
    assert.equal(
      (await db.query("SELECT count(*)::int n FROM tickets")).rows[0].n,
      1,
    );
    await db.query(
      "UPDATE profiles SET updated_at=updated_at+interval '1 second' WHERE id=$1",
      [C],
    );
    await assert.rejects(book(returning.id), /Scheda cambiata/);
    await db.query("UPDATE appointments SET status='annullato' WHERE id=$1", [
      appointment.id,
    ]);
    await identity(
      one.id,
      C,
      (await db.query("SELECT updated_at FROM profiles WHERE id=$1", [C]))
        .rows[0].updated_at,
    );
    await assert.rejects(book(), /Appuntamento da verificare/);
    await db.exec("DELETE FROM test_reservations");
    await db.query("DELETE FROM appointments WHERE id=$1", [appointment.id]);
    await assert.rejects(book(), /Appuntamento da verificare/);
    assert.equal((await db.query("SELECT count(*)::int n FROM appointments")).rows[0].n, 0);
    await db.exec(
      `GRANT USAGE ON SCHEMA auth TO authenticated;SET ROLE authenticated;SET test.company='${A}';SET test.ticket_permission='true';SET test.blocked='false'`,
    );
    assert.equal(
      (await db.query("SELECT count(*)::int n FROM ai_fish_assistance")).rows[0]
        .n,
      2,
    );
    await db.exec("SET test.ticket_permission='false'");
    assert.equal(
      (await db.query("SELECT count(*)::int n FROM ai_fish_assistance")).rows[0]
        .n,
      0,
    );
    await db.exec(`SET test.ticket_permission='true';SET test.company='${B}'`);
    assert.equal(
      (await db.query("SELECT count(*)::int n FROM ai_fish_assistance")).rows[0]
        .n,
      0,
    );
    await assert.rejects(
      db.exec("UPDATE ai_fish_assistance SET stage='scheduled'"),
      /permission denied/,
    );
    await assert.rejects(start(), /permission denied/);
    await db.exec(`SET test.company='${A}';SET test.blocked='true'`);
    assert.equal(
      (await db.query("SELECT count(*)::int n FROM ai_fish_assistance")).rows[0]
        .n,
      0,
    );
  } finally {
    await db.close();
  }
});
