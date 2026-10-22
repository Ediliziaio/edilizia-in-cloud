import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Computo contrattuale bloccato, varianti e contabilità dei lavori pubblici sul
 * motore PostgreSQL vero (PGlite): trigger, RLS e funzioni come in produzione.
 * Attorno, le tabelle esistenti ridotte alle colonne che servono. Dati inventati.
 */
const migrazioniSingole = [
  "supabase/migrations/20281023053000_computo_contrattuale_bloccato_e_varianti.sql",
  "supabase/migrations/20281023054000_contabilita_lavori_pubblici.sql",
  "supabase/migrations/20281023070000_contabilita_lp_storico_libretto_e_fattura.sql",
].map((f) => readFileSync(f, "utf8"));

const A = "a0000000-0000-0000-0000-000000000001";
const B = "a0000000-0000-0000-0000-000000000002";
const ADMIN = "10000000-0000-0000-0000-000000000001";
const UFFICIO = "10000000-0000-0000-0000-000000000002";
const LETTORE = "10000000-0000-0000-0000-000000000003";
const ESTRANEO = "10000000-0000-0000-0000-000000000005";
const COMMESSA = "c0000000-0000-0000-0000-000000000001";
const COMPUTO = "d0000000-0000-0000-0000-000000000001";
const V1 = "e0000000-0000-0000-0000-000000000001";
const V2 = "e0000000-0000-0000-0000-000000000002";

const schema = `
create schema auth;
create role anon; create role authenticated; create role service_role;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
create type app_role as enum ('super_admin','company_admin','company_staff','customer');
create table companies(id uuid primary key);
create table profiles(id uuid primary key, company_id uuid, is_blocked boolean default false);
create table user_roles(id uuid primary key default gen_random_uuid(), user_id uuid, role app_role);
create table multi_company_access(user_id uuid, company_id uuid, status text, expires_at timestamptz, access_role text);
create table staff_permissions(user_id uuid, company_id uuid, can_view_orders boolean default false, can_edit_orders boolean default false);
create function has_role(u uuid, r app_role) returns boolean language sql stable set search_path = public as $$select exists(select 1 from user_roles where user_id=u and role=r)$$;
create function get_user_company_id(u uuid) returns uuid language sql stable set search_path = public as $$select company_id from profiles where id=u$$;
create function chiamante_anonimo() returns boolean language sql stable set search_path = public as $$select auth.uid() is null$$;
create function utente_bloccato() returns boolean language sql stable set search_path = public as $$select coalesce((select is_blocked from profiles where id=auth.uid()),false)$$;
create function utente_e_cliente_esterno() returns boolean language sql stable set search_path = public as $$select false$$;
${readFileSync("src/test/fixtures/moduleCompanyPermission.sql", "utf8")}
create table orders(id uuid primary key, company_id uuid references companies(id) on delete cascade, assigned_to uuid, destination_warehouse_id uuid);
create function can_see_order(_o uuid, _a uuid, _w uuid) returns boolean language sql stable set search_path = public as $$select true$$;
create function get_order_company_id(_o uuid) returns uuid language sql stable security definer set search_path = public as $$select company_id from orders where id=_o$$;
create function azienda_ancora_esiste(p uuid) returns boolean language sql stable security definer set search_path = public as $$select p is null or exists(select 1 from companies where id=p)$$;
create function puo_modificare_commessa(p_order_id uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select has_permission_for_company(auth.uid(), 'can_edit_orders', o.company_id) and can_see_order(o.id, o.assigned_to, o.destination_warehouse_id)
    from orders o where o.id = p_order_id), false) and not utente_bloccato()$$;
create table computo_uploads(id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id) on delete cascade,
  uploaded_by uuid, file_name text not null, file_type text not null, file_size bigint not null, storage_path text not null,
  extraction_status text not null default 'uploading', extraction_method text, extraction_completed_at timestamptz,
  oggetto_lavori text, committente text, progettista text, data_computo date, order_id uuid references orders(id) on delete set null,
  titolo text, stato text not null default 'bozza', totale_dichiarato numeric, totale_calcolato numeric, prezzari text[],
  lavoro_pubblico boolean not null default false, stazione_appaltante text, cig text, cup text, ribasso_percentuale numeric,
  oneri_sicurezza numeric, updated_at timestamptz default now());
create table computo_voci_estratte(id uuid primary key default gen_random_uuid(),
  computo_upload_id uuid not null references computo_uploads(id) on delete cascade, company_id uuid not null references companies(id) on delete cascade,
  capitolo_numero int, capitolo_nome text, codice_voce text, codice_prezzario text, descrizione_breve text not null, descrizione_estesa text,
  unita_misura text, quantita numeric default 0, prezzo_unitario_computo numeric default 0, importo_computo numeric default 0,
  confidence numeric, warnings text[], ai_notes text, is_included boolean default true, ordine int default 0, numero_ordine text,
  codice_tariffa text, super_categoria text, categoria text, sotto_categoria text, is_sicurezza boolean not null default false,
  is_detrazione boolean not null default false, a_corpo boolean not null default false, matched_name text);
create table computo_voci_misure(id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id) on delete cascade,
  voce_id uuid not null references computo_voci_estratte(id) on delete cascade, ordine int not null default 0, descrizione text,
  parti_uguali numeric, lunghezza numeric, larghezza numeric, altezza_peso numeric, quantita numeric, formula text);
create table documenti_fiscali(id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id) on delete cascade,
  tipo text not null, deleted_at timestamptz);
grant usage on schema auth to authenticated, anon, service_role;
grant all on all tables in schema public to authenticated, service_role;
`;

const seme = `
insert into companies values ('${A}'), ('${B}');
insert into profiles(id, company_id) values ('${ADMIN}','${A}'), ('${UFFICIO}','${A}'), ('${LETTORE}','${A}'), ('${ESTRANEO}','${B}');
insert into user_roles(user_id, role) values ('${ADMIN}','company_admin'), ('${UFFICIO}','company_staff'), ('${LETTORE}','company_staff'), ('${ESTRANEO}','company_admin');
insert into staff_permissions(user_id, company_id, can_view_orders, can_edit_orders) values ('${UFFICIO}','${A}', true, true), ('${LETTORE}','${A}', true, false);
insert into orders(id, company_id) values ('${COMMESSA}','${A}');
insert into computo_uploads(id, company_id, file_name, file_type, file_size, storage_path, extraction_status, order_id, stato, lavoro_pubblico, ribasso_percentuale)
  values ('${COMPUTO}','${A}','computo.xpwe','xpwe',1,'x','review','${COMMESSA}','verificato', true, 10);
insert into computo_voci_estratte(id, computo_upload_id, company_id, descrizione_breve, unita_misura, quantita, prezzo_unitario_computo, importo_computo, ordine, numero_ordine)
  values ('${V1}','${COMPUTO}','${A}','Massetto','m²',1000,60,60000,1,'1'), ('${V2}','${COMPUTO}','${A}','Ponteggio','m²',100,100,10000,2,'2');
update computo_voci_estratte set is_sicurezza = true where id = '${V2}';
insert into computo_voci_misure(company_id, voce_id, ordine, descrizione, lunghezza, larghezza, quantita) values ('${A}','${V1}',1,'Piano terra',50,20,1000);
`;

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(schema);
  await db.exec("begin;" + migrazioniSingole.join("\n") + ";commit;");
  await db.exec("begin;" + migrazioniSingole.join("\n") + ";commit;"); // idempotente
}, 120_000);
afterAll(async () => db?.close());
beforeEach(async () => { await db.exec("begin;" + seme); });
afterEach(async () => { await db.exec("rollback"); });

async function come(utente: string | null) {
  await db.exec("reset role");
  await db.query("select set_config('test.user', $1, true)", [utente ?? ""]);
  if (utente) await db.exec("set local role authenticated");
}
async function fallisce(fn: () => Promise<unknown>, atteso?: RegExp) {
  await db.exec("savepoint prova");
  let errore: unknown = null;
  try { await fn(); } catch (e) { errore = e; }
  await db.exec("rollback to savepoint prova");
  expect(errore, "doveva fallire").not.toBeNull();
  if (atteso) expect(String((errore as Error).message)).toMatch(atteso);
}
async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows;
}
const rendiContrattuale = async () => { await come(UFFICIO); await q(`update computo_uploads set stato='contrattuale' where id=$1`, [COMPUTO]); };

describe("computo contrattuale bloccato", () => {
  it("voci e misure non si toccano; l'abbinamento al listino sì; registra chi l'ha reso contrattuale", async () => {
    await rendiContrattuale();
    await fallisce(() => q(`update computo_voci_estratte set quantita = 2000 where id=$1`, [V1]), /perizia di variante/);
    await fallisce(() => q(`delete from computo_voci_estratte where id=$1`, [V1]), /contrattuale/);
    await fallisce(() => q(`insert into computo_voci_estratte(computo_upload_id, company_id, descrizione_breve) values ($1,$2,'Nuova')`, [COMPUTO, A]), /contrattuale/);
    await fallisce(() => q(`update computo_voci_misure set lunghezza = 60`), /righe di misura/);
    await fallisce(() => q(`delete from computo_voci_misure`), /righe di misura/);
    await fallisce(() => q(`update computo_uploads set ribasso_percentuale = 5 where id=$1`, [COMPUTO]), /perizia di variante/);
    await fallisce(() => q(`update computo_uploads set stato='verificato' where id=$1`, [COMPUTO]), /motivo/);
    await fallisce(() => q(`delete from computo_uploads where id=$1`, [COMPUTO]), /eliminare/);
    await q(`update computo_voci_estratte set matched_name = 'Massetto listino' where id=$1`, [V1]);
    await q(`update computo_uploads set titolo = 'Computo di contratto' where id=$1`, [COMPUTO]);
    await come(null);
    expect(await q(`select tipo, utente_id from computo_eventi`)).toEqual([{ tipo: "reso_contrattuale", utente_id: UFFICIO }]);
  });

  it("sblocco: solo con «Ordini e Commesse» e motivo, registrato; mai con il libretto avviato", async () => {
    await rendiContrattuale();
    await come(LETTORE);
    await fallisce(() => q(`select computo_sblocca_contrattuale($1, 'Errore di trascrizione della voce 1')`, [COMPUTO]), /Ordini e Commesse/);
    await come(UFFICIO);
    await fallisce(() => q(`select computo_sblocca_contrattuale($1, 'errore')`, [COMPUTO]), /motivo/);
    await q(`select computo_sblocca_contrattuale($1, 'Errore di trascrizione della voce 1')`, [COMPUTO]);
    expect((await q<{ stato: string }>(`select stato from computo_uploads where id=$1`, [COMPUTO]))[0].stato).toBe("verificato");
    await q(`update computo_voci_estratte set quantita = 1100 where id=$1`, [V1]);
    await come(null);
    expect((await q<{ tipo: string; motivo: string }>(`select tipo, motivo from computo_eventi where tipo='sbloccato'`))[0].motivo).toBe("Errore di trascrizione della voce 1");

    await rendiContrattuale();
    await q(`insert into lp_libretto(company_id, order_id, voce_id, righe) values ($1,$2,$3,'[{"quantita":10}]')`, [A, COMMESSA, V1]);
    await fallisce(() => q(`select computo_sblocca_contrattuale($1, 'Errore di trascrizione della voce 1')`, [COMPUTO]), /perizia di variante/);
  });

  it("la purga dell'azienda passa sopra al blocco", async () => {
    await rendiContrattuale();
    await come(null);
    await q(`insert into lp_libretto(company_id, order_id, voce_id, righe) values ($1,$2,$3,'[{"quantita":10}]')`, [A, COMMESSA, V1]);
    await q(`delete from companies where id=$1`, [A]);
    expect(await q(`select 1 from computo_voci_estratte`)).toHaveLength(0);
    expect(await q(`select 1 from lp_libretto`)).toHaveLength(0);
  });
});

describe("perizia di variante", () => {
  it("copia del contrattuale legata voce per voce; approvata diventa contrattuale e archivia il precedente", async () => {
    await rendiContrattuale();
    const [{ id }] = await q<{ id: string }>(`select computo_crea_variante($1, null, 'Maggiori quantità di massetto') id`, [COMPUTO]);
    await fallisce(() => q(`select computo_crea_variante($1, null, 'altra')`, [COMPUTO]), /già una perizia/);
    const voci = await q<{ id: string; voce_origine_id: string }>(`select id, voce_origine_id from computo_voci_estratte where computo_upload_id=$1 order by ordine`, [id]);
    expect(voci.map(v => v.voce_origine_id)).toEqual([V1, V2]);
    expect(await q(`select 1 from computo_voci_misure m join computo_voci_estratte v on v.id=m.voce_id where v.computo_upload_id=$1`, [id])).toHaveLength(1);
    await q(`update computo_voci_estratte set quantita = 1100, importo_computo = 66000 where id=$1`, [voci[0].id]);
    await q(`insert into computo_voci_estratte(computo_upload_id, company_id, descrizione_breve, quantita, prezzo_unitario_computo, importo_computo, ordine, numero_ordine, nuovo_prezzo)
      values ($1,$2,'Drenaggio',50,40,2000,3,'NP.1',true)`, [id, A]);
    await come(LETTORE);
    await fallisce(() => q(`select computo_approva_variante($1)`, [id]), /Ordini e Commesse/);
    await come(UFFICIO);
    await q(`select computo_approva_variante($1)`, [id]);
    const stati = await q<{ id: string; stato: string; numero_variante: number | null }>(`select id, stato, numero_variante from computo_uploads order by numero_variante nulls first`);
    expect(stati.map(s => s.stato)).toEqual(["archiviato", "contrattuale"]);
    expect(stati[1].numero_variante).toBe(1);
    // Il contratto superato resta intoccabile.
    await fallisce(() => q(`update computo_voci_estratte set quantita = 1 where id=$1`, [V1]), /contrattuale/);
    await fallisce(() => q(`delete from computo_uploads where id=$1`, [COMPUTO]), /eliminare/);
  });
});

describe("libretto, SAL, certificato", () => {
  const salDati = (o: Record<string, unknown> = {}) => JSON.stringify({
    lavori_a_tutto: "2026-02-28", ritenuta_percentuale: 0.5, anticipazione_percentuale: 0, sicurezza_modo: "a_misura",
    lavori_lordo: 18000, ribasso: 1800, lavori_netti: 16200, sicurezza: 3000, totale_a_oggi: 19200, ritenuta: 96,
    anticipazione: 0, recupero_anticipazione: 0, netto_a_oggi: 19104, sal_precedenti: 0, importo_sal: 19104, ...o,
  });

  it("registra sulle voci contrattuali: quantità dalle righe, numero progressivo, firma del DL dal server", async () => {
    await come(UFFICIO);
    await fallisce(() => q(`insert into lp_libretto(company_id, order_id, voce_id, righe) values ($1,$2,$3,'[]')`, [A, COMMESSA, V1]), /computo contrattuale/);
    await rendiContrattuale();
    const [r1] = await q<{ numero: number; quantita: string; voce_radice: string }>(
      `insert into lp_libretto(company_id, order_id, voce_id, data, righe) values ($1,$2,$3,'2026-02-10','[{"parti_uguali":2,"lunghezza":10,"larghezza":15},{"quantita":-20}]') returning numero, quantita, voce_radice`, [A, COMMESSA, V1]);
    expect([r1.numero, Number(r1.quantita), r1.voce_radice]).toEqual([1, 280, V1]);
    const [r2] = await q<{ numero: number; firmato_da: string }>(
      `insert into lp_libretto(company_id, order_id, voce_id, data, righe, firmatario, firmato_at) values ($1,$2,$3,'2026-02-20','[{"quantita":30}]','Ing. Rossi','2000-01-01') returning numero, firmato_da`, [A, COMMESSA, V2]);
    expect([r2.numero, r2.firmato_da]).toEqual([2, UFFICIO]);
    await come(LETTORE);
    expect(await q(`select 1 from lp_libretto`)).toHaveLength(2);
    await fallisce(() => q(`insert into lp_libretto(company_id, order_id, voce_id, righe) values ($1,$2,$3,'[]')`, [A, COMMESSA, V1]), /row-level security/);
    await come(ESTRANEO);
    expect(await q(`select 1 from lp_libretto`)).toHaveLength(0);
  });

  it("SAL: emesso contabilizza il libretto; approvato non si tocca; certificato solo da SAL approvato e coerente", async () => {
    await rendiContrattuale();
    await q(`insert into lp_libretto(company_id, order_id, voce_id, data, righe) values ($1,$2,$3,'2026-02-10','[{"quantita":300}]')`, [A, COMMESSA, V1]);
    await q(`insert into lp_libretto(company_id, order_id, voce_id, data, righe) values ($1,$2,$3,'2026-03-10','[{"quantita":100}]')`, [A, COMMESSA, V1]);
    await fallisce(() => q(`select lp_sal_emetti($1, $2::jsonb, '[]')`, [COMMESSA, salDati({ importo_sal: 20000 })]), /non coerenti/);
    const [{ id }] = await q<{ id: string }>(`select lp_sal_emetti($1, $2::jsonb, $3::jsonb) id`, [COMMESSA, salDati(),
      JSON.stringify([{ voce_radice: V1, ordine: 1, numero: "1", prezzo: 60, prezzo_ribassato: 54, quantita_contratto: 1000, quantita_a_oggi: 300, importo_a_oggi: 18000 }])]);
    expect((await q<{ sal_id: string | null }>(`select sal_id from lp_libretto order by numero`)).map(r => r.sal_id)).toEqual([id, null]);
    await fallisce(() => q(`update lp_libretto set righe='[{"quantita":1}]' where numero=1`), /contabilizzata/);
    await fallisce(() => q(`update lp_sal set importo_sal = 1 where id=$1`, [id]), /a mano/);
    await fallisce(() => q(`insert into lp_sal_voci(company_id, order_id, sal_id, voce_radice) values ($1,$2,$3,$4)`, [A, COMMESSA, id, V1]), /emissione/);
    await fallisce(() => q(`insert into lp_certificati_pagamento(company_id, order_id, sal_id, imponibile, aliquota_iva, iva, totale, split_payment, da_pagare_impresa)
      values ($1,$2,$3,19104,10,1910.4,21014.4,true,19104)`, [A, COMMESSA, id]), /SAL approvato/);

    // Eliminando la bozza le registrazioni tornano libere.
    await q(`delete from lp_sal where id=$1`, [id]);
    expect((await q<{ sal_id: string | null }>(`select sal_id from lp_libretto where numero=1`))[0].sal_id).toBeNull();

    const [{ id: id2 }] = await q<{ id: string }>(`select lp_sal_emetti($1, $2::jsonb, '[]') id`, [COMMESSA, salDati()]);
    await come(LETTORE);
    await q(`update lp_sal set stato='approvato' where id=$1`, [id2]); // la RLS non gli fa vedere righe da cambiare
    expect((await q<{ stato: string }>(`select stato from lp_sal where id=$1`, [id2]))[0].stato).toBe("bozza");
    await come(UFFICIO);
    await q(`update lp_sal set stato='approvato' where id=$1`, [id2]);
    const [s] = await q<{ approvato_da: string; numero: number }>(`select approvato_da, numero from lp_sal where id=$1`, [id2]);
    expect([s.approvato_da, s.numero]).toEqual([UFFICIO, 1]);
    await fallisce(() => q(`update lp_sal set note='x' where id=$1`, [id2]), /approvato/);
    await fallisce(() => q(`delete from lp_sal where id=$1`, [id2]), /approvato/);
    await fallisce(() => q(`insert into lp_certificati_pagamento(company_id, order_id, sal_id, imponibile, aliquota_iva, iva, totale, split_payment, da_pagare_impresa)
      values ($1,$2,$3,19104,10,1910.4,21014.4,true,21014.4)`, [A, COMMESSA, id2]), /non coerenti/);
    const [c] = await q<{ numero: number }>(`insert into lp_certificati_pagamento(company_id, order_id, sal_id, imponibile, aliquota_iva, iva, totale, split_payment, da_pagare_impresa)
      values ($1,$2,$3,19104,10,1910.4,21014.4,true,19104) returning numero`, [A, COMMESSA, id2]);
    expect(c.numero).toBe(1);
    await fallisce(() => q(`delete from lp_certificati_pagamento`), /non si modifica/);

    // SAL n. 2: i precedenti devono tornare.
    await fallisce(() => q(`select lp_sal_emetti($1, $2::jsonb, '[]')`, [COMMESSA, salDati({ lavori_a_tutto: "2026-03-31" })]), /precedenti/);
    await fallisce(() => q(`select lp_sal_emetti($1, $2::jsonb, '[]')`, [COMMESSA, salDati({ lavori_a_tutto: "2026-02-15", sal_precedenti: 19104, importo_sal: 0 })]), /successiva/);
  });

  it("la quantità delle righe è la stessa dell'app", async () => {
    await come(null);
    const r = await q<{ a: string; b: string; c: string }>(`select lp_quantita_riga('{"parti_uguali":2,"lunghezza":4.5,"larghezza":3}') a,
      lp_quantita_riga('{"quantita":12.5,"lunghezza":99}') b, lp_quantita_riga('{"descrizione":"vuota"}') c`);
    expect(r[0]).toEqual({ a: "27.0000", b: "12.5000", c: "0" });
  });
});

describe("libretto: modifica con storico; certificato: fattura collegata", () => {
  const salDati = JSON.stringify({
    lavori_a_tutto: "2026-02-28", ritenuta_percentuale: 0.5, anticipazione_percentuale: 0, sicurezza_modo: "a_misura",
    lavori_lordo: 18000, ribasso: 1800, lavori_netti: 16200, sicurezza: 3000, totale_a_oggi: 19200, ritenuta: 96,
    anticipazione: 0, recupero_anticipazione: 0, netto_a_oggi: 19104, sal_precedenti: 0, importo_sal: 19104,
  });

  it("una registrazione libera si modifica e lo storico dice chi, quando, prima e dopo; in un SAL no", async () => {
    await rendiContrattuale();
    const [r] = await q<{ id: string }>(`insert into lp_libretto(company_id, order_id, voce_id, data, righe, annotazioni)
      values ($1,$2,$3,'2026-02-10','[{"quantita":300}]','prima') returning id`, [A, COMMESSA, V1]);
    const [m] = await q<{ quantita: string; numero: number }>(
      `update lp_libretto set righe='[{"lunghezza":10,"larghezza":25}]', annotazioni='corretta' where id=$1 returning quantita, numero`, [r.id]);
    expect([Number(m.quantita), m.numero]).toEqual([250, 1]);
    await come(LETTORE);
    const storia = await q<{ operazione: string; modificato_da: string; prima: { quantita: number; annotazioni: string }; dopo: { quantita: number } }>(
      `select operazione, modificato_da, prima, dopo from lp_libretto_modifiche where libretto_id=$1`, [r.id]);
    expect(storia).toHaveLength(1);
    expect(storia[0].operazione).toBe("modifica");
    expect(storia[0].modificato_da).toBe(UFFICIO);
    expect([storia[0].prima.quantita, storia[0].prima.annotazioni, storia[0].dopo.quantita]).toEqual([300, "prima", 250]);
    // Lo storico non si scrive a mano.
    await fallisce(() => q(`insert into lp_libretto_modifiche(company_id, order_id, libretto_id, numero, operazione, prima) values ($1,$2,$3,1,'modifica','{}')`, [A, COMMESSA, r.id]), /permission denied|row-level security/);
    await come(UFFICIO);
    await fallisce(() => q(`delete from lp_libretto_modifiche`), /permission denied/);
    await come(ESTRANEO);
    expect(await q(`select 1 from lp_libretto_modifiche`)).toHaveLength(0);

    // Entrata in un SAL: non si modifica, e il contabilizzarla non è una modifica.
    await come(UFFICIO);
    await q(`select lp_sal_emetti($1, $2::jsonb, '[]')`, [COMMESSA, salDati]);
    await fallisce(() => q(`update lp_libretto set annotazioni='dopo il SAL' where id=$1`, [r.id]), /contabilizzata/);
    expect(await q(`select 1 from lp_libretto_modifiche where libretto_id=$1`, [r.id])).toHaveLength(1);
  });

  it("anche la cancellazione resta nello storico", async () => {
    await rendiContrattuale();
    const [r] = await q<{ id: string }>(`insert into lp_libretto(company_id, order_id, voce_id, righe) values ($1,$2,$3,'[{"quantita":5}]') returning id`, [A, COMMESSA, V1]);
    await q(`delete from lp_libretto where id=$1`, [r.id]);
    const [s] = await q<{ operazione: string; dopo: unknown }>(`select operazione, dopo from lp_libretto_modifiche where libretto_id=$1`, [r.id]);
    expect([s.operazione, s.dopo]).toEqual(["eliminazione", null]);
  });

  it("al certificato si collega solo una fattura dell'azienda; il resto non cambia", async () => {
    await rendiContrattuale();
    const [{ id: sal }] = await q<{ id: string }>(`select lp_sal_emetti($1, $2::jsonb, '[]') id`, [COMMESSA, salDati]);
    await q(`update lp_sal set stato='approvato' where id=$1`, [sal]);
    const [c] = await q<{ id: string }>(`insert into lp_certificati_pagamento(company_id, order_id, sal_id, imponibile, aliquota_iva, iva, totale, split_payment, da_pagare_impresa)
      values ($1,$2,$3,19104,10,1910.4,21014.4,true,19104) returning id`, [A, COMMESSA, sal]);
    await come(null);
    const [f] = await q<{ id: string }>(`insert into documenti_fiscali(company_id, tipo) values ($1,'fattura_pa') returning id`, [A]);
    const [altra] = await q<{ id: string }>(`insert into documenti_fiscali(company_id, tipo) values ($1,'fattura') returning id`, [B]);
    const [ddt] = await q<{ id: string }>(`insert into documenti_fiscali(company_id, tipo) values ($1,'ddt') returning id`, [A]);
    await come(UFFICIO);
    await fallisce(() => q(`update lp_certificati_pagamento set documento_fiscale_id=$1 where id=$2`, [altra.id, c.id]), /fattura dell'azienda/);
    await fallisce(() => q(`update lp_certificati_pagamento set documento_fiscale_id=$1 where id=$2`, [ddt.id, c.id]), /fattura dell'azienda/);
    await fallisce(() => q(`update lp_certificati_pagamento set documento_fiscale_id=$1, note='x' where id=$2`, [f.id, c.id]), /non si modifica/);
    await q(`update lp_certificati_pagamento set documento_fiscale_id=$1 where id=$2`, [f.id, c.id]);
    expect((await q<{ documento_fiscale_id: string }>(`select documento_fiscale_id from lp_certificati_pagamento where id=$1`, [c.id]))[0].documento_fiscale_id).toBe(f.id);
    await come(LETTORE);
    expect(await q(`update lp_certificati_pagamento set documento_fiscale_id=null where id=$1 returning id`, [c.id])).toHaveLength(0);
    // La fattura cancellata davvero (purga) sgancia il certificato senza errori.
    await come(null);
    await q(`delete from documenti_fiscali where id=$1`, [f.id]);
    expect((await q<{ documento_fiscale_id: string | null }>(`select documento_fiscale_id from lp_certificati_pagamento where id=$1`, [c.id]))[0].documento_fiscale_id).toBeNull();
    await fallisce(() => q(`delete from lp_certificati_pagamento`), /non si modifica/);
  });
});
