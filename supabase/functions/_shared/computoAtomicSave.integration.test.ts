import { PGlite } from "npm:@electric-sql/pglite@0.5.8";
const uploadId = "10000000-0000-0000-0000-000000000001", companyId = "20000000-0000-0000-0000-000000000001";
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

Deno.test("Postgres: atomic save, rollback, tenant isolation, edited rows, linked quotes and privileges", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key); create table public.companies(id uuid primary key);
      create table public.quotes(id uuid primary key);`);
    const base = await Deno.readTextFile(new URL("../../migrations/20260915000001_computo_metrico_ai.sql", import.meta.url));
    await db.exec(base.split("-- 3. prezzari")[0]);
    await db.exec(`create table public.quote_items(id uuid primary key default gen_random_uuid(), computo_voce_id uuid references public.computo_voci_estratte(id) on delete set null);
      grant usage on schema public to service_role; grant select,insert,update,delete on all tables in schema public to service_role;`);
    await db.exec(await Deno.readTextFile(new URL("../../migrations/20261009141631_computo_estrazione_salvataggio_atomico.sql", import.meta.url)));
    await db.exec(`insert into companies values ('${companyId}'); insert into auth.users values ('${uploadId}');
      insert into computo_uploads(id,company_id,uploaded_by,file_name,file_type,file_size,storage_path,extraction_status,raw_extracted_json)
      values ('${uploadId}','${companyId}','${uploadId}','test.pdf','pdf',100,'${companyId}/test.pdf','validating','{"old":true}');
      insert into computo_voci_estratte(computo_upload_id,company_id,descrizione_breve) values ('${uploadId}','${companyId}','ORIGINALE');`);
    const row = { descrizione_breve: "Nuova posa", quantita: 2, prezzo_unitario_computo: 10, importo_computo: 20, confidence: .9, warnings: [], ordine: 1 };
    const save = (rows: unknown[], result: unknown = { metadata: { oggetto_lavori: "Nuovo" } }, company = companyId) => db.query<{ receipt: { saved_count: number; upload_id: string } }>(
      "select public.computo_salva_estrazione_atomica($1::uuid,$2::uuid,$3::jsonb,$4::jsonb,'pdf_text',0.9) as receipt",
      [uploadId, company, JSON.stringify(rows), JSON.stringify(result)],
    );
    const snapshot = async () => JSON.stringify((await db.query("select descrizione_breve from computo_voci_estratte order by ordine")).rows) + JSON.stringify((await db.query("select extraction_status,raw_extracted_json,oggetto_lavori from computo_uploads")).rows);
    const original = await snapshot();
    const fails = async (fn: () => Promise<unknown>, phrase?: string) => {
      let error: unknown;
      try { await fn(); } catch (e) { error = e; }
      assert(error, "Expected transaction failure");
      if (phrase) assert(String(error).includes(phrase), `Wrong error: ${error}`);
    };
    await fails(() => save([row, { ...row, descrizione_breve: null }]), "null");
    assert(await snapshot() === original, "Malformed second row deleted previous rows/status");
    await fails(() => save([row], { metadata: { data_computo: "invalid-date" } }));
    assert(await snapshot() === original, "Metadata error left rows partially committed");
    await fails(() => save([row], {}, "20000000-0000-0000-0000-000000000099"), "azienda");
    assert(await snapshot() === original, "Cross-tenant mutation");
    await db.exec("update computo_voci_estratte set is_modified=true");
    await fails(() => save([row]), "revisione");
    await db.exec("update computo_voci_estratte set is_modified=false; insert into quote_items(computo_voce_id) select id from computo_voci_estratte");
    await fails(() => save([row]), "preventivo");
    assert(await snapshot() === original, "Quote-linked row overwritten");
    await db.exec("delete from quote_items; update computo_uploads set extraction_status='generating'");
    await fails(() => save([row]), "preventivo");
    await db.exec("update computo_uploads set extraction_status='validating'");
    const permissions = await db.query<{ anon: boolean; authenticated: boolean; service: boolean }>(`select
      has_function_privilege('anon','public.computo_salva_estrazione_atomica(uuid,uuid,jsonb,jsonb,text,numeric)','execute') as anon,
      has_function_privilege('authenticated','public.computo_salva_estrazione_atomica(uuid,uuid,jsonb,jsonb,text,numeric)','execute') as authenticated,
      has_function_privilege('service_role','public.computo_salva_estrazione_atomica(uuid,uuid,jsonb,jsonb,text,numeric)','execute') as service`);
    assert(!permissions.rows[0].anon && !permissions.rows[0].authenticated && permissions.rows[0].service, "RPC publicly executable");
    await db.exec("set role authenticated"); await fails(() => save([row]), "permission"); await db.exec("reset role; set role service_role");
    const saved = await save([row, { ...row, ordine: 2 }]);
    const receipt = saved.rows[0].receipt as { saved_count: number; upload_id: string };
    assert(receipt.saved_count === 2 && receipt.upload_id === uploadId, "Incorrect receipt");
    await db.exec("reset role");
    assert((await db.query<{ extraction_status: string }>("select extraction_status from computo_uploads")).rows[0].extraction_status === "review", "Rows and review state not published together");
    assert((await db.query<{ n: number }>("select count(*)::int as n from computo_voci_estratte")).rows[0].n === 2, "Incorrect saved row count");
  } finally { await db.close(); }
});
