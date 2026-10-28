// Real isolated PostgreSQL, no network permission and no production connection.
import { PGlite } from "npm:@electric-sql/pglite@0.3.14";
const db = new PGlite();
let checks = 0;
const A = "11111111-1111-4111-8111-111111111111",
  B = "22222222-2222-4222-8222-222222222222",
  R = "33333333-3333-4333-8333-333333333333",
  F = "44444444-4444-4444-8444-444444444444",
  E = "55555555-5555-4555-8555-555555555555",
  FLOW = "66666666-6666-4666-8666-666666666666";
const assert = (ok: unknown, label: string) => {
  if (!ok) throw new Error(label);
  checks++;
};
const rejects = async (sql: string, label: string) => {
  let failed = false;
  try {
    await db.exec(sql);
  } catch {
    failed = true;
  }
  assert(failed, label);
};
const count = async () =>
  Number(
    (await db.query<{ n: string }>(
      "select count(*) n from automation_trigger_events",
    )).rows[0].n,
  );
try {
  await db.exec(
    `CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT null::uuid$$;
 CREATE FUNCTION public.has_permission_for_company(u uuid,p text,c uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT true$$;
 CREATE FUNCTION public.utente_sola_lettura(c uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT false$$;
 CREATE TABLE marketing_custom_fields(id uuid PRIMARY KEY,company_id uuid,name text,object_type text,field_type text,options text[],is_required boolean,deleted_at timestamptz);
 CREATE TABLE marketing_contacts(id uuid PRIMARY KEY,company_id uuid,deleted_at timestamptz);
 CREATE TABLE marketing_opportunities(id uuid PRIMARY KEY,company_id uuid,deleted_at timestamptz);
 CREATE TABLE marketing_contact_field_values(contact_id uuid,field_id uuid,value text,UNIQUE(contact_id,field_id));
 CREATE TABLE marketing_opportunity_field_values(opportunity_id uuid,field_id uuid,value text,UNIQUE(opportunity_id,field_id));
 CREATE TABLE entity_custom_field_values(company_id uuid,entity_type text,entity_id uuid,field_id uuid,value text,UNIQUE(entity_type,entity_id,field_id));
 CREATE TABLE automation_enrollments(id uuid PRIMARY KEY,company_id uuid,flow_id uuid,status text,entity_type text);
 CREATE TABLE automation_trigger_events(company_id uuid,trigger_event text,entity_type text,entity_id text,payload jsonb,dedup_key text,processed boolean DEFAULT false);
 CREATE UNIQUE INDEX automation_event_occurrence_unique ON automation_trigger_events(dedup_key) WHERE dedup_key IS NOT NULL;
 ALTER TABLE automation_trigger_events ENABLE ROW LEVEL SECURITY;`,
  );
  for (
    const table of [
      "appointments",
      "tasks",
      "employees",
      "warehouse_stock",
      "ordini_variazione",
      "giornale_lavori",
      "duvri_documents",
      "orders",
      "quotes",
      ...["sr", "fv", "bgn", "rst", "tet", "clm", "idr", "ele", "pav", "pis"]
        .map((x) => x + "_progetti"),
    ]
  ) {
    await db.exec(
      `CREATE TABLE ${table}(id uuid PRIMARY KEY,company_id uuid,stato text DEFAULT 'bozza');`,
    );
  }
  await db.exec(
    "GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role;GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated,service_role;",
  );
  const base = await Deno.readTextFile(
    new URL(
      "../supabase/migrations/20281026160000_campi_personalizzati_validazione_alias.sql",
      import.meta.url,
    ),
  );
  const migration = await Deno.readTextFile(
    new URL("../docs/automazioni-campi-eventi-20261026.sql", import.meta.url),
  );
  await db.exec(`BEGIN;${base}${migration}COMMIT;`);
  await db.exec(`BEGIN;${migration}COMMIT;`);
  checks++;
  await db.exec(
    `INSERT INTO marketing_contacts VALUES('${R}','${A}',null);INSERT INTO marketing_custom_fields(id,company_id,name,object_type,field_type) VALUES('${F}','${A}','Budget','contact','number');INSERT INTO automation_enrollments VALUES('${E}','${A}','${FLOW}','active','contact');SET ROLE service_role;`,
  );
  const write = (value: string, company = A, path = "[]") =>
    `SELECT automation_write_custom_field('${company}','contact','${R}','${F}','${value}','${E}','${path}'::jsonb)`;
  await db.exec(write("0"));
  assert(await count() === 1, "un evento per la modifica");
  const event = (await db.query<
    { payload: { custom_field_flow_path: string[]; new_value: string } }
  >("SELECT payload FROM automation_trigger_events")).rows[0];
  assert(
    event.payload.custom_field_flow_path[0] === FLOW,
    "propaga origine atomica",
  );
  assert(event.payload.new_value === "0", "preserva zero");
  await db.exec(write("0"));
  assert(await count() === 1, "no-op non emette");
  await db.exec(write("0.00"));
  assert(await count() === 1, "nessun evento per la sola formattazione numerica");
  await rejects(write("12", B), "rifiuta azienda diversa");
  await rejects(write("NaN"), "rifiuta numero non valido");
  await rejects(write("12", A, `["${FLOW}"]`), "blocca catena ciclica");
  assert(await count() === 1, "nessun evento dopo errore");
  await db.exec("BEGIN;");
  await db.exec(write("12"));
  await db.exec("ROLLBACK;");
  assert(await count() === 1, "evento annullato con la scrittura");
  await db.exec("BEGIN;");
  await db.exec(write("15"));
  await db.exec(write("16"));
  await db.exec("COMMIT;");
  assert(await count() === 2, "deduplica modifiche nella stessa transazione");
  const last =
    (await db.query<{ payload: { old_value: string; new_value: string } }>(
      "SELECT payload FROM automation_trigger_events WHERE payload->>'new_value'='16'",
    )).rows[0];
  assert(
    Number(last.payload.old_value) === 0 && last.payload.new_value === "16",
    "primo vecchio e ultimo nuovo valore",
  );
  await db.exec(
    `RESET ROLE;DELETE FROM marketing_contact_field_values;UPDATE marketing_custom_fields SET field_type='checkbox' WHERE id='${F}';SET ROLE service_role;`,
  );
  await db.exec(write("false"));
  assert(
    (await db.query<{ value: string }>(
      "SELECT value FROM marketing_contact_field_values",
    )).rows[0].value === "false",
    "preserva false",
  );
  await db.exec(`SET ROLE authenticated`);
  await rejects(write("true"), "RPC chiusa agli utenti");
  await db.exec(
    `INSERT INTO marketing_contact_field_values(contact_id,field_id,value) VALUES('${R}','${F}','true') ON CONFLICT(contact_id,field_id) DO UPDATE SET value=excluded.value`,
  );
  await db.exec(`RESET ROLE`);
  assert(
    await count() === 5,
    "scrittura UI emette senza privilegi di inserimento eventi",
  );
  await db.exec(`RESET ROLE`);
  const exposed = (await db.query<{ n: number }>(
    "SELECT count(*)::int n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname IN ('custom_field_event','automation_write_custom_field','automation_custom_fields_version') AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))",
  )).rows[0].n;
  assert(
    exposed === 0,
    "nessuna funzione nuova esposta ad anon o authenticated",
  );
  await db.exec(
    `DELETE FROM marketing_contact_field_values;UPDATE marketing_custom_fields SET object_type='opportunity',field_type='number' WHERE id='${F}';INSERT INTO marketing_opportunities VALUES('${R}','${A}',null);SET ROLE service_role;SELECT automation_write_custom_field('${A}','opportunity','${R}','${F}','12','${E}');`,
  );
  assert(
    (await db.query(
      "SELECT 1 FROM marketing_opportunity_field_values WHERE value='12'",
    )).rows.length === 1,
    "salvataggio opportunità",
  );
  await db.exec(
    `RESET ROLE;DELETE FROM marketing_opportunity_field_values;UPDATE marketing_custom_fields SET object_type='quote' WHERE id='${F}';`,
  );
  for (
    const prefix of [
      "sr",
      "fv",
      "bgn",
      "rst",
      "tet",
      "clm",
      "idr",
      "ele",
      "pav",
      "pis",
    ]
  ) {
    await db.exec(
      `INSERT INTO ${prefix}_progetti(id,company_id) VALUES('${R}','${A}');SET ROLE service_role;SELECT automation_write_custom_field('${A}','quote_${prefix}','${R}','${F}','0','${E}');RESET ROLE;`,
    );
    assert(
      (await db.query(
        `SELECT 1 FROM entity_custom_field_values WHERE entity_type='quote_${prefix}' AND value='0'`,
      )).rows.length === 1,
      `salvataggio atomico modulo ${prefix}`,
    );
  }
  const beforeLocked = await count();
  await db.exec(`UPDATE sr_progetti SET stato='firmato';SET ROLE service_role`);
  await rejects(
    `SELECT automation_write_custom_field('${A}','quote_sr','${R}','${F}','1','${E}')`,
    "documento consolidato non modificato",
  );
  assert(
    await count() === beforeLocked,
    "nessun evento su documento consolidato",
  );
  console.log(
    `Automazioni/PostgreSQL isolato: ${checks} verifiche superate. Nessuna connessione remota.`,
  );
} catch (error) {
  const e = error as {
    message?: string;
    position?: string;
    internalPosition?: string;
    internalQuery?: string;
  };
  console.error(JSON.stringify({ checks, ...e, query: undefined }, null, 2));
  throw error;
} finally {
  await db.close();
}
