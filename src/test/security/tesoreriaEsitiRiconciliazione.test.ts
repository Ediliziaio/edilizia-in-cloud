// Motore degli esiti di riconciliazione (area C, 15/11/2026): regole esplicite, cinque esiti,
// nessun doppio conteggio. PostgreSQL vero (PGlite) sullo schema ridotto della tesoreria.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

const pg = new PGlite();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const company = id(1), other = id(2), user = id(3), accA = id(4), accB = id(5), accOther = id(6);
const IBAN_A = "IT60X0542811101000000123456", IBAN_B = "IT60X0542811101000000654321";
let seq = 1000;
const nid = () => id(++seq);

async function rpc<T = any>(fn: string, args: unknown[]) {
  return (await pg.query<{ v: T }>(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(",")}) v`, args)).rows[0].v;
}
async function service(sql: string, params: unknown[] = []) {
  await pg.exec(`reset role;select set_config('test.role','service_role',false);`);
  try {
    return await pg.query<any>(sql, params);
  } finally {
    await pg.exec(`select set_config('test.role','authenticated',false);set role authenticated;`);
  }
}
async function tx(o: { amount: number; type: "credit" | "debit"; desc?: string; name?: string; iban?: string; account?: string; date?: string; company?: string }) {
  const t = nid();
  const cred = o.type === "credit";
  await service(
    `insert into bank_transactions(id,company_id,account_id,booking_date,amount,transaction_type,description,debtor_name,debtor_iban,creditor_name,creditor_iban)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [t, o.company ?? company, o.account ?? accA, o.date ?? "2026-11-12", cred ? o.amount : -o.amount, o.type, o.desc ?? "",
      cred ? o.name ?? null : null, cred ? o.iban ?? null : null, cred ? null : o.name ?? null, cred ? null : o.iban ?? null],
  );
  return t;
}
async function doc(o: { numero: string; anno?: number; totale: number; cliente: string; pagato?: number; tipo?: string; company?: string }) {
  const d = nid();
  await service(
    `insert into documenti_fiscali(id,company_id,numero,anno,totale_da_pagare,importo_pagato,cliente_snapshot,tipo,data_scadenza) values($1,$2,$3,$4,$5,$6,$7,$8,'2026-11-10')`,
    [d, o.company ?? company, o.numero, o.anno ?? 2026, o.totale, o.pagato ?? 0, JSON.stringify({ ragione_sociale: o.cliente }), o.tipo ?? "fattura"],
  );
  return d;
}
async function supplier(name: string, iban?: string) {
  const s = nid();
  await service(`insert into suppliers(id,company_id,name,iban) values($1,$2,$3,$4)`, [s, company, name, iban ?? null]);
  return s;
}
async function scad(o: { amount: number; supplier?: string; desc: string; tipo?: string; previsionale?: boolean; order?: string; due?: string; paid?: number }) {
  const s = nid();
  await service(
    `insert into scadenze(id,company_id,supplier_id,description,direction,amount,paid_amount,tipo,is_previsionale,order_id,due_date) values($1,$2,$3,$4,'uscita',$5,$6,$7,$8,$9,$10)`,
    [s, company, o.supplier ?? null, o.desc, o.amount, o.paid ?? 0, o.tipo ?? "pagamento_fornitore", o.previsionale ?? false, o.order ?? null, o.due ?? "2026-11-10"],
  );
  return s;
}
const classifica = (t: string) => rpc("tesoreria_classifica_movimento", [company, t]);

beforeAll(async () => {
  await pg.exec(await readFile("src/test/fixtures/bankWorkspace.sql", "utf8"));
  await pg.exec(await readFile("src/test/fixtures/bankRecalc.sql", "utf8"));
  await pg.exec(await readFile("supabase/migrations/20290316140000_bank_movimenti_workspace_ripartizioni.sql", "utf8"));
  // Colonne e tabelle di produzione che lo schema ridotto non ha.
  await pg.exec(`
   alter table bank_accounts add column iban text;
   alter table suppliers add column iban text;
   alter table documenti_fiscali add column anno int;
   drop view documenti_fiscali_elenco_operativo;
   create view documenti_fiscali_elenco_operativo as select *, 'nativa'::text origine, 0::numeric stornato from documenti_fiscali;
   alter table fattura_ordine add column importo_associato numeric;
   alter table company_costs add column amount numeric, add column supplier_id uuid, add column senza_fattura boolean default false,
     add column notes text, add column allocations jsonb, add column documento_riferimento text, add column documento_data date;
   alter table scadenze add column tipo text;
   alter table orders add column client_name text, add column client_company text;
   create table order_installments(id uuid primary key,order_id uuid,label text,amount numeric,is_paid boolean default false,invoice_id uuid,documento_fiscale_id uuid,expected_date date);
   create table fornitori_iban_storico(id uuid primary key default gen_random_uuid(),company_id uuid,fornitore_id uuid,iban text,confermato boolean default false);
   grant select,insert,update,delete on order_installments,fornitori_iban_storico to authenticated;`);
  await pg.exec(await readFile("supabase/migrations/20290404310000_tesoreria_esiti_riconciliazione.sql", "utf8"));
  await pg.exec(await readFile("supabase/migrations/20290404311000_tesoreria_esiti_regole_dati_veri.sql", "utf8"));
  await pg.exec(await readFile("supabase/migrations/20290404312000_tesoreria_guardia_solo_se_verificato.sql", "utf8"));
}, 60000);

beforeEach(async () => {
  await pg.exec(`reset role;select set_config('test.user','${user}',false);select set_config('test.role','service_role',false);
   truncate tesoreria_esiti_storia,tesoreria_esiti,tesoreria_paganti_autorizzati,scadenze_sostituzioni,bank_reconciliations,bank_transactions,bank_accounts,
     documenti_fiscali,scadenze,suppliers,company_costs,fattura_ordine,orders,order_installments,fornitori_iban_storico,prima_nota_entries,test_permissions,companies cascade;
   insert into companies values('${company}'),('${other}');
   insert into test_permissions values('${company}',true,true,true);
   insert into bank_accounts(id,company_id,account_name,iban) values('${accA}','${company}','Conto A','${IBAN_A}'),('${accB}','${company}','Conto B','${IBAN_B}'),('${accOther}','${other}','Altro','IT00X0000000000000000000001');
   select set_config('test.role','authenticated',false);set role authenticated;`);
});
afterAll(() => pg.close());

describe("Esiti della riconciliazione", () => {
  it("documento unico verificato: numero, anno e soggetto → automatico", async () => {
    const d = await doc({ numero: "FT-2026-0012", totale: 1000, cliente: "Alfa Costruzioni S.r.l." });
    const t = await tx({ amount: 1000, type: "credit", desc: "Saldo fattura 12/2026", name: "ALFA COSTRUZIONI SRL" });
    const r = await classifica(t);
    expect(r.esito).toBe("automatico");
    expect(r.natura).toBe("documento");
    expect(r.regola).toBe("R-DOC");
    expect(r.candidati).toHaveLength(1);
    expect(r.candidati[0].righe[0]).toMatchObject({ id: d, quota: 1000 });
    expect(r.motivi).toContain("Numero e anno del documento nella causale");
  });

  it("numero di un altro anno: conflitto, importo e nome non lo compensano", async () => {
    await doc({ numero: "FT-2026-0012", totale: 1000, cliente: "Alfa Costruzioni" });
    const t = await tx({ amount: 1000, type: "credit", desc: "fatt. 12/2025", name: "Alfa Costruzioni" });
    const r = await classifica(t);
    expect(r.esito).toBe("conflitto");
    expect(r.candidati).toEqual([]);
    expect(r.conflitti[0].motivi[0]).toMatch(/anno diverso/);
  });

  it("pagante diverso: conflitto finché il rapporto non è documentato", async () => {
    const d = await doc({ numero: "FT-2026-0077", totale: 500, cliente: "Mario Bianchi" });
    const t = await tx({ amount: 500, type: "credit", desc: "pagamento fattura 77/2026", name: "Immobiliare Verdi" });
    expect((await classifica(t)).esito).toBe("conflitto");
    await service(`insert into tesoreria_paganti_autorizzati(company_id,soggetto_nome,pagante_nome,prova) values($1,'Mario Bianchi','Immobiliare Verdi','Delega di pagamento del 01/11')`, [company]);
    const r = await classifica(t);
    expect(r.esito).toBe("automatico");
    expect(r.candidati[0].righe[0].id).toBe(d);
  });

  it("la data nella causale non è un numero di fattura; una banca non è un pagante", async () => {
    const d = await doc({ numero: "412", anno: 2026, totale: 3000, cliente: "Sigma Impianti Srl" });
    await doc({ numero: "26", anno: 2025, totale: 3000, cliente: "Altro Cliente" });
    await doc({ numero: "5", anno: 2024, totale: 3000, cliente: "Terzo Cliente" });
    const t = await tx({ amount: 3000, type: "credit", desc: "FATTURA N. 412/2026 DEL 26/05/2026", name: "DEUTSCHE BANK SPA" });
    const r = await classifica(t);
    expect(r.conflitti).toEqual([]);
    expect(r.esito).toBe("proposta");
    expect(r.candidati[0].righe[0].id).toBe(d);
  });

  it("acquisto con carta: da gestire, con il perché", async () => {
    const r = await classifica(await tx({ amount: 76.5, type: "debit", desc: "", name: "BRICOLAGE SRL" }));
    expect(r).toMatchObject({ esito: "da_gestire", natura: "spesa_carta" });
    expect(r.mancanti.join(" ")).toMatch(/ricevuta o la fattura/);
  });

  it("controparte con partite aperte ma nessun importo che torna: lo dice", async () => {
    await doc({ numero: "FT-2026-0201", totale: 900, cliente: "Ypsilon Srl" });
    const r = await classifica(await tx({ amount: 5000, type: "credit", desc: "bonifico", name: "YPSILON SRL" }));
    expect(r.esito).toBe("proposta"); // parziale non possibile (5.000 > 900): eccedenza da qualificare
    expect(r.natura).toBe("eccedenza");
    expect(r.differenza).toBe(4100);
  });

  it("due documenti uguali dello stesso soggetto: scelta motivata, non automatico", async () => {
    await doc({ numero: "FT-2026-0101", totale: 300, cliente: "Teta Srl" });
    await doc({ numero: "FT-2026-0102", totale: 300, cliente: "Teta Srl" });
    const r = await classifica(await tx({ amount: 300, type: "credit", desc: "bonifico", name: "TETA SRL" }));
    expect(r.esito).toBe("scelta");
    expect(r.candidati).toHaveLength(2);
  });

  it("pagamento cumulativo: due fatture dello stesso cliente che sommano esattamente", async () => {
    const a = await doc({ numero: "FT-2026-0021", totale: 400, cliente: "Gamma Spa" });
    const b = await doc({ numero: "FT-2026-0022", totale: 600, cliente: "Gamma Spa" });
    await doc({ numero: "FT-2026-0023", totale: 300, cliente: "Gamma Spa" });
    const r = await classifica(await tx({ amount: 1000, type: "credit", desc: "pagamento fatture", name: "GAMMA S.P.A." }));
    expect(r.esito).toBe("proposta");
    expect(r.natura).toBe("cumulativo");
    expect(r.candidati[0].righe.map((x: any) => x.id).sort()).toEqual([a, b].sort());
    expect(r.candidati[0].righe.reduce((s: number, x: any) => s + Number(x.quota), 0)).toBe(1000);
  });

  it("parziale, poi saldo: il secondo bonifico vede solo il residuo", async () => {
    const d = await doc({ numero: "FT-2026-0031", totale: 1000, cliente: "Delta Impianti" });
    const r1 = await classifica(await tx({ amount: 400, type: "credit", desc: "acconto fattura 31/2026", name: "Delta Impianti" }));
    expect(r1).toMatchObject({ esito: "proposta", natura: "parziale" });
    expect(r1.candidati[0].righe[0]).toMatchObject({ id: d, quota: 400 });
    await service(`update documenti_fiscali set importo_pagato=400 where id=$1`, [d]); // conferma del primo
    const r2 = await classifica(await tx({ amount: 600, type: "credit", desc: "saldo fattura 31/2026", name: "Delta Impianti" }));
    expect(r2.esito).toBe("automatico");
    expect(r2.candidati[0].righe[0]).toMatchObject({ id: d, residuo: 600, quota: 600 });
  });

  it("acconto prima della fattura: rata della commessa; fatturata la rata, si propone la fattura", async () => {
    const o = nid(), rata = nid();
    await service(`insert into orders(id,company_id,order_code,client_company) values($1,$2,'C-26-001','Epsilon Srl')`, [o, company]);
    await service(`insert into order_installments(id,order_id,label,amount) values($1,$2,'Acconto 30%',2000)`, [rata, o]);
    const t = await tx({ amount: 2000, type: "credit", desc: "acconto lavori", name: "EPSILON SRL" });
    const r = await classifica(t);
    expect(r).toMatchObject({ esito: "proposta", natura: "acconto", regola: "R-ACCONTO" });
    expect(r.candidati[0].righe[0]).toMatchObject({ tipo: "rata", id: rata });
    expect(r.commesse).toEqual([{ order_id: o, quota: 2000 }]);
    const d = await doc({ numero: "FT-2026-0050", totale: 2000, cliente: "Epsilon Srl" });
    await service(`update order_installments set documento_fiscale_id=$1 where id=$2`, [d, rata]);
    const r2 = await classifica(t);
    expect(r2.candidati.flatMap((c: any) => c.righe.map((x: any) => x.tipo))).not.toContain("rata");
    expect(r2.candidati[0].righe[0].id).toBe(d);
  });

  it("compensazione con nota di credito: 1.000 − 200 = 800", async () => {
    const f = await doc({ numero: "FT-2026-0060", totale: 1000, cliente: "Zeta Edile" });
    const nc = await doc({ numero: "NC-2026-0003", totale: 200, cliente: "Zeta Edile", tipo: "nota_credito" });
    const r = await classifica(await tx({ amount: 800, type: "credit", desc: "saldo al netto nota credito", name: "Zeta Edile" }));
    expect(r).toMatchObject({ esito: "proposta", natura: "compensazione_nc", regola: "R-NC" });
    const righe = r.candidati[0].righe;
    expect(righe.map((x: any) => x.id).sort()).toEqual([f, nc].sort());
    expect(righe.find((x: any) => x.id === nc).quota).toBe(-200);
  });

  it("commissione: 999,20 su 1.000 → differenza esposta; oltre 1 € è un parziale col resto aperto", async () => {
    await doc({ numero: "FT-2026-0041", totale: 1000, cliente: "Eta Serramenti" });
    const r = await classifica(await tx({ amount: 999.2, type: "credit", desc: "fattura 41/2026", name: "Eta Serramenti" }));
    expect(r).toMatchObject({ esito: "proposta", natura: "differenza", differenza: 0.8 });
    expect(r.candidati[0].righe[0].quota).toBe(999.2);
    const r2 = await classifica(await tx({ amount: 998.5, type: "credit", desc: "fattura 41/2026", name: "Eta Serramenti" }));
    expect(r2).toMatchObject({ esito: "proposta", natura: "parziale" });
    expect(r2.candidati[0].righe[0].quota).toBe(998.5);
  });

  it("giroconto: IBAN di un altro conto dell'azienda, gamba opposta → nessun costo né ricavo", async () => {
    const out = await tx({ amount: 5000, type: "debit", desc: "trasferimento", iban: IBAN_B, account: accA, date: "2026-11-10" });
    const inn = await tx({ amount: 5000, type: "credit", desc: "trasferimento", iban: IBAN_A, account: accB, date: "2026-11-11" });
    const r = await classifica(out);
    expect(r).toMatchObject({ esito: "automatico", natura: "giroconto", commesse: [] });
    expect(r.candidati[0].righe[0]).toMatchObject({ tipo: "movimento", id: inn });
  });

  it("l'IBAN di un conto di un'altra azienda non è un giroconto", async () => {
    const r = await classifica(await tx({ amount: 5000, type: "debit", desc: "bonifico", iban: "IT00X0000000000000000000001" }));
    expect(r.natura).not.toBe("giroconto");
  });

  it("F24: con la scadenza fiscale è automatico, senza resta da gestire; mai su commessa", async () => {
    const t = await tx({ amount: 1234.56, type: "debit", desc: "DELEGA F24 AGENZIA ENTRATE" });
    const vuoto = await classifica(t);
    expect(vuoto).toMatchObject({ esito: "da_gestire", natura: "f24" });
    expect(vuoto.mancanti[0]).toMatch(/scadenza fiscale/);
    const s = await scad({ amount: 1234.56, desc: "F24 IVA ottobre", tipo: "scadenza_fiscale", order: id(999) });
    const r = await classifica(t);
    expect(r).toMatchObject({ esito: "automatico", natura: "f24", commesse: [] });
    expect(r.candidati[0].righe[0].id).toBe(s);
  });

  it("storno: un accredito che restituisce un addebito non è un ricavo", async () => {
    const orig = await tx({ amount: 500, type: "debit", desc: "bonifico", name: "Kappa Srl", iban: "IT11K0000000000000000000099", date: "2026-11-01" });
    const r = await classifica(await tx({ amount: 500, type: "credit", desc: "storno bonifico", name: "Kappa Srl", iban: "IT11K0000000000000000000099", date: "2026-11-10" }));
    expect(r).toMatchObject({ esito: "proposta", natura: "storno" });
    expect(r.candidati[0].righe[0].id).toBe(orig);
  });

  it("spesa bancaria senza documento: da gestire con la natura suggerita", async () => {
    const r = await classifica(await tx({ amount: 12.5, type: "debit", desc: "Canone mensile conto" }));
    expect(r).toMatchObject({ esito: "da_gestire", natura: "spesa_bancaria" });
  });

  it("solo l'importo non basta: da gestire, con il candidato possibile", async () => {
    await doc({ numero: "FT-2026-0090", totale: 777, cliente: "Iota Snc" });
    const r = await classifica(await tx({ amount: 777, type: "credit", desc: "bonifico", name: "Qualcuno" }));
    expect(r.esito).toBe("da_gestire");
    expect(r.candidati[0].forza).toBe("debole");
  });

  it("IBAN verificato di un altro fornitore blocca la scadenza di questo", async () => {
    const s1 = await supplier("Lambda Srl");
    const s2 = await supplier("Mu Srl");
    await service(`insert into fornitori_iban_storico(company_id,fornitore_id,iban,confermato) values($1,$2,$3,true)`, [company, s2, "IT22M0000000000000000000022"]);
    await scad({ amount: 300, supplier: s1, desc: "Fattura 15 Lambda" });
    const r = await classifica(await tx({ amount: 300, type: "debit", desc: "pagamento Lambda fattura 15", name: "Lambda Srl", iban: "IT22M0000000000000000000022" }));
    expect(r.esito).toBe("conflitto");
    expect(r.conflitti[0].motivi).toContain("IBAN verificato di un altro fornitore");
  });

  it("ripartizione su più commesse dalle allocazioni della fattura", async () => {
    const o1 = nid(), o2 = nid();
    const d = await doc({ numero: "FT-2026-0070", totale: 1000, cliente: "Nu Costruzioni" });
    await service(`insert into fattura_ordine(company_id,fattura_id,ordine_id,importo_associato) values($1,$2,$3,400),($1,$2,$4,600)`, [company, d, o1, o2]);
    const t = await tx({ amount: 1000, type: "credit", desc: "fattura 70/2026", name: "Nu Costruzioni" });
    const r = await classifica(t);
    expect(r.commesse).toEqual([{ order_id: o1, quota: 400 }, { order_id: o2, quota: 600 }].sort((a, b) => a.order_id.localeCompare(b.order_id)));
    expect(r.ripartizione_da_completare).toBe(false);
    await service(`update fattura_ordine set importo_associato=null where fattura_id=$1`, [d]);
    const r2 = await classifica(t);
    expect(r2.ripartizione_da_completare).toBe(true);
    expect(r2.commesse).toEqual([]);
  });

  it("abbinamento annullato: la stessa coppia non si ripropone", async () => {
    const d = await doc({ numero: "FT-2026-0012", totale: 1000, cliente: "Alfa Costruzioni" });
    const t = await tx({ amount: 1000, type: "credit", desc: "Saldo fattura 12/2026", name: "Alfa Costruzioni" });
    await service(`insert into bank_reconciliations(company_id,transaction_id,documento_id,matched_amount,unmatched_at,unmatch_reason) values($1,$2,$3,1000,now(),'abbinamento errato')`, [company, t, d]);
    const r = await classifica(t);
    expect(r.candidati.flatMap((c: any) => c.righe.map((x: any) => x.id))).not.toContain(d);
  });

  it("isolamento: documenti di un'altra azienda non compaiono, e senza permesso non si legge", async () => {
    await doc({ numero: "FT-2026-0012", totale: 1000, cliente: "Alfa Costruzioni", company: other });
    const t = await tx({ amount: 1000, type: "credit", desc: "Saldo fattura 12/2026", name: "Alfa Costruzioni" });
    expect((await classifica(t)).candidati).toEqual([]);
    const altro = await tx({ amount: 1, type: "credit", company: other, account: accOther });
    await expect(rpc("tesoreria_classifica_movimento", [other, altro])).rejects.toThrow(/permesso/);
    await expect(rpc("tesoreria_classifica_movimento", [company, altro])).rejects.toThrow(/non disponibile/);
    await expect(pg.query(`select * from tesoreria_esiti`)).rejects.toThrow(/permission denied/);
  });

  it("classificare non scrive denaro: documenti, scadenze e movimenti restano uguali", async () => {
    await doc({ numero: "FT-2026-0012", totale: 1000, cliente: "Alfa Costruzioni" });
    await scad({ amount: 50, desc: "Fattura 9" });
    await tx({ amount: 1000, type: "credit", desc: "Saldo fattura 12/2026", name: "Alfa Costruzioni" });
    const foto = async () => JSON.stringify((await service(`select (select json_agg(d order by id) from documenti_fiscali d) a,(select json_agg(s order by id) from scadenze s) b,(select json_agg(t order by id) from bank_transactions t) c,(select count(*) from bank_reconciliations) n,(select count(*) from company_costs) k`)).rows);
    const prima = await foto();
    await rpc("tesoreria_classifica_movimenti", [company, 100, false]);
    expect(await foto()).toBe(prima);
  });
});

describe("Registro degli esiti: retry, simultaneità, prove", () => {
  it("anteprima non scrive; retry e chiamate simultanee non duplicano storia", async () => {
    await doc({ numero: "FT-2026-0012", totale: 1000, cliente: "Alfa Costruzioni" });
    const t = await tx({ amount: 1000, type: "credit", desc: "Saldo fattura 12/2026", name: "Alfa Costruzioni" });
    const prev = await rpc("tesoreria_classifica_movimenti", [company, 100, true]);
    expect(prev).toMatchObject({ analizzati: 1, cambiati: 1, anteprima: true, per_esito: { automatico: 1 } });
    expect((await service(`select count(*)::int n from tesoreria_esiti`)).rows[0].n).toBe(0);
    await Promise.all([rpc("tesoreria_classifica_movimenti", [company, 100, false]), rpc("tesoreria_classifica_movimenti", [company, 100, false])]);
    const again = await rpc("tesoreria_classifica_movimenti", [company, 100, false]);
    expect(again.cambiati).toBe(0);
    expect((await service(`select count(*)::int n from tesoreria_esiti_storia where transaction_id=$1`, [t])).rows[0].n).toBe(1);
    const letto = await rpc("tesoreria_esito_movimento", [company, t]);
    expect(letto).toMatchObject({ esito: "automatico", natura: "documento" });
    expect(letto.storia).toHaveLength(1);
  });

  it("la quota confermata eredita regola e prove dalla proposta", async () => {
    const d = await doc({ numero: "FT-2026-0012", totale: 1000, cliente: "Alfa Costruzioni" });
    const t = await tx({ amount: 1000, type: "credit", desc: "Saldo fattura 12/2026", name: "Alfa Costruzioni" });
    await rpc("tesoreria_classifica_movimenti", [company, 100, false]);
    const r = await service(`insert into bank_reconciliations(company_id,transaction_id,documento_id,matched_amount) values($1,$2,$3,1000) returning regola,prove`, [company, t, d]);
    expect(r.rows[0].regola).toBe("R-DOC/v1");
    expect(r.rows[0].prove).toMatchObject({ esito: "automatico", forza: "forte" });
    // a movimento chiuso, la classificazione dice «già riconciliato»
    expect((await classifica(t)).natura).toBe("gia_riconciliato");
  });
});

describe("Controllo di gestione: niente doppi conteggi", () => {
  it("un'uscita che salda un debito registrato non crea un costo nuovo, salvo proposta scartata", async () => {
    const s = await supplier("Omicron Srl", "IT33O0000000000000000000033");
    await service(`insert into fornitori_iban_storico(company_id,fornitore_id,iban,confermato) values($1,$2,'IT33O0000000000000000000033',true)`, [company, s]);
    await scad({ amount: 300, supplier: s, desc: "Fattura 88 Omicron" });
    const t = await tx({ amount: 300, type: "debit", desc: "bonifico", name: "Omicron Srl", iban: "IT33O0000000000000000000033" });
    const ins = () => service(`insert into company_costs(id,company_id,name,amount,senza_fattura,notes) values($1,$2,'Spesa',300,true,$3)`, [nid(), company, `[BANCA:${t}]`]);
    await expect(ins()).rejects.toThrow(/salda un debito già registrato/);
    await rpc("tesoreria_classifica_movimenti", [company, 100, false]);
    await rpc("tesoreria_scarta_esito", [company, t, "È un'altra spesa, non la fattura 88"]);
    await expect(ins()).resolves.toBeTruthy();
    const storia = await rpc("tesoreria_esito_movimento", [company, t]);
    expect(storia.storia.map((x: any) => x.evento)).toEqual(["scartato", "calcolo"]);
  });

  it("guardia: con il numero in causale blocca; solo fornitore e importo passa e il controllo lo segnala", async () => {
    const s = await supplier("Phi Ponteggi");
    await scad({ amount: 450, supplier: s, desc: "Fattura 123 Phi" });
    const t1 = await tx({ amount: 450, type: "debit", desc: "saldo fattura 123", name: "Phi Ponteggi" });
    const ins = (t: string) => service(`insert into company_costs(id,company_id,name,amount,supplier_id,senza_fattura,notes) values($1,$2,'Spesa',450,$3,true,$4)`, [nid(), company, s, `[BANCA:${t}]`]);
    await expect(ins(t1)).rejects.toThrow(/salda un debito già registrato/);
    const t2 = await tx({ amount: 450, type: "debit", desc: "noleggio extra", name: "Phi Ponteggi" });
    await expect(ins(t2)).resolves.toBeTruthy();
    const doppi = await rpc<any[]>("cdg_controllo_doppi", [company]);
    expect(doppi.map((x) => x.controllo)).toContain("spesa_da_banca_su_debito_aperto");
  });

  it("un fornitore che si chiama «Intesa» non è una banca", async () => {
    await doc({ numero: "FT-2026-0301", totale: 1200, cliente: "Intesa Costruzioni Srl" });
    const r = await classifica(await tx({ amount: 1200, type: "credit", desc: "saldo fattura 301/2026", name: "INTESA COSTRUZIONI SRL" }));
    expect(r.esito).toBe("automatico");
  });

  it("la fattura sostituisce la previsione: 1.000 previsti + 800 reali = 1.000 di cassa", async () => {
    const s = await supplier("Pi Forniture");
    const o = nid();
    const p = await scad({ amount: 1000, supplier: s, desc: "Previsione forniture", previsionale: true, order: o });
    const real = await scad({ amount: 800, supplier: s, desc: "Fattura 5 Pi", order: o });
    let row = (await service(`select amount,status from scadenze where id=$1`, [p])).rows[0];
    expect([Number(row.amount), row.status]).toEqual([200, "da_pagare"]);
    const cassa = (await service(`select sum(amount-paid_amount)::numeric v from scadenze where status in('da_pagare','parziale')`)).rows[0].v;
    expect(Number(cassa)).toBe(1000);
    // retry esplicito: nessun secondo taglio
    expect(await rpc("tesoreria_sostituisci_previsione", [company, p, real])).toMatchObject({ gia_fatto: true });
    const sid = (await service(`select id from scadenze_sostituzioni where previsione_id=$1`, [p])).rows[0].id;
    await rpc("tesoreria_annulla_sostituzione", [company, sid]);
    row = (await service(`select amount,status from scadenze where id=$1`, [p])).rows[0];
    expect([Number(row.amount), row.status]).toEqual([1000, "da_pagare"]);
    // una fattura più grande della previsione la chiude intera
    await scad({ amount: 1200, supplier: s, desc: "Fattura 6 Pi", order: o });
    row = (await service(`select amount,status from scadenze where id=$1`, [p])).rows[0];
    expect(row.status).toBe("annullata");
  });

  it("due previsioni candidate: nessuna scelta automatica, il controllo la segnala", async () => {
    const s = await supplier("Rho Noleggi");
    await scad({ amount: 500, supplier: s, desc: "Prev 1", previsionale: true });
    await scad({ amount: 500, supplier: s, desc: "Prev 2", previsionale: true });
    await scad({ amount: 500, supplier: s, desc: "Fattura 7 Rho" });
    const doppi = await rpc<any[]>("cdg_controllo_doppi", [company]);
    expect(doppi.filter((x) => x.controllo === "previsione_non_sostituita")).toHaveLength(2);
  });

  it("controlli: quote oltre il movimento, spesa da banca su debito aperto, ripartizioni non al 100%", async () => {
    const d = await doc({ numero: "FT-2026-0012", totale: 1000, cliente: "Alfa" });
    const t = await tx({ amount: 1000, type: "credit", desc: "x" });
    await service(`insert into bank_reconciliations(company_id,transaction_id,documento_id,matched_amount,regola) values($1,$2,$3,700,'manuale'),($1,$2,$3,400,'manuale')`, [company, t, d]);
    const s = await supplier("Sigma");
    await scad({ amount: 90, supplier: s, desc: "Fattura 3 Sigma" });
    await service(`insert into company_costs(id,company_id,name,amount,supplier_id,senza_fattura,notes) values($1,$2,'Spesa vecchia',90,$3,true,$4)`, [nid(), company, s, `[BANCA:${id(4242)}]`]);
    await service(`insert into company_costs(id,company_id,name,amount,allocations) values($1,$2,'Ripartito',100,'[{"order_id":"${id(77)}","pct":60}]')`, [nid(), company]);
    const tipi = (await rpc<any[]>("cdg_controllo_doppi", [company])).map((x) => x.controllo).sort();
    expect(tipi).toEqual(["allocazioni_non_100", "movimento_oltre_importo", "spesa_da_banca_su_debito_aperto"]);
  });
});
