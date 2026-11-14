/**
 * Categorie di cassa: un catalogo solo, per azienda, collegato ai movimenti (14/11/2026).
 *
 * Qui gira la migrazione VERA su PostgreSQL vero (PGlite): sono finti solo i
 * permessi e le tabelle intorno. Copre i punti del capitolato che stanno nel
 * database: catalogo dall'Excel, copia per azienda idempotente e isolata, voce
 * con codice stabile, verso controllato, storico di chi ha cambiato cosa, la
 * vecchia categoria testuale solo come PROPOSTA, e i movimenti di banca che il
 * cash flow consuntivo non vedeva.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { VOCI_CASSA } from "@/lib/controlloGestione/vociCassa";

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const UTENTE = "00000000-0000-0000-0000-0000000000u1".replace("u", "f");
const CONTO_A = "00000000-0000-0000-0000-0000000000c1";
const CONTO_B = "00000000-0000-0000-0000-0000000000c2";

let db: PGlite;

function migrazione(nome = "_cassa_catalogo_voci.sql"): string {
  const f = readdirSync("supabase/migrations").filter((x) => x.endsWith(nome));
  if (f.length !== 1) throw new Error(`attesa una migrazione, trovate ${f.length}`);
  return readFileSync(`supabase/migrations/${f[0]}`, "utf8");
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema private;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('test.role', true), ''), 'authenticated') $$;

    create table companies (id uuid primary key, name text);
    insert into companies values ('${A}', 'Azienda A'), ('${B}', 'Azienda B');

    -- Permessi finti: una riga = l'utente ha quel permesso in quell'azienda.
    create table permessi (utente uuid, permesso text, azienda uuid);
    create function has_permission_for_company(u uuid, p text, c uuid) returns boolean language sql stable as $$
      select exists (select 1 from public.permessi where utente = u and permesso = p and azienda = c) $$;
    create function aziende_con_permesso(p text) returns uuid[] language sql stable as $$
      select coalesce(array_agg(azienda), '{}') from public.permessi where utente = auth.uid() and permesso = p $$;
    create function utente_bloccato() returns boolean language sql stable as $$ select false $$;
    create function utente_e_cliente_esterno() returns boolean language sql stable as $$ select false $$;
    create function utente_sola_lettura(c uuid) returns boolean language sql stable as $$ select false $$;
    create function user_can_read_accountant_company(c uuid) returns boolean language sql stable as $$ select false $$;
    create function private.bank_operativa_access(c uuid, w boolean default false) returns void language plpgsql as $$
    begin
      if not public.has_permission_for_company(auth.uid(), 'can_view_tesoreria', c)
         or (w and not public.has_permission_for_company(auth.uid(), 'can_reconcile_bank_transactions', c)) then
        raise exception 'Non hai il permesso di gestire questi movimenti' using errcode = '42501';
      end if;
    end $$;

    create table bank_accounts (id uuid primary key, company_id uuid, is_manual boolean default false);
    insert into bank_accounts values ('${CONTO_A}', '${A}', false), ('${CONTO_B}', '${B}', false);
    create table bank_transactions (
      id uuid primary key default gen_random_uuid(),
      company_id uuid not null, account_id uuid,
      booking_date date, amount numeric, amount_eur numeric, currency text default 'EUR',
      description text, counterparty_name text, debtor_name text, creditor_name text,
      counterparty_iban text, debtor_iban text, creditor_iban text,
      transaction_type text, status text default 'booked', category text, note text,
      reconciliation_status text default 'pending',
      operativita_revision integer not null default 1
    );
    create table treasury_categories (id uuid primary key);
    create table prima_nota_entries (id uuid primary key default gen_random_uuid(), company_id uuid,
      bank_transaction_id uuid, reversal_of uuid);
  `);
  await db.exec(migrazione());
  await db.exec(migrazione("_cassa_classifica_movimenti.sql"));
  await db.exec(`
    create trigger bank_transaction_operator_guard before insert or delete or update on bank_transactions
      for each row execute function bank_transaction_operator_guard();
  `);
}, 120000);

afterAll(async () => db?.close());
beforeEach(async () => {
  await db.exec("begin");
  await db.exec(`select set_config('test.uid', '${UTENTE}', true), set_config('test.role', 'service_role', true)`);
  await db.exec(`insert into permessi values
    ('${UTENTE}', 'can_view_tesoreria', '${A}'), ('${UTENTE}', 'can_reconcile_bank_transactions', '${A}'),
    ('${UTENTE}', 'can_view_controllo_gestione', '${A}'),
    ('${UTENTE}', 'can_view_tesoreria', '${B}'), ('${UTENTE}', 'can_view_controllo_gestione', '${B}')`);
});
afterEach(async () => db.exec("rollback"));

const uno = async <T,>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];
const comeUtente = () => db.exec(`select set_config('test.role', 'authenticated', true)`);
const prepara = (c = A) => uno<{ r: { create: number; totale: number } }>(`select public.cassa_catalogo_prepara($1) r`, [c]);
const voce = (codice: string, c = A) =>
  uno<{ id: string; nome: string; livello: string; flusso: string }>(
    "select id, nome, livello, flusso from cassa_voci where company_id = $1 and codice = $2", [c, codice]);
async function movimento(campi: { amount: number; category?: string | null; data?: string; company?: string; status?: string; riconciliazione?: string; controparte?: string; iban?: string }) {
  const r = await uno<{ id: string }>(
    `insert into bank_transactions (company_id, account_id, booking_date, amount, transaction_type, category, status, reconciliation_status, description, counterparty_name, counterparty_iban)
     values ($1, $2, $3, $4, $5, $6, $7, $8, 'mov', $9, $10) returning id`,
    [campi.company ?? A, (campi.company ?? A) === A ? CONTO_A : CONTO_B, campi.data ?? "2026-11-13", campi.amount,
     campi.amount >= 0 ? "credit" : "debit", campi.category ?? null, campi.status ?? "booked", campi.riconciliazione ?? "pending",
     campi.controparte ?? null, campi.iban ?? null]);
  return r.id;
}
const categoria = (tx: string, v: string | null, rev = 1, motivo: string | null = null) =>
  db.query("select public.bank_movimento_categoria($1, $2, $3, $4, $5) rev", [A, tx, v, rev, motivo]);

describe("il catalogo base è l'Excel", () => {
  it("330 voci, codici unici", async () => {
    expect((await uno<{ n: number }>("select count(*)::int n from cassa_catalogo_base")).n).toBe(330);
  });
  it("corregge l'errore del file: «Rimborsi fiscali ricevuti» è un'entrata", async () => {
    const r = await uno<{ flusso: string; voce_cassa_in: string }>("select flusso, voce_cassa_in from cassa_catalogo_base where codice = '12.12'");
    expect(r).toEqual({ flusso: "entrata", voce_cassa_in: "inc_fiscali" });
  });
  it("ogni voce che muove denaro sa in che riga del cash flow finisce", async () => {
    const r = await uno<{ n: number }>(
      "select count(*)::int n from cassa_catalogo_base where flusso <> 'nessuno' and voce_cassa_in is null and voce_cassa_out is null");
    expect(r.n).toBe(0);
  });
  it("le righe del database sono le stesse del codice del rendiconto", async () => {
    const r = await uno<{ righe: string[] }>("select private.cassa_righe_rendiconto() righe");
    const nelCodice = new Set(VOCI_CASSA.map((v) => v.key));
    for (const k of r.righe) expect(nelCodice.has(k as never), k).toBe(true);
  });
  it("le voci senza cassa, le fasi e l'infragruppo partono spente", async () => {
    const r = await db.query<{ codice: string; attiva_di_partenza: boolean }>(
      "select codice, attiva_di_partenza from cassa_catalogo_base where codice in ('22.01','01.13','37.01','04.02') order by codice");
    expect(Object.fromEntries(r.rows.map((x) => [x.codice, x.attiva_di_partenza]))).toEqual({
      "01.13": false, "04.02": true, "22.01": false, "37.01": false,
    });
  });
});

describe("la copia dell'azienda", () => {
  it("nasce dal catalogo: aree, categorie e voci, nella gerarchia giusta", async () => {
    const r = await prepara();
    expect(r.r.create).toBe(r.r.totale);
    const g = await db.query<{ livello: string; n: number }>(
      "select livello, count(*)::int n from cassa_voci where company_id = $1 group by livello order by livello", [A]);
    expect(Object.fromEntries(g.rows.map((x) => [x.livello, x.n]))).toMatchObject({ voce: 330, categoria: 44 });
    const v = await uno<{ cat: string; area: string }>(
      `select c.nome cat, a.nome area from cassa_voci v join cassa_voci c on c.id = v.parent_id join cassa_voci a on a.id = c.parent_id
        where v.company_id = $1 and v.codice = '04.02'`, [A]);
    expect(v).toEqual({ cat: "Materiali e merci", area: "Operativa" });
  });

  it("rilanciarla non duplica niente e non tocca ciò che l'azienda ha cambiato", async () => {
    await prepara();
    const v = await voce("04.02");
    await comeUtente();
    await db.query("select public.cassa_voce_salva($1, $2, $3)", [A, v.id, { nome: "Cemento e inerti", attiva: false }]);
    const r = await prepara();
    expect(r.r.create).toBe(0);
    expect(await voce("04.02")).toMatchObject({ nome: "Cemento e inerti" });
  });

  it("una voce nuova di un'azienda non compare nell'altra", async () => {
    await prepara(A);
    await prepara(B);
    await comeUtente();
    const cat = await voce("04");
    const nuova = await uno<{ id: string }>("select public.cassa_voce_salva($1, null, $2) id", [A, { parent_id: cat.id, nome: "Cappotto termico" }]);
    const r = await uno<{ codice: string; company_id: string; livello: string; voce_cassa_out: string }>(
      "select codice, company_id, livello, voce_cassa_out from cassa_voci where id = $1", [nuova.id]);
    expect(r).toEqual({ codice: "04.X01", company_id: A, livello: "voce", voce_cassa_out: "usc_materiali" });
    expect((await uno<{ n: number }>("select count(*)::int n from cassa_voci where company_id = $1 and nome = 'Cappotto termico'", [B])).n).toBe(0);
  });

  it("chi non ha il controllo di gestione non configura", async () => {
    await prepara();
    await db.exec(`delete from permessi where permesso = 'can_view_controllo_gestione'`);
    await comeUtente();
    const v = await voce("04.02");
    await expect(db.query("select public.cassa_voce_salva($1, $2, $3)", [A, v.id, { nome: "x" }])).rejects.toThrow(/permesso/);
  });

  it("non accetta una riga del cash flow inventata", async () => {
    await prepara();
    await comeUtente();
    const v = await voce("04.02");
    await expect(db.query("select public.cassa_voce_salva($1, $2, $3)", [A, v.id, { voce_cassa_out: "usc_inventata" }]))
      .rejects.toThrow(/sconosciuta/);
  });

  it("non si mette un'azienda dentro l'altra", async () => {
    await prepara(A);
    await prepara(B);
    const catB = await voce("04", B);
    await expect(db.query(
      "insert into cassa_voci (company_id, codice, parent_id, livello, nome, flusso, sezione) values ($1, 'z', $2, 'voce', 'z', 'uscita', 'operativa')",
      [A, catB.id])).rejects.toThrow(/altra azienda/);
  });
});

describe("la categoria di un movimento", () => {
  beforeEach(async () => { await prepara(); });

  it("si salva con origine, autore e storico (motivo compreso)", async () => {
    const tx = await movimento({ amount: -7800 });
    const v = await voce("04.06");
    await comeUtente();
    const r = await categoria(tx, v.id, 1, "fattura di materiale elettrico");
    expect(r.rows[0]).toEqual({ rev: 2 });
    const t = await uno<{ cassa_voce_id: string; cassa_voce_origine: string; cassa_voce_da: string; category: string }>(
      "select cassa_voce_id, cassa_voce_origine, cassa_voce_da, category from bank_transactions where id = $1", [tx]);
    expect(t).toEqual({ cassa_voce_id: v.id, cassa_voce_origine: "manuale", cassa_voce_da: UTENTE, category: "Materiale elettrico" });
    const s = await uno<{ a_voce_id: string; autore: string; motivo: string; origine: string }>(
      "select a_voce_id, autore, motivo, origine from cassa_voce_storico where bank_transaction_id = $1", [tx]);
    expect(s).toEqual({ a_voce_id: v.id, autore: UTENTE, motivo: "fattura di materiale elettrico", origine: "manuale" });
  });

  it("un'uscita non va in una voce di sole entrate", async () => {
    const tx = await movimento({ amount: -100 });
    await comeUtente();
    await expect(categoria(tx, (await voce("01.04")).id)).rejects.toThrow(/entrate/);
  });

  it("una voce senza cassa non va su un movimento di banca", async () => {
    const tx = await movimento({ amount: -100 });
    const amm = await voce("22.01");
    await db.query("update cassa_voci set attiva = true where id = $1", [amm.id]);
    await comeUtente();
    await expect(categoria(tx, amm.id)).rejects.toThrow(/non muove denaro/);
  });

  it("si sceglie una voce, non una categoria intera", async () => {
    const tx = await movimento({ amount: -100 });
    await comeUtente();
    await expect(categoria(tx, (await voce("04")).id)).rejects.toThrow(/non una categoria/);
  });

  it("una voce spenta o archiviata non si usa", async () => {
    const tx = await movimento({ amount: -100 });
    await comeUtente();
    await expect(categoria(tx, (await voce("01.13")).id)).rejects.toThrow(/non è attiva/);
  });

  it("una voce dell'altra azienda non si usa", async () => {
    await prepara(B);
    const tx = await movimento({ amount: -100 });
    await comeUtente();
    await expect(categoria(tx, (await voce("04.02", B)).id)).rejects.toThrow(/non trovata/);
  });

  it("due finestre aperte: la seconda non sovrascrive la prima", async () => {
    const tx = await movimento({ amount: -100 });
    await comeUtente();
    await categoria(tx, (await voce("04.02")).id, 1);
    await expect(categoria(tx, (await voce("04.06")).id, 1)).rejects.toThrow(/un’altra finestra/);
  });

  it("i giroconti vanno nei due versi", async () => {
    const entrata = await movimento({ amount: 500 });
    const uscita = await movimento({ amount: -500 });
    await comeUtente();
    const g = (await voce("21.01")).id;
    await categoria(entrata, g);
    await categoria(uscita, g);
  });

  it("una voce usata non si cancella: si archivia", async () => {
    const tx = await movimento({ amount: -100 });
    const v = await voce("04.02");
    await comeUtente();
    await categoria(tx, v.id);
    await db.exec(`select set_config('test.role', 'service_role', true)`);
    await expect(db.query("delete from cassa_voci where id = $1", [v.id])).rejects.toThrow(/foreign key|violates/);
  });

  it("un operatore cambia la categoria ma non l'importo arrivato dalla banca", async () => {
    const tx = await movimento({ amount: -100 });
    await comeUtente();
    await categoria(tx, (await voce("04.02")).id);
    await expect(db.query("update bank_transactions set amount = 1 where id = $1", [tx])).rejects.toThrow(/non si possono riscrivere/);
  });
});

describe("la vecchia categoria testuale è solo una proposta", () => {
  beforeEach(async () => { await prepara(); });

  it("«Materiali e forniture» propone la categoria Materiali, senza confermarla", async () => {
    const tx = await movimento({ amount: -3200, category: "Materiali e forniture" });
    const r = await uno<{ r: Record<string, { codice: string; origine: string; confermata: boolean }> }>(
      "select public.cassa_voci_movimenti($1, $2) r", [A, [tx]]);
    expect(r.r[tx]).toMatchObject({ codice: "04", origine: "storico", confermata: false });
    const t = await uno<{ cassa_voce_id: string | null }>("select cassa_voce_id from bank_transactions where id = $1", [tx]);
    expect(t.cassa_voce_id).toBeNull();
  });

  it("«altro» e «pagamento_fornitore» non propongono niente", async () => {
    const a = await movimento({ amount: -1, category: "altro" });
    const b = await movimento({ amount: -1, category: "pagamento_fornitore" });
    const r = await uno<{ r: Record<string, unknown> }>("select public.cassa_voci_movimenti($1, $2) r", [A, [a, b]]);
    expect(r.r).toEqual({});
  });

  it("una scelta confermata vince sul testo", async () => {
    const tx = await movimento({ amount: -480, category: "Veicoli" });
    await comeUtente();
    await categoria(tx, (await voce("18.02")).id);
    const r = await uno<{ r: Record<string, { codice: string; confermata: boolean }> }>(
      "select public.cassa_voci_movimenti($1, $2) r", [A, [tx]]);
    expect(r.r[tx]).toMatchObject({ codice: "18.02", confermata: true });
  });
});

describe("i movimenti di banca per il cash flow consuntivo", () => {
  beforeEach(async () => { await prepara(); });
  const banca = async (anno = 2026) =>
    (await uno<{ r: { movimenti: Array<{ id: string; in_prima_nota: boolean; voce: { in: string | null; out: string | null } | null }>; dopo_anno_cents: number } }>(
      "select public.cassa_rendiconto_banca($1, $2) r", [A, anno])).r;

  it("un movimento senza prima nota adesso c'è", async () => {
    const tx = await movimento({ amount: -7800, category: "Materiali e forniture" });
    const r = await banca();
    expect(r.movimenti.map((m) => m.id)).toEqual([tx]);
    expect(r.movimenti[0].in_prima_nota).toBe(false);
  });

  it("uno già in prima nota arriva solo se ha una categoria confermata (che vince sul testo copiato)", async () => {
    const senza = await movimento({ amount: -100 });
    const con = await movimento({ amount: -480, category: "Veicoli" });
    await db.query("insert into prima_nota_entries (company_id, bank_transaction_id) values ($1, $2), ($1, $3)", [A, senza, con]);
    await comeUtente();
    await categoria(con, (await voce("18.02")).id);
    const r = await banca();
    expect(r.movimenti).toHaveLength(1);
    expect(r.movimenti[0]).toMatchObject({ id: con, in_prima_nota: true, voce: { out: "fin_leasing" } });
  });

  it("una prima nota stornata non conta: il movimento torna da registrare", async () => {
    const tx = await movimento({ amount: -100 });
    const p = await uno<{ id: string }>("insert into prima_nota_entries (company_id, bank_transaction_id) values ($1, $2) returning id", [A, tx]);
    await db.query("insert into prima_nota_entries (company_id, reversal_of) values ($1, $2)", [A, p.id]);
    expect((await banca()).movimenti.map((m) => m.id)).toEqual([tx]);
  });

  it("fuori i movimenti non contabilizzati, ignorati, di altri anni o di altre aziende", async () => {
    await movimento({ amount: -1, status: "pending" });
    await movimento({ amount: -1, riconciliazione: "ignored" });
    await movimento({ amount: -1, data: "2025-12-31" });
    await movimento({ amount: -1, company: B });
    expect((await banca()).movimenti).toHaveLength(0);
  });

  it("il netto dopo l'anno serve al saldo degli anni passati", async () => {
    await movimento({ amount: -100, data: "2026-03-01" });
    await movimento({ amount: 250, data: "2026-04-01" });
    expect((await banca(2025)).dopo_anno_cents).toBe(15000);
  });
});

describe("classificare in blocco dal Cash flow", () => {
  beforeEach(async () => { await prepara(); });
  type Riga = { id: string; revisione: number; voce: { codice: string; origine: string; confermata: boolean } | null };
  const lista = async () =>
    (await uno<{ r: Riga[] }>("select public.cassa_movimenti_da_classificare($1, '2026-01-01', '2026-12-31') r", [A])).r;
  const inBlocco = (ids: string[], voce: string, anche = false) =>
    uno<{ r: { aggiornati: number; saltati: number } }>(
      "select public.cassa_classifica_movimenti($1, $2, $3, 'prova', $4) r", [A, ids, voce, anche]);

  it("propone la categoria che hai scelto l'ultima volta per la stessa controparte", async () => {
    const vecchio = await movimento({ amount: -900, controparte: "Ferramenta Rossi", iban: "IT60X0542811101000000123456", data: "2026-10-01" });
    const nuovo = await movimento({ amount: -1200, controparte: "FERRAMENTA ROSSI SRL", iban: "IT60X0542811101000000123456", category: "altro" });
    await comeUtente();
    await categoria(vecchio, (await voce("04.12")).id);
    const r = (await lista()).find((x) => x.id === nuovo)!;
    expect(r.voce).toMatchObject({ codice: "04.12", origine: "controparte", confermata: false });
  });

  it("la proposta della controparte non attraversa il verso: un rimborso dal fornitore non diventa un acquisto", async () => {
    const uscita = await movimento({ amount: -900, controparte: "Ferramenta Rossi", iban: "IT00A", data: "2026-10-01" });
    const entrata = await movimento({ amount: 50, controparte: "Ferramenta Rossi", iban: "IT00A" });
    await comeUtente();
    await categoria(uscita, (await voce("04.12")).id);
    expect((await lista()).find((x) => x.id === entrata)!.voce).toBeNull();
  });

  it("classifica più movimenti insieme, con storico per ognuno", async () => {
    const a = await movimento({ amount: -100 });
    const b = await movimento({ amount: -200 });
    await comeUtente();
    const r = await inBlocco([a, b], (await voce("09.01")).id);
    expect(r.r).toEqual({ aggiornati: 2, saltati: 0 });
    expect((await uno<{ n: number }>("select count(*)::int n from cassa_voce_storico where motivo = 'prova'")).n).toBe(2);
  });

  it("non riclassifica in silenzio quello che una persona ha già confermato", async () => {
    const a = await movimento({ amount: -100 });
    const b = await movimento({ amount: -200 });
    await comeUtente();
    await categoria(a, (await voce("04.02")).id);
    const r = await inBlocco([a, b], (await voce("09.01")).id);
    expect(r.r).toEqual({ aggiornati: 1, saltati: 1 });
    expect((await uno<{ c: string }>("select v.codice c from bank_transactions t join cassa_voci v on v.id = t.cassa_voce_id where t.id = $1", [a])).c).toBe("04.02");
    const forzato = await inBlocco([a], (await voce("09.01")).id, true);
    expect(forzato.r.aggiornati).toBe(1);
  });

  it("rifiuta tutto se nella selezione c'è un movimento nel verso sbagliato", async () => {
    const a = await movimento({ amount: -100 });
    const b = await movimento({ amount: 300 });
    await comeUtente();
    const v = (await voce("09.01")).id;
    await db.exec("savepoint prima");
    await expect(inBlocco([a, b], v)).rejects.toThrow(/altro verso/);
    await db.exec("rollback to savepoint prima");
    expect((await uno<{ n: number }>("select count(*)::int n from bank_transactions where cassa_voce_id is not null")).n).toBe(0);
  });

  it("non tocca i movimenti di un'altra azienda anche se il loro id è nella lista", async () => {
    await prepara(B);
    const mio = await movimento({ amount: -100 });
    const altrui = await movimento({ amount: -100, company: B });
    await comeUtente();
    const r = await inBlocco([mio, altrui], (await voce("09.01")).id);
    expect(r.r.aggiornati).toBe(1);
    expect((await uno<{ v: string | null }>("select cassa_voce_id v from bank_transactions where id = $1", [altrui])).v).toBeNull();
  });

  it("la lista dà la revisione giusta per una modifica successiva", async () => {
    const a = await movimento({ amount: -100 });
    await comeUtente();
    await inBlocco([a], (await voce("09.01")).id);
    const r = (await lista()).find((x) => x.id === a)!;
    expect(r.revisione).toBe(2);
    expect(r.voce).toMatchObject({ codice: "09.01", origine: "manuale", confermata: true });
  });
});
