import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
const c = "11111111-1111-4111-a111-111111111111", u = "22222222-2222-4222-a222-222222222222", o = "33333333-3333-4333-a333-333333333333";
const db = new PGlite();
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid', true), '')::uuid$$;
    create function auth.role() returns text language sql as $$select coalesce(nullif(current_setting('test.db_role',true),''),'authenticated')$$;
    create table profiles(id uuid primary key, company_id uuid);
    create table orders(id uuid primary key, company_id uuid, percentuale_avanzamento integer default 0, deleted_at timestamptz);
    create table user_roles(user_id uuid, role text);
    create table campo_regole_azienda(company_id uuid primary key, chi_compila text, ore_dalle text default 'capo', avviso_scostamento_minuti integer);
    create table campo_rapportini(id uuid primary key default gen_random_uuid(), company_id uuid, user_id uuid, order_id uuid, data_lavoro date,
      role_type text default 'employee', ore_lavorate numeric(4,1) default 0, ore_straordinario numeric default 0,
      lavoro_completato boolean default false, firma_cliente_url text, firma_cliente_nome text, firma_operaio_url text,
      descrizione_lavori text, stato text default 'inviato', approvato boolean default false,
      presenze jsonb default '[]', foto_urls text[] default '{}', materiali_usati jsonb default '[]', fasi_lavorate jsonb default '[]', percentuale_avanzamento integer default 0,
      constraint ux_campo_rapportini_unique_day unique(user_id, order_id, data_lavoro));
    create function public.has_permission_for_company(uuid,text,uuid) returns boolean language sql as $$select coalesce(current_setting('test.office',true),'false') = 'true'$$;
    create function public.campo_lavoro_su_commessa(uuid) returns boolean language sql as $$select coalesce(current_setting('test.assigned',true),'true') = 'true'$$;
    create function public.campo_mio_ruolo(uuid) returns jsonb language sql as $$select coalesce(nullif(current_setting('test.role',true),''),'{}')::jsonb$$;
    insert into profiles values ('${u}','${c}'); insert into orders(id,company_id) values('${o}','${c}');
    insert into campo_regole_azienda(company_id,chi_compila) values('${c}','ognuno');
    set test.uid='${u}'; set test.role='{"capocantiere":true,"esiste_capo":true}';`);
  const sql = readFileSync(resolve(process.cwd(), "supabase/migrations-pending/campo_rapportini_protocollo.sql"), "utf8");
  await db.exec(sql); await db.exec(sql);
}, 30000);
afterAll(() => db.close());
async function reset(rule = "ognuno", role = { capocantiere: true, esiste_capo: true }) {
  await db.exec(`truncate campo_rapportini, user_roles; update orders set percentuale_avanzamento=0; update campo_regole_azienda set chi_compila='${rule}'; set test.uid='${u}'; set test.db_role='authenticated'; set test.office='false'; set test.assigned='true'; set test.role='${JSON.stringify(role)}';`);
}
const insert = (extra = "") => db.query<{ id: string; ore_lavorate: string }>(`insert into campo_rapportini(company_id,user_id,order_id,data_lavoro,descrizione_lavori ${extra ? "," + extra.split("|")[0] : ""}) values('${c}','${u}','${o}',(now() at time zone 'Europe/Rome')::date,'Posa serramenti' ${extra ? "," + extra.split("|")[1] : ""}) returning id,ore_lavorate`);
describe("Protocollo rapportini, solo PostgreSQL locale isolato", () => {
  it("aggiunge il secondo decimale senza ridurre l'intervallo dei dati storici", async () => {
    const historical = new PGlite();
    try {
      await historical.exec("create table campo_rapportini(ore_lavorate numeric(4,1)); insert into campo_rapportini values(900.9)");
      const sql = readFileSync(resolve(process.cwd(), "supabase/migrations-pending/campo_rapportini_protocollo.sql"), "utf8");
      const conversion = sql.match(/alter table public\.campo_rapportini alter column ore_lavorate type numeric\(\d+,\d+\);/)![0];
      await historical.exec(conversion);
      expect((await historical.query("select ore_lavorate::text as ore from campo_rapportini")).rows[0]).toEqual({ ore: "900.90" });
    } finally { await historical.close(); }
  });
  it("ammette giornaliero e cliente dello stesso autore nello stesso giorno", async () => {
    await reset(); await insert(); await insert("lavoro_completato,firma_cliente_url,firma_cliente_nome|true,'firma.png','Cliente'");
    expect((await db.query("select count(*)::int as n from campo_rapportini")).rows[0]).toEqual({ n: 2 });
  });
  it("rifiuta un secondo giornaliero invece di sommare le ore", async () => {
    await reset(); await insert(); await expect(insert()).rejects.toMatchObject({ code: "23505" });
  });
  it("una firma storica basta a distinguere il documento cliente", async () => {
    await reset(); await insert("firma_cliente_url,firma_cliente_nome|'firma.png','Cliente'"); await insert();
    expect((await db.query("select count(*)::int as n from campo_rapportini")).rows[0]).toEqual({ n: 2 });
  });
  it("il rapporto cliente non aggiunge ore o consumi", async () => {
    await reset(); await expect(insert("lavoro_completato,firma_cliente_url,firma_cliente_nome,ore_lavorate|true,'firma.png','Cliente',8")).rejects.toMatchObject({ code: "22023" });
    await expect(insert("lavoro_completato,firma_cliente_url,firma_cliente_nome,materiali_usati|true,'firma.png','Cliente','[{\"nome\":\"Malta\",\"quantita\":2}]'")).rejects.toMatchObject({ code: "22023" });
    await expect(insert("lavoro_completato,firma_cliente_url,firma_cliente_nome,percentuale_avanzamento|true,'firma.png','Cliente',100")).rejects.toMatchObject({ code: "22023" });
  });
  it("anche dopo la creazione un rapporto cliente non può acquisire ore", async () => {
    await reset(); const r = await insert("lavoro_completato,firma_cliente_url,firma_cliente_nome|true,'firma.png','Cliente'");
    await expect(db.query("update campo_rapportini set ore_lavorate=8 where id=$1", [r.rows[0].id])).rejects.toMatchObject({ code: "22023" });
    expect((await db.query("select ore_lavorate::text as ore from campo_rapportini")).rows[0]).toEqual({ ore: "0.00" });
  });
  it("modificare soltanto le fasi non evita il controllo della scadenza", async () => {
    await reset(); const r = await insert();
    await db.exec("set test.office='true'");
    await db.query("update campo_rapportini set data_lavoro=(now() at time zone 'Europe/Rome')::date-3 where id=$1", [r.rows[0].id]);
    await db.exec("set test.office='false'");
    await expect(db.query("update campo_rapportini set fasi_lavorate=$2 where id=$1", [r.rows[0].id, JSON.stringify([{ phase_id: o, percentuale: 40 }])])).rejects.toMatchObject({ code: "22023" });
  });
  it("anche aggiungere foto a un giornaliero scaduto richiede il percorso di correzione", async () => {
    await reset(); const r = await insert(); await db.exec("set test.office='true'");
    await db.query("update campo_rapportini set data_lavoro=(now() at time zone 'Europe/Rome')::date-3 where id=$1", [r.rows[0].id]);
    await db.exec("set test.office='false'");
    await expect(db.query("update campo_rapportini set foto_urls=array['foto.png'] where id=$1", [r.rows[0].id])).rejects.toMatchObject({ code: "22023" });
  });
  it("non duplica le ore dei vecchi rapporti firmati che contenevano anche il giornaliero", async () => {
    await reset(); await db.exec("set test.office='true'"); await insert("lavoro_completato,firma_cliente_url,firma_cliente_nome,ore_lavorate|true,'firma.png','Cliente',8");
    await db.exec("set test.office='false'"); await expect(insert("ore_lavorate|8")).rejects.toMatchObject({ code: "22023" }); await insert("ore_lavorate|0");
  });
  it("fa rispettare il flusso capo anche fuori dalla UI", async () => {
    await reset("capo", { capocantiere: false, esiste_capo: true }); await expect(insert()).rejects.toMatchObject({ code: "42501" });
  });
  it("nel flusso misto il capo non registra le presenze degli altri", async () => {
    await reset("ore_proprie"); await expect(insert("presenze|'[{\"nome\":\"Mario\",\"ore\":8}]'")).rejects.toMatchObject({ code: "22023" });
    await insert("ore_lavorate|7.62"); expect((await db.query("select ore_lavorate::text as ore from campo_rapportini")).rows[0]).toEqual({ ore: "7.62" });
  });
  it("non tratta il subappaltatore come dipendente delegato", async () => {
    await reset("capo", { capocantiere: false, esiste_capo: true }); await db.exec(`insert into user_roles values('${u}','subcontractor')`); await insert();
  });
  it("non permette di auto-approvare", async () => {
    await reset(); await expect(insert("stato,approvato|'approvato',true")).rejects.toMatchObject({ code: "42501" });
  });
  it("nega cantieri non assegnati", async () => {
    await reset(); await db.exec("set test.assigned='false'"); await expect(insert()).rejects.toMatchObject({ code: "42501" });
  });
  it("non blocca gli aggiornamenti dei PDF eseguiti dai job server fidati", async () => {
    await reset(); await insert(); await db.exec("set test.uid=''; set test.db_role='service_role'; update campo_rapportini set firma_operaio_url='autore.png'");
    expect((await db.query("select firma_operaio_url as firma from campo_rapportini")).rows[0]).toEqual({ firma: "autore.png" });
  });
  it("non permette giornalieri retrodatati, ma ammette la correzione richiesta dall'ufficio", async () => {
    await reset(); const r = await insert(); await db.exec("set test.office='true'");
    await db.query("update campo_rapportini set stato='rifiutato',data_lavoro=(now() at time zone 'Europe/Rome')::date-3 where id=$1", [r.rows[0].id]);
    await db.exec("set test.office='false'"); await db.query("update campo_rapportini set stato='inviato',descrizione_lavori='Corretto' where id=$1", [r.rows[0].id]);
    await expect(db.query(`insert into campo_rapportini(company_id,user_id,order_id,data_lavoro) values('${c}','${u}','${o}',(now() at time zone 'Europe/Rome')::date-4)`)).rejects.toMatchObject({ code: "22023" });
  });
  it("legge le scelte anche tramite assegnazione indiretta e non le inventa se non autorizzato", async () => {
    await reset("ore_proprie");
    const result = await db.query("select campo_regole_per_ordine($1) as regole", [o]);
    expect(result.rows[0]).toEqual({ regole: { chi_compila: "ore_proprie", ore_dalle: "capo", avviso_scostamento_minuti: null } });
    await db.exec("set test.assigned='false'"); await expect(db.query("select campo_regole_per_ordine($1)", [o])).rejects.toMatchObject({ code: "42501" });
  });
  it("non permette un rapporto per la commessa di un'altra azienda", async () => {
    await reset(); await db.exec(`update orders set company_id='44444444-4444-4444-a444-444444444444'`);
    try { await expect(insert()).rejects.toMatchObject({ code: "42501" }); }
    finally { await db.exec(`update orders set company_id='${c}'`); }
  });
  it("sposta l'avanzamento soltanto all'approvazione e non lo riduce", async () => {
    await reset(); const r = await insert("percentuale_avanzamento|60");
    expect((await db.query("select percentuale_avanzamento as p from orders")).rows[0]).toEqual({ p: 0 });
    await db.exec("set test.office='true'"); await db.query("update campo_rapportini set stato='approvato',approvato=true where id=$1", [r.rows[0].id]);
    expect((await db.query("select percentuale_avanzamento as p from orders")).rows[0]).toEqual({ p: 60 });
    await db.exec("update orders set percentuale_avanzamento=90; update campo_rapportini set firma_operaio_url='autore.png'");
    expect((await db.query("select percentuale_avanzamento as p from orders")).rows[0]).toEqual({ p: 90 });
  });
});

// Exhaustive product of these axes, not a claim of exhaustive production coverage.
const roles = ["operaio", "caposquadra", "capocantiere", "subappaltatore"] as const;
const policyCases = ["ognuno", "capo", "ore_proprie"].flatMap(rule =>
  roles.flatMap(role => [false, true].flatMap(head =>
    [false, true].flatMap(assigned => [-2, -1, 0, 1].flatMap(day =>
      [false, true].map(client => ({ rule, role, head, assigned, day, client })))))));

describe("Simulazione matrice ruoli, azienda, assegnazione, giorno e tipo (384 combinazioni)", () => {
  it("una sessione scaduta non può creare il rapporto o dichiarare il protocollo disponibile", async () => {
    await reset(); await db.exec("set test.uid=''");
    await expect(insert()).rejects.toMatchObject({ code: "42501" });
    await expect(db.query("select campo_rapportini_protocollo()")).rejects.toMatchObject({ code: "42501" });
  });
  it("non scrive con la sessione di un collega, anche sul medesimo cantiere", async () => {
    await reset(); await db.exec("set test.uid='22222222-2222-4222-a222-222222222223'");
    await expect(insert()).rejects.toMatchObject({ code: "42501" });
  });
  it("dopo la revoca dell'assegnazione non consente neppure di aggiornare un rapporto già proprio", async () => {
    await reset(); const r = await insert(); await db.exec("set test.assigned='false'");
    await expect(db.query("update campo_rapportini set descrizione_lavori='Corretto' where id=$1", [r.rows[0].id])).rejects.toMatchObject({ code: "42501" });
  });
  it.each(policyCases)("$rule · $role · capo=$head · assegnato=$assigned · giorno=$day · cliente=$client", async scenario => {
    await reset(scenario.rule, { capocantiere: scenario.role === "capocantiere", esiste_capo: scenario.head });
    await db.query("select set_config('test.role', $1, false), set_config('test.assigned', $2, false)", [
      JSON.stringify({ capocantiere: scenario.role === "capocantiere", caposquadra: scenario.role === "caposquadra", esiste_capo: scenario.head }),
      String(scenario.assigned),
    ]);
    if (scenario.role === "subappaltatore") await db.query("insert into user_roles values($1,'subcontractor')", [u]);
    // Oracle: business policy stated independently from the trigger SQL.
    const denied = !scenario.assigned ? "42501"
      : scenario.client ? (scenario.head && scenario.role !== "capocantiere" ? "42501" : null)
      : scenario.day < -1 || scenario.day > 0 ? "22023"
      : scenario.rule === "capo" && scenario.head && scenario.role === "operaio" ? "42501" : null;
    const write = db.query(`insert into campo_rapportini(company_id,user_id,order_id,data_lavoro,descrizione_lavori,
      lavoro_completato,firma_cliente_url,firma_cliente_nome,ore_lavorate)
      values($1,$2,$3,(now() at time zone 'Europe/Rome')::date+$4::integer,'Giornata simulata',$5,$6,$7,$8) returning id`,
      [c, u, o, scenario.day, scenario.client, scenario.client ? "firma-test.png" : null, scenario.client ? "Cliente test" : null, scenario.client ? 0 : 4]);
    if (denied) await expect(write).rejects.toMatchObject({ code: denied });
    else await expect(write).resolves.toMatchObject({ rows: [expect.objectContaining({ id: expect.any(String) })] });
    expect((await db.query("select count(*)::int as n from campo_rapportini")).rows[0]).toEqual({ n: denied ? 0 : 1 });
  });
  it("non permette di aggiungere in aggiornamento ore già presenti in un rapporto cliente storico", async () => {
    await reset(); await db.exec("set test.office='true'");
    await insert("lavoro_completato,firma_cliente_url,firma_cliente_nome,ore_lavorate|true,'firma.png','Cliente',8");
    await db.exec("set test.office='false'"); const daily = await insert("ore_lavorate|0");
    await expect(db.query("update campo_rapportini set ore_lavorate=8 where id=$1", [daily.rows[0].id])).rejects.toMatchObject({ code: "22023" });
    expect((await db.query("select ore_lavorate::text as ore from campo_rapportini where id=$1", [daily.rows[0].id])).rows[0]).toEqual({ ore: "0.00" });
  });
});
