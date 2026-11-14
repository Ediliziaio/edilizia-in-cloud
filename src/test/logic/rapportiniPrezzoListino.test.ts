/**
 * Le 8 prove del capitolato (piano rapportini/listini 14/11/2026, Fasi 2 e 3) sulla migrazione vera,
 * eseguita in un Postgres in memoria. Permessi, presenze e costi orari sono finti e dichiarati qui sotto;
 * le stesse prove girano sul database vero in scripts/prove-db/rapportini-listini-demo2.sql.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { etichettaPrezzo, prezzoModificatoAMano, scegliPrezzo, totaliQuadro } from "@/lib/campo/prezzoVoceRapportino";

const MIGRAZIONE = "supabase/migrations/20290318120000_rapportini_prezzo_dal_listino_e_costi_da_completare.sql";
const C = "11111111-1111-4111-a111-111111111111";
const ALTRA = "11111111-1111-4111-a111-111111111112";
const UTENTE = "22222222-2222-4222-a222-222222222222";
const COMMITTENTE = "33333333-3333-4333-a333-333333333331";
const PRIVATO = "33333333-3333-4333-a333-333333333332";
const O_COMM = "44444444-4444-4444-a444-444444444441";   // commessa del committente (non in appalto)
const O_PRIV = "44444444-4444-4444-a444-444444444442";   // commessa di un cliente senza listino
const O_APP = "44444444-4444-4444-a444-444444444443";    // commessa in appalto col suo contratto
const R_COMM = "55555555-5555-4555-a555-555555555551";
const R_APP = "55555555-5555-4555-a555-555555555553";
const T_POSA = "66666666-6666-4666-a666-666666666661";
const T_TRASP = "66666666-6666-4666-a666-666666666662";
const T_SMALT = "66666666-6666-4666-a666-666666666663";
const T_ALTRA = "66666666-6666-4666-a666-666666666669";
const K_COMM = "77777777-7777-4777-a777-777777777771";
const K_APP = "77777777-7777-4777-a777-777777777773";
const AT_COMM = "88888888-8888-4888-a888-888888888881";
const AT_APP = "88888888-8888-4888-a888-888888888883";
const E_OK = "99999999-9999-4999-a999-999999999991";
const E_SENZA = "99999999-9999-4999-a999-999999999992";
const M_OK = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa1";
const M_SENZA = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa2";

const db = new PGlite();
type J = Record<string, unknown>;
const uno = async <T = J>(q: string, p: unknown[] = []): Promise<T> => (await db.query<{ v: T }>(q, p)).rows[0].v;
const prezzo = (o: string, t: string): Promise<J> => uno("select public.prezzo_voce_commessa($1, $2, null) v", [o, t]);

beforeAll(async () => {
  await db.exec(`
    create role anon; create role authenticated; create schema auth; create schema private;
    create function auth.uid() returns uuid language sql as $$select '${UTENTE}'::uuid$$;
    create function auth.role() returns text language sql as $$select 'authenticated'::text$$;
    create function public.has_permission_for_company(uuid, text, uuid) returns boolean language sql as
      $$select coalesce(nullif(current_setting('test.costi', true), '')::boolean, true) or $2 <> 'can_view_costs'$$;
    create function public.user_can_access_company(uuid) returns boolean language sql as $$select true$$;
    create function public.utente_bloccato() returns boolean language sql as $$select false$$;
    create function public.utente_e_cliente_esterno() returns boolean language sql as $$select false$$;
    create function public.puo_vedere_commessa(uuid) returns boolean language sql as $$select true$$;
    create function private.office_order_rights(uuid) returns jsonb language sql as
      $$select coalesce(nullif(current_setting('test.diritti', true), '')::jsonb,
                        '{"amounts":true,"costs":true,"margins":true,"personal":true}'::jsonb)$$;
    create table private.office_projection_fields(table_name text, column_name text, right_name text);

    create table public.orders(id uuid primary key, company_id uuid, customer_id uuid, appalto_contratto_id uuid,
      order_type text, valorizzazione text, deleted_at timestamptz);
    create table public.tariffe_aziendali(id uuid primary key default gen_random_uuid(), company_id uuid, tipo text, nome text,
      descrizione text, codice text, unita text, prezzo_vendita numeric, prezzo_costo numeric default 0, costo_interno numeric,
      categoria_prodotto text, custom_field_values jsonb default '{}', attivo boolean default true);
    create table public.appalto_contratti(id uuid primary key, company_id uuid, committente_id uuid, attivo boolean default true,
      valido_dal date, valido_al date);
    create table public.appalto_tariffe(id uuid primary key, company_id uuid, contratto_id uuid, tariffa_id uuid, descrizione text,
      prezzo_unitario numeric, unita_misura text default 'cad', attivo boolean default true, valido_dal date, valido_al date, ordine int default 0);
    create table public.appalto_tariffe_commessa(id uuid primary key default gen_random_uuid(), order_id uuid, tariffa_id uuid, prezzo_unitario numeric);
    create table public.employees(id uuid primary key, company_id uuid, first_name text, last_name text, costo_orario numeric);
    create table public.mezzi(id uuid primary key, company_id uuid, nome text, possesso text, deleted_at timestamptz, costo numeric);
    create table public.campo_rapportini(id uuid primary key, company_id uuid, order_id uuid, data_lavoro date default '2026-11-10',
      presenze jsonb default '[]', mezzi_usati jsonb default '[]', stato text default 'inviato', fasi_lavorate jsonb default '[]',
      costo_manodopera numeric, presenze_registrate jsonb, costo_registrato_at timestamptz, annullato_at timestamptz);
    create table public.rapportino_voci_libere(id uuid primary key default gen_random_uuid(), company_id uuid, order_id uuid,
      rapportino_id uuid, descrizione text check (length(btrim(descrizione)) > 0), quantita numeric, unita text,
      costo_unitario numeric, vendita_unitaria numeric, created_at timestamptz default clock_timestamp());
    create table public.rapportino_mezzi_costi(rapportino_id uuid, mezzo_id uuid, ore numeric, ore_stimate boolean, costo_orario numeric, importo numeric);
    create table public.order_employees(id uuid primary key default gen_random_uuid(), order_id uuid, employee_id uuid, phase_id uuid,
      hourly_rate numeric not null, hours_worked numeric not null, total_cost numeric not null);

    create function public.costo_orario_calcolato(uuid) returns numeric language sql stable as
      $$select case when costo_orario > 0 then costo_orario end from public.employees where id = $1$$;
    create function public.mezzo_costo_orario_effettivo(uuid) returns numeric language sql stable as
      $$select case when coalesce(possesso, '') like 'noleggio%' then null else costo end from public.mezzi where id = $1$$;
    create function public.campo_presenze_effettive(r public.campo_rapportini) returns jsonb language sql stable as $$select r.presenze$$;
    create function public.campo_controlla_ore_persona(uuid, uuid, uuid, date, numeric, uuid) returns void language sql as $$select$$;
    create function public.appalto_righe_da_rapportino_calcola(uuid) returns table(persona text, employee_id uuid, tariffa_id uuid,
      quantita numeric, maggiorazione_pct numeric, costo_interno numeric, motivo text) language sql as $$select null::text, null::uuid, null::uuid, null::numeric, null::numeric, null::numeric, null::text where false$$;
    -- Come in produzione, il rapportino porta azienda e commessa nella voce.
    create function public.voce_azienda() returns trigger language plpgsql as $$begin
      select company_id, order_id into new.company_id, new.order_id from public.campo_rapportini where id = new.rapportino_id; return new; end$$;
    create trigger trg_voci_libere_prima before insert on public.rapportino_voci_libere for each row execute function public.voce_azienda();
  `);
  await db.exec(readFileSync(resolve(process.cwd(), MIGRAZIONE), "utf8"));
  await db.exec(`create trigger trg_rapportino_costo_manodopera before update on public.campo_rapportini
    for each row execute function public.fn_rapportino_costo_manodopera()`);
}, 30_000);
afterAll(() => db.close());

beforeEach(async () => {
  await db.exec(`
    truncate public.orders, public.tariffe_aziendali, public.appalto_contratti, public.appalto_tariffe, public.appalto_tariffe_commessa,
      public.employees, public.mezzi, public.campo_rapportini, public.rapportino_voci_libere, public.rapportino_mezzi_costi, public.order_employees;
    set test.costi = ''; set test.diritti = '';
    insert into public.orders values
      ('${O_COMM}', '${C}', '${COMMITTENTE}', null, 'cliente', 'a_misura', null),
      ('${O_PRIV}', '${C}', '${PRIVATO}', null, 'cliente', 'a_misura', null),
      ('${O_APP}', '${C}', '${COMMITTENTE}', '${K_APP}', 'appaltatore_lavoro', 'a_misura', null);
    insert into public.tariffe_aziendali (id, company_id, tipo, nome, codice, unita, prezzo_vendita, costo_interno) values
      ('${T_POSA}', '${C}', 'posa', 'Posa serramento', 'POS-01', 'pz', 50, 30),
      ('${T_TRASP}', '${C}', 'trasporto', 'Trasporto in cantiere', 'TRA-01', 'fisso', 60, 40),
      ('${T_SMALT}', '${C}', 'smaltimento', 'Smaltimento macerie', 'SMA-01', 'pz', 0, 10),
      ('${T_ALTRA}', '${ALTRA}', 'posa', 'Posa di un''altra azienda', 'POS-01', 'pz', 99, 1);
    insert into public.appalto_contratti values
      ('${K_COMM}', '${C}', '${COMMITTENTE}', true, '2026-01-01', null),
      -- Spento: vale solo perché è il contratto della commessa in appalto.
      ('${K_APP}', '${C}', '${COMMITTENTE}', false, '2025-01-01', null);
    insert into public.appalto_tariffe (id, company_id, contratto_id, tariffa_id, prezzo_unitario) values
      ('${AT_COMM}', '${C}', '${K_COMM}', '${T_POSA}', 45),
      ('${AT_APP}', '${C}', '${K_APP}', '${T_POSA}', 44);
    insert into public.employees values ('${E_OK}', '${C}', 'Anna', 'Costata', 25), ('${E_SENZA}', '${C}', 'Marco', 'Senzacosto', null);
    insert into public.mezzi values ('${M_OK}', '${C}', 'Escavatore', 'proprieta', null, 20), ('${M_SENZA}', '${C}', 'Furgone', 'proprieta', null, null);
    insert into public.campo_rapportini (id, company_id, order_id, presenze) values
      ('${R_COMM}', '${C}', '${O_COMM}', '[{"employee_id":"${E_OK}","nome":"Anna","ore":8}]'),
      ('${R_APP}', '${C}', '${O_APP}', '[]');
  `);
});

describe("Fase 2 — il prezzo di una voce per una commessa", () => {
  it("1. committente senza listino → listino generale", async () => {
    expect(await prezzo(O_PRIV, T_POSA)).toMatchObject({ fonte: "generale", prezzo: 50, codice: "POS-01" });
  });
  it("2. committente col listino e la voce → listino committente (anche se la commessa non è un appalto)", async () => {
    expect(await prezzo(O_COMM, T_POSA)).toMatchObject({ fonte: "committente", prezzo: 45, appalto_tariffa_id: AT_COMM });
  });
  it("3. listino del committente senza quella voce → listino generale", async () => {
    expect(await prezzo(O_COMM, T_TRASP)).toMatchObject({ fonte: "generale", prezzo: 60 });
  });
  it("4. voce in nessun listino (prezzo 0 nel generale) → prezzo da definire", async () => {
    const p = await prezzo(O_COMM, T_SMALT);
    expect(p).toMatchObject({ fonte: "mancante", prezzo: null });
  });
  it("il contratto legato alla commessa vince su quello generico del committente; l'eccezione di cantiere su tutti", async () => {
    expect(await prezzo(O_APP, T_POSA)).toMatchObject({ fonte: "committente", prezzo: 44, contratto_id: K_APP });
    await db.exec(`insert into public.appalto_tariffe_commessa (order_id, tariffa_id, prezzo_unitario) values ('${O_APP}', '${AT_APP}', 47)`);
    expect(await prezzo(O_APP, T_POSA)).toMatchObject({ fonte: "cantiere", prezzo: 47 });
  });
  it("collegamento per id: una descrizione uguale nel listino del committente non basta", async () => {
    await db.exec(`insert into public.appalto_tariffe (id, company_id, contratto_id, tariffa_id, descrizione, prezzo_unitario)
      values (gen_random_uuid(), '${C}', '${K_COMM}', null, 'Posa serramento', 1)`);
    await db.exec(`update public.appalto_tariffe set tariffa_id = null where id = '${AT_COMM}'`);
    expect(await prezzo(O_COMM, T_POSA)).toMatchObject({ fonte: "generale", prezzo: 50 });
  });
  it("una voce di un'altra azienda non ha prezzo per questa commessa", async () => {
    expect(await prezzo(O_COMM, T_ALTRA)).toBeNull();
  });
  it("contratto scaduto del committente → listino generale", async () => {
    await db.exec(`update public.appalto_contratti set valido_al = '2026-02-01' where id = '${K_COMM}'`);
    expect(await prezzo(O_COMM, T_POSA)).toMatchObject({ fonte: "generale", prezzo: 50 });
  });
  it("chi non vede gli importi non riceve il prezzo; chi non vede i costi non riceve il costo", async () => {
    await db.exec(`set test.diritti = '{"amounts":false,"costs":false}'`);
    const p = await prezzo(O_COMM, T_POSA);
    expect(p).toMatchObject({ fonte: "committente" });
    expect(p).not.toHaveProperty("prezzo");
    expect(p).not.toHaveProperty("costo_unitario");
  });
  it("«Aggiungi voce» cerca nel listino generale per codice, descrizione e categoria, col prezzo della regola", async () => {
    const perCodice = await uno<J[]>("select public.rapportino_listino_cerca($1, 'pos-01', 10) v", [R_COMM]);
    expect(perCodice).toHaveLength(1);
    expect(perCodice[0]).toMatchObject({ tariffa_id: T_POSA, fonte: "committente", prezzo: 45, categoria: "posa" });
    const perDescrizione = await uno<J[]>("select public.rapportino_listino_cerca($1, 'macerie', 10) v", [R_COMM]);
    expect(perDescrizione[0]).toMatchObject({ tariffa_id: T_SMALT, fonte: "mancante" });
    const perCategoria = await uno<J[]>("select public.rapportino_listino_cerca($1, 'trasporto', 10) v", [R_COMM]);
    expect(perCategoria.map((v) => v.tariffa_id)).toEqual([T_TRASP]);
  });
});

describe("Fase 2 — il rapportino fotografa il prezzo del giorno", () => {
  const aggiungi = (t: string, vendita: number | null = null, costo: number | null = null) => uno<J>(
    `insert into public.rapportino_voci_libere (rapportino_id, descrizione, quantita, unita, tariffa_id, vendita_unitaria, costo_unitario)
     values ($1, '', 2, 'pz', $2, $3, $4) returning to_jsonb(rapportino_voci_libere.*) v`, [R_COMM, t, vendita, costo]);

  it("senza prezzo scritto prende quello proposto, con provenienza e descrizione dal listino", async () => {
    expect(await aggiungi(T_POSA)).toMatchObject({
      descrizione: "Posa serramento", codice: "POS-01", prezzo_fonte: "committente",
      vendita_unitaria: 45, vendita_proposta: 45, prezzo_a_mano: false, costo_unitario: 30,
    });
  });
  it("5. modifica a mano → cambia il rapportino, non il listino", async () => {
    expect(await aggiungi(T_POSA, 55)).toMatchObject({ vendita_unitaria: 55, vendita_proposta: 45, prezzo_a_mano: true, prezzo_fonte: "committente" });
    expect(Number(await uno("select prezzo_unitario v from public.appalto_tariffe where id = $1", [AT_COMM]))).toBe(45);
    expect(Number(await uno("select prezzo_vendita v from public.tariffe_aziendali where id = $1", [T_POSA]))).toBe(50);
  });
  it("voce da definire: si scrive a mano e resta dichiarata «mancante» nel listino", async () => {
    expect(await aggiungi(T_SMALT, 12)).toMatchObject({ prezzo_fonte: "mancante", vendita_proposta: null, vendita_unitaria: 12, prezzo_a_mano: true });
  });
  it("6. listino aggiornato dopo → il rapportino tiene il prezzo storico, anche se la voce viene modificata", async () => {
    const v = await aggiungi(T_TRASP);
    await db.exec(`update public.tariffe_aziendali set prezzo_vendita = 70 where id = '${T_TRASP}'`);
    await db.exec(`update public.rapportino_voci_libere set quantita = 3, vendita_proposta = 999, prezzo_fonte = 'cantiere' where id = '${v.id}'`);
    expect(await uno("select to_jsonb(x.*) v from public.rapportino_voci_libere x where id = $1", [v.id]))
      .toMatchObject({ quantita: 3, vendita_unitaria: 60, vendita_proposta: 60, prezzo_fonte: "generale", prezzo_a_mano: false });
    expect(await prezzo(O_COMM, T_TRASP)).toMatchObject({ prezzo: 70 });
  });
  it("una voce scritta a mano senza listino non ha provenienza, e il browser non può inventarla", async () => {
    const v = await uno<J>(`insert into public.rapportino_voci_libere (rapportino_id, descrizione, quantita, unita, vendita_unitaria, prezzo_fonte, vendita_proposta)
      values ($1, 'Nolo ponteggio', 1, 'cad', 100, 'committente', 100) returning to_jsonb(rapportino_voci_libere.*) v`, [R_COMM]);
    expect(v).toMatchObject({ prezzo_fonte: null, vendita_proposta: null, prezzo_a_mano: true });
  });
  it("la voce di un'altra azienda si rifiuta", async () => {
    await expect(aggiungi(T_ALTRA)).rejects.toThrow(/non è nel listino/);
  });
  it("8. prezzo al committente e costo interno restano distinti", async () => {
    const v = await aggiungi(T_POSA);
    expect(v.vendita_unitaria).toBe(45);
    expect(v.costo_unitario).toBe(30);
    const q = await uno<J>("select private.office_rapportino_economia_raw($1) v", [R_COMM]);
    expect((q.voci as J[])[0]).toMatchObject({ vendita_unitaria: 45, costo_unitario: 30, prezzo_fonte: "committente", codice: "POS-01" });
  });
});

describe("Fase 3 — il costo che manca non è 0 €", () => {
  it("7. operaio senza costo orario → «costo da completare» nel rapportino e nella commessa", async () => {
    await db.exec(`update public.campo_rapportini set presenze = '[{"employee_id":"${E_OK}","nome":"Anna","ore":8},{"employee_id":"${E_SENZA}","nome":"Marco","ore":6}]' where id = '${R_COMM}'`);
    const q = await uno<J>("select private.office_rapportino_economia_raw($1) v", [R_COMM]);
    const persone = q.persone as J[];
    expect(persone.find((p) => p.emp === E_OK)).toMatchObject({ costo: 200, costo_orario: 25 });
    expect(persone.find((p) => p.emp === E_SENZA)).toMatchObject({ costo: null, costo_orario: null });
    expect(q.costo_da_completare).toEqual([{ tipo: "persona", nome: "Marco Senzacosto", motivo: "costo orario mancante" }]);
    const c = await uno<J>("select public.commessa_costi_da_completare($1) v", [O_COMM]);
    expect(c).toMatchObject({ completo: false, mezzi: [] });
    expect(c.persone).toEqual([expect.objectContaining({ employee_id: E_SENZA, ore: 6, motivo: "costo orario mancante" })]);
  });
  it("mezzo di proprietà senza costo orario: da completare; ore × costo per quello che lo ha", async () => {
    await db.exec(`update public.campo_rapportini set mezzi_usati = '[{"mezzo_id":"${M_OK}","ore":"5"},{"mezzo_id":"${M_SENZA}","ore":"3"}]' where id = '${R_COMM}'`);
    const q = await uno<J>("select private.office_rapportino_economia_raw($1) v", [R_COMM]);
    expect((q.mezzi as J[]).find((m) => m.mezzo_id === M_OK)).toMatchObject({ ore: 5, costo_orario: 20, importo: 100 });
    expect((q.mezzi as J[]).find((m) => m.mezzo_id === M_SENZA)).toMatchObject({ importo: null });
    expect(q.costo_da_completare).toEqual([{ tipo: "mezzo", nome: "Furgone", motivo: "costo orario mancante" }]);
    expect(await uno<J>("select public.commessa_costi_da_completare($1) v", [O_COMM])).toMatchObject({ completo: false, mezzi: [expect.objectContaining({ nome: "Furgone" })] });
  });
  it("all'approvazione il costo mancante resta segnato nella fotografia e non diventa un costo vero", async () => {
    await db.exec(`update public.campo_rapportini set presenze = '[{"employee_id":"${E_SENZA}","nome":"Marco","ore":6}]' where id = '${R_COMM}'`);
    await db.exec(`update public.campo_rapportini set stato = 'approvato' where id = '${R_COMM}'`);
    const snap = await uno<J[]>("select presenze_registrate v from public.campo_rapportini where id = $1", [R_COMM]);
    expect(snap[0]).toMatchObject({ employee_id: E_SENZA, ore: 6, costo: 0, costo_mancante: true });
    // Il costo orario arriva dopo: il registrato resta storico, ma non lo si spaccia per 0 €.
    await db.exec(`update public.employees set costo_orario = 30 where id = '${E_SENZA}'`);
    const q = await uno<J>("select private.office_rapportino_economia_raw($1) v", [R_COMM]);
    expect((q.persone as J[])[0]).toMatchObject({ costo: null });
    expect(q.costo_da_completare).toHaveLength(1);
  });
  it("costo orario_dipendente: null, non 0, se il costo manca", async () => {
    expect(await uno("select public.costo_orario_dipendente($1) v", [E_SENZA])).toBeNull();
    expect(Number(await uno("select public.costo_orario_dipendente($1) v", [E_OK]))).toBe(25);
  });
  it("tutto completo → la commessa non avvisa", async () => {
    expect(await uno<J>("select public.commessa_costi_da_completare($1) v", [O_COMM])).toEqual({ persone: [], mezzi: [], completo: true });
  });
  it("chi non ha «Costi» non legge le mancanze della commessa", async () => {
    await db.exec("set test.costi = 'false'");
    await expect(uno("select public.commessa_costi_da_completare($1) v", [O_COMM])).rejects.toThrow(/permesso/);
  });
});

describe("Le parole e i totali dell'interfaccia", () => {
  it("la regola scritta in chiaro coincide con quella del database", () => {
    expect(scegliPrezzo({ generale: 50 })).toEqual({ prezzo: 50, fonte: "generale" });
    expect(scegliPrezzo({ generale: 50, committente: 45 })).toEqual({ prezzo: 45, fonte: "committente" });
    expect(scegliPrezzo({ generale: 50, committente: 45, cantiere: 47 })).toEqual({ prezzo: 47, fonte: "cantiere" });
    expect(scegliPrezzo({ generale: 0 })).toEqual({ prezzo: null, fonte: "mancante" });
  });
  it("etichette", () => {
    expect(etichettaPrezzo("committente")).toBe("Prezzo applicato: listino committente");
    expect(etichettaPrezzo("generale")).toBe("Prezzo applicato: listino generale");
    expect(etichettaPrezzo("mancante")).toBe("Prezzo da definire");
    expect(prezzoModificatoAMano(55, 45)).toBe(true);
    expect(prezzoModificatoAMano(45, 45)).toBe(false);
  });
  it("con un costo mancante il totale è parziale e il margine non c'è", () => {
    const t = totaliQuadro({
      persone: [{ costo: 200, ditta: false }, { costo: null, ditta: false }],
      mezzi: [{ importo: 100, noleggio: false }],
      voci: [{ quantita: 2, costo_unitario: 30, vendita_unitaria: 45 }],
    });
    expect(t).toMatchObject({ costo: 360, ricavo: 90, completo: false, margine: null, mancano: 1 });
    expect(totaliQuadro({ persone: [{ costo: 200, ditta: false }], voci: [{ quantita: 2, costo_unitario: 30, vendita_unitaria: 150 }] }))
      .toMatchObject({ costo: 260, ricavo: 300, completo: true, margine: 40 });
    // Un prezzo ancora da definire: il ricavo è parziale, il margine non si dà.
    expect(totaliQuadro({ persone: [], voci: [{ quantita: 2, costo_unitario: 90, vendita_unitaria: null, prezzo_fonte: "mancante" }] }))
      .toMatchObject({ costo: 180, ricavo: 0, completo: true, prezziDaDefinire: 1, margine: null });
  });
});
