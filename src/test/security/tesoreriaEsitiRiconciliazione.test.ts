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
async function doc(o: { numero: string; anno?: number; totale: number; cliente: string; pagato?: number; tipo?: string; company?: string; piva?: string }) {
  const d = nid();
  await service(
    `insert into documenti_fiscali(id,company_id,numero,anno,totale_da_pagare,importo_pagato,cliente_snapshot,tipo,data_scadenza) values($1,$2,$3,$4,$5,$6,$7,$8,'2026-11-10')`,
    [d, o.company ?? company, o.numero, o.anno ?? 2026, o.totale, o.pagato ?? 0, JSON.stringify({ ragione_sociale: o.cliente, ...(o.piva ? { partita_iva: o.piva } : {}) }), o.tipo ?? "fattura"],
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
  // Come in produzione: l'identità viene dai claim della richiesta; qui, se mancano, dai parametri di prova.
  await pg.exec(`
   create or replace function auth.uid() returns uuid language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('test.user',true),''))::uuid$$;
   create or replace function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(current_setting('test.role',true),''),'authenticated')$$;
   -- Conferme vere ridotte all'essenziale: chiedono un utente e ne scrivono il nome.
   create or replace function public.riconcilia_movimento_su_documenti(p_transazione uuid,p_righe jsonb,p_nota text) returns jsonb language plpgsql security definer as $$
   declare r record; t public.bank_transactions; m uuid; est jsonb:='[]'; begin
    if auth.uid() is null then raise exception 'Riconciliazione non autorizzata'; end if;
    select * into t from public.bank_transactions where id=p_transazione;
    for r in select * from jsonb_to_recordset(p_righe) x(tipo text,id uuid,importo numeric) loop
     if r.tipo='invoice' then
      insert into public.bank_reconciliations(company_id,transaction_id,invoice_id,matched_amount,match_type,matched_by,notes) values(t.company_id,t.id,r.id,r.importo,'manual',auth.uid(),p_nota);
      est:=est||jsonb_build_array(jsonb_build_object('invoice_id',r.id,'importo',r.importo,'provider',(select external_provider from public.invoices where id=r.id)));
      continue;
     end if;
     -- come la vera: l'incasso diventa un movimento di cassa e la quota punta a quello
     insert into public.movimenti_cassa_native(id,company_id,documento_id) values(gen_random_uuid(),t.company_id,r.id) returning id into m;
     insert into public.bank_reconciliations(company_id,transaction_id,movimento_id,matched_amount,match_type,matched_by,notes) values(t.company_id,t.id,m,r.importo,'manual',auth.uid(),p_nota);
     update public.documenti_fiscali set importo_pagato=importo_pagato+r.importo where id=r.id;
    end loop;
    update public.bank_transactions set reconciliation_status='reconciled' where id=t.id;
    return jsonb_build_object('resto',round(abs(t.amount)-(select sum(matched_amount) from public.bank_reconciliations where transaction_id=t.id and unmatched_at is null),2),'esterne',est);
   end $$;
   create or replace function public.chiudi_movimento_senza_fattura(p_transazione uuid,p_tipo text,p_categoria text,p_descrizione text default null,p_categoria_costo text default 'altro',p_riferimento text default null,p_commessa uuid default null,p_mezzo uuid default null,p_fornitore uuid default null) returns jsonb language plpgsql security definer as $$
   begin
    if auth.uid() is null then raise exception 'Operazione non autorizzata'; end if;
    if exists(select 1 from public.bank_transactions where id=p_transazione and chiuso_senza_documento is not null) then raise exception 'Questo movimento bancario è già abbinato.'; end if;
    update public.bank_transactions set chiuso_senza_documento=p_tipo,category=p_categoria,reconciliation_status='reconciled' where id=p_transazione;
    return jsonb_build_object('tipo',p_tipo);
   end $$;`);
  await pg.exec(await readFile("supabase/migrations/20290404313000_tesoreria_conferma_automatica.sql", "utf8"));
  await pg.exec(await readFile("supabase/migrations/20290404314000_tesoreria_prove_dal_movimento_di_cassa.sql", "utf8"));
  await pg.exec(await readFile("supabase/migrations/20290404315000_tesoreria_conferma_in_attesa_interruttore_comune.sql", "utf8"));
  // Interruttore comune del collegamento automatico (sessione Acquisti, 20290404240000), ridotto.
  await pg.exec(`
   alter table companies add column titolare_user_id uuid;
   create table company_governance_settings(company_id uuid primary key,collegamento_automatico boolean not null default false);
   create function public.azienda_collegamento_automatico(p_company uuid) returns boolean language sql stable security definer as $$
    select coalesce((select g.collegamento_automatico from public.company_governance_settings g where g.company_id=p_company),false)$$;`);
  await pg.exec(await readFile("supabase/migrations/20290404316000_tesoreria_conferma_con_interruttore_comune.sql", "utf8"));
  // Traccia comune (sessione Acquisti) ridotta: registra gli argomenti; «test.traccia_rifiuta» simula il permesso mancante.
  await pg.exec(`
   create table test_traccia(company_id uuid,da_tipo text,da_id uuid,a_tipo text,a_id uuid,regola text,esito text,prove jsonb,importo numeric);
   create function public.acquisti_collegamento_registra(p_company uuid,p_da_tipo text,p_da_id uuid,p_da_riga text,p_a_tipo text,p_a_id uuid,p_a_riga text,p_regola text,p_esito text,p_prove jsonb,p_percorso jsonb,p_quantita numeric,p_unita text,p_importo numeric,p_versione_regola integer,p_con_ai boolean,p_motivo text) returns uuid language plpgsql security definer as $$
   begin
    if coalesce(current_setting('test.traccia_rifiuta',true),'')='true' then raise exception 'Non hai il permesso di collegare i documenti d''acquisto.'; end if;
    insert into public.test_traccia values(p_company,p_da_tipo,p_da_id,p_a_tipo,p_a_id,p_regola,p_esito,p_prove,p_importo);
    return gen_random_uuid();
   end $$;`);
  await pg.exec(await readFile("supabase/migrations/20290404317000_tesoreria_traccia_comune_e_stato.sql", "utf8"));
  await pg.exec(`create function public.partner_tax_key(v text) returns text language sql immutable as $$
    select case when x ~ '^IT[0-9]{11}$' then substr(x,3) else x end from (select regexp_replace(upper(coalesce(v,'')),'[^A-Z0-9]','','g') x) s$$;`);
  await pg.exec(await readFile("supabase/migrations/20290404318000_tesoreria_iban_clienti_e_paganti.sql", "utf8"));
  await pg.exec(`create table fatture_ricevute(id uuid primary key,company_id uuid,fornitore_id uuid,tipo_documento text,numero_fattura text,data_fattura date,totale_documento numeric,stato text,cedente_ragione_sociale text);
   create table note_credito_storni(id uuid primary key default gen_random_uuid(),company_id uuid,nota_id uuid,fattura_id uuid);`);
  await pg.exec(await readFile("supabase/migrations/20290404319000_tesoreria_note_ricevute_e_f24_multiple.sql", "utf8"));
  // Fatture importate da un gestionale esterno: nella vista operativa come in produzione.
  await pg.exec(`
   alter table invoices add column paid_amount numeric default 0, add column total numeric, add column status text default 'issued', add column deleted_at timestamptz, add column client_name text, add column external_provider text;
   drop view documenti_fiscali_elenco_operativo;
   alter table documenti_fiscali add column totale_documento numeric;
   create view documenti_fiscali_elenco_operativo as
    select d.*, 'nativa'::text origine, 0::numeric stornato from documenti_fiscali d
    union all
    select i.id,i.company_id,i.order_id,i.invoice_number,jsonb_build_object('ragione_sociale',i.client_name),'fattura','emessa',i.deleted_at,i.total,i.paid_amount,null::date,2026,i.total,'importata',0 from invoices i;
   create or replace function private.bank_record_imported(p_company uuid,p_tx uuid,p_result jsonb) returns jsonb language plpgsql security definer as $$
   declare e jsonb; out jsonb:='[]'; begin
    for e in select value from jsonb_array_elements(coalesce(p_result->'esterne','[]')) loop
     update public.invoices set paid_amount=coalesce(paid_amount,0)+(e->>'importo')::numeric where id=(e->>'invoice_id')::uuid;
     out:=out||jsonb_build_array(e||jsonb_build_object('allinea',true));
    end loop;
    return p_result||jsonb_build_object('esterne',out);
   end $$;`);
  await pg.exec(await readFile("supabase/migrations/20290404320000_tesoreria_conferma_importate.sql", "utf8"));
  await pg.exec(`alter table fatture_ricevute add column purchase_order_id uuid, add column company_cost_id uuid;
   alter table company_costs add column purchase_order_id uuid;
   create table fattura_ricevuta_ordini(company_id uuid,fattura_id uuid,purchase_order_id uuid,importo numeric);
   create table rate_fornitori(id uuid primary key default gen_random_uuid(),company_id uuid,company_cost_id uuid,importo numeric,stato text default 'da_pagare');`);
  await pg.exec(await readFile("supabase/migrations/20290404321000_cdg_controllo_doppi_ordini_e_rate.sql", "utf8"));
  await pg.exec(await readFile("supabase/migrations/20290404322000_cdg_incassi_oltre_totale_affinato.sql", "utf8"));
}, 60000);

beforeEach(async () => {
  await pg.exec(`reset role;select set_config('test.user','${user}',false);select set_config('test.role','service_role',false);
   truncate fattura_ricevuta_ordini,rate_fornitori,invoices,fatture_ricevute,note_credito_storni,tesoreria_iban_verificati,test_traccia,company_governance_settings,movimenti_cassa_native,tesoreria_esiti_storia,tesoreria_esiti,tesoreria_paganti_autorizzati,scadenze_sostituzioni,bank_reconciliations,bank_transactions,bank_accounts,
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

describe("Conferma automatica con l'interruttore comune", () => {
  const delegato = id(9);
  // La conferma di un singolo esito, come la farà il giro quando l'interruttore comune è acceso:
  // per conto della persona indicata, con i suoi permessi.
  const conferma = async (t: string) => {
    await pg.exec(`reset role;select set_config('test.role','service_role',false);begin;
      select set_config('request.jwt.claim.sub','${delegato}',true);select set_config('request.jwt.claim.role','authenticated',true);`);
    try {
      const v = (await pg.query<any>(`select private.tes_conferma_una($1,$2,array['documento','giroconto']) v`, [company, t])).rows[0].v;
      await pg.exec(`commit;`);
      return v;
    } catch (e) {
      await pg.exec(`rollback;`);
      throw e;
    } finally {
      await pg.exec(`select set_config('test.role','authenticated',false);set role authenticated;`);
    }
  };

  const titolare = id(8);
  const interruttore = async (acceso: boolean) => {
    await service(`update companies set titolare_user_id=$2 where id=$1`, [company, titolare]);
    await service(`insert into company_governance_settings values($1,$2) on conflict(company_id) do update set collegamento_automatico=excluded.collegamento_automatico`, [company, acceso]);
  };
  const giroDalCron = async () => (await service(`select public.tesoreria_conferma_automatica($1,50) v`, [company])).rows[0].v;

  it("interruttore comune spento: il giro non conferma, l'esito resta una proposta", async () => {
    await doc({ numero: "FT-2026-0012", totale: 1000, cliente: "Alfa Costruzioni" });
    await tx({ amount: 1000, type: "credit", desc: "Saldo fattura 12/2026", name: "Alfa Costruzioni" });
    await rpc("tesoreria_classifica_movimenti", [company, 100, false]);
    expect(await giroDalCron()).toMatchObject({ attiva: false, confermati: [] });
    await interruttore(false);
    expect(await rpc("tesoreria_conferma_automatica", [company, 50])).toMatchObject({ attiva: false });
    expect((await service(`select count(*)::int n from bank_reconciliations`)).rows[0].n).toBe(0);
  });

  it("acceso, dal cron: conferma a nome del titolare; lanciato da una persona: a nome suo", async () => {
    await doc({ numero: "FT-2026-0012", totale: 1000, cliente: "Alfa Costruzioni" });
    const t1 = await tx({ amount: 1000, type: "credit", desc: "Saldo fattura 12/2026", name: "Alfa Costruzioni" });
    await rpc("tesoreria_classifica_movimenti", [company, 100, false]);
    await interruttore(true);
    const r = await giroDalCron();
    expect(r).toMatchObject({ attiva: true, per_conto_di: titolare, errori: [] });
    expect(r.confermati).toEqual([{ transaction_id: t1, natura: "documento", importo: 1000 }]);
    expect((await service(`select matched_by,match_type from bank_reconciliations where transaction_id=$1`, [t1])).rows).toEqual([{ matched_by: titolare, match_type: "auto" }]);
    await doc({ numero: "FT-2026-0013", totale: 500, cliente: "Beta Impianti" });
    const t2 = await tx({ amount: 500, type: "credit", desc: "Saldo fattura 13/2026", name: "Beta Impianti" });
    await rpc("tesoreria_classifica_movimenti", [company, 100, false]);
    const r2 = await rpc("tesoreria_conferma_automatica", [company, 50]);
    expect(r2.per_conto_di).toBe(user);
    expect((await service(`select matched_by from bank_reconciliations where transaction_id=$1`, [t2])).rows[0].matched_by).toBe(user);
  });

  it("spento: conferma con un clic, a nome di chi clicca, non marcata automatica", async () => {
    await doc({ numero: "FT-2026-0012", totale: 1000, cliente: "Alfa Costruzioni" });
    const t = await tx({ amount: 1000, type: "credit", desc: "Saldo fattura 12/2026", name: "Alfa Costruzioni" });
    const parz = await tx({ amount: 300, type: "credit", desc: "acconto", name: "Alfa Costruzioni" });
    await rpc("tesoreria_classifica_movimenti", [company, 100, false]);
    expect(await rpc("tesoreria_conferma_esito", [company, t])).toMatchObject({ natura: "documento", importo: 1000 });
    expect((await service(`select matched_by,match_type from bank_reconciliations where transaction_id=$1`, [t])).rows).toEqual([{ matched_by: user, match_type: "manual" }]);
    expect((await rpc("tesoreria_esito_movimento", [company, t])).storia.map((x: any) => x.evento)).toContain("confermato_clic");
    await expect(rpc("tesoreria_conferma_esito", [company, parz])).rejects.toThrow(/unico e verificato/);
  });

  it("acceso ma il titolare non può riconciliare: il cron si ferma e lo dice", async () => {
    await doc({ numero: "FT-2026-0012", totale: 1000, cliente: "Alfa Costruzioni" });
    await tx({ amount: 1000, type: "credit", desc: "Saldo fattura 12/2026", name: "Alfa Costruzioni" });
    await rpc("tesoreria_classifica_movimenti", [company, 100, false]);
    await interruttore(true);
    await service(`update test_permissions set write=false where company_id=$1`, [company]);
    expect((await giroDalCron()).fermata).toMatch(/permesso/);
    expect((await service(`select count(*)::int n from bank_reconciliations`)).rows[0].n).toBe(0);
  });

  it("conferma l'unico verificato per conto del delegato, una volta sola; non un parziale", async () => {
    const d = await doc({ numero: "FT-2026-0012", totale: 1000, cliente: "Alfa Costruzioni" });
    const t = await tx({ amount: 1000, type: "credit", desc: "Saldo fattura 12/2026", name: "Alfa Costruzioni" });
    const parz = await tx({ amount: 300, type: "credit", desc: "acconto", name: "Alfa Costruzioni" });
    await rpc("tesoreria_classifica_movimenti", [company, 100, false]);
    expect(await conferma(t)).toEqual({ transaction_id: t, natura: "documento", importo: 1000 });
    expect(await conferma(parz)).toBeNull();
    const q = (await service(`select matched_by,match_type,regola,matched_amount::numeric a from bank_reconciliations where transaction_id=$1`, [t])).rows;
    expect(q).toEqual([{ matched_by: delegato, match_type: "auto", regola: "R-DOC/v1", a: "1000.00" }]);
    expect(Number((await service(`select importo_pagato from documenti_fiscali where id=$1`, [d])).rows[0].importo_pagato)).toBe(1000);
    const storia = await rpc("tesoreria_esito_movimento", [company, t]);
    expect(storia.storia.map((x: any) => x.evento)).toContain("confermato_auto");
    expect(await conferma(t)).toBeNull(); // retry: già riconciliato
    expect((await service(`select count(*)::int n from bank_reconciliations`)).rows[0].n).toBe(1);
  });

  it("un esito scartato non si conferma", async () => {
    await doc({ numero: "FT-2026-0012", totale: 1000, cliente: "Alfa Costruzioni" });
    const t = await tx({ amount: 1000, type: "credit", desc: "Saldo fattura 12/2026", name: "Alfa Costruzioni" });
    await rpc("tesoreria_classifica_movimenti", [company, 100, false]);
    await rpc("tesoreria_scarta_esito", [company, t, "Non è questa fattura"]);
    expect(await conferma(t)).toBeNull();
  });

  it("giroconto: chiude le due gambe senza costi né ricavi", async () => {
    const out = await tx({ amount: 5000, type: "debit", desc: "trasferimento", iban: IBAN_B, account: accA, date: "2026-11-10" });
    const inn = await tx({ amount: 5000, type: "credit", desc: "trasferimento", iban: IBAN_A, account: accB, date: "2026-11-11" });
    await rpc("tesoreria_classifica_movimenti", [company, 100, false]);
    expect(await conferma(out)).toMatchObject({ natura: "giroconto" });
    expect(await conferma(inn)).toBeNull();
    const righe = (await service(`select chiuso_senza_documento c,category from bank_transactions where id in($1,$2)`, [out, inn])).rows;
    expect(righe.every((x: any) => x.c === "nessun_costo" && x.category === "Giroconto")).toBe(true);
    expect((await service(`select count(*)::int n from company_costs`)).rows[0].n).toBe(0);
  });

  it("senza il permesso del delegato la conferma non passa", async () => {
    await doc({ numero: "FT-2026-0012", totale: 1000, cliente: "Alfa Costruzioni" });
    const t = await tx({ amount: 1000, type: "credit", desc: "Saldo fattura 12/2026", name: "Alfa Costruzioni" });
    await rpc("tesoreria_classifica_movimenti", [company, 100, false]);
    await service(`update test_permissions set write=false where company_id=$1`, [company]);
    await expect(conferma(t)).rejects.toThrow(/permesso/);
    expect((await service(`select count(*)::int n from bank_reconciliations`)).rows[0].n).toBe(0);
  });
});

describe("Traccia comune e riga delle Automazioni", () => {
  it("la conferma con un clic finisce nella traccia comune, con prove a ruoli; lo stato lo racconta", async () => {
    const d = await doc({ numero: "FT-2026-0012", totale: 1000, cliente: "Alfa Costruzioni" });
    const t = await tx({ amount: 1000, type: "credit", desc: "Saldo fattura 12/2026", name: "Alfa Costruzioni" });
    await rpc("tesoreria_classifica_movimenti", [company, 100, false]);
    expect(await rpc("tesoreria_stato_automatismo", [company])).toMatchObject({ in_attesa: 1, ultima_conferma_il: null });
    await rpc("tesoreria_conferma_esito", [company, t]);
    const tr = (await service(`select da_tipo,da_id,a_tipo,a_id,regola,esito,importo::numeric i,prove from test_traccia`)).rows;
    expect(tr).toHaveLength(1);
    expect(tr[0]).toMatchObject({ da_tipo: "movimento_banca", da_id: t, a_tipo: "documento_fiscale", a_id: d, regola: "tesoreria:R-DOC", esito: "manuale", i: "1000.00" });
    expect(tr[0].prove.find((p: any) => p.campo === "numero_documento")).toMatchObject({ ruolo: "identifica", esito: "uguale" });
    expect(tr[0].prove.find((p: any) => p.campo === "importo")).toMatchObject({ ruolo: "conferma" });
    expect(await rpc("tesoreria_stato_automatismo", [company])).toMatchObject({ in_attesa: 0, ultima_conferma: "confermato_clic" });
  });

  it("se la traccia rifiuta (permesso acquisti), l'incasso resta registrato e lo si annota", async () => {
    await doc({ numero: "FT-2026-0012", totale: 1000, cliente: "Alfa Costruzioni" });
    const t = await tx({ amount: 1000, type: "credit", desc: "Saldo fattura 12/2026", name: "Alfa Costruzioni" });
    await rpc("tesoreria_classifica_movimenti", [company, 100, false]);
    await pg.exec(`select set_config('test.traccia_rifiuta','true',false)`);
    try {
      await rpc("tesoreria_conferma_esito", [company, t]);
    } finally {
      await pg.exec(`select set_config('test.traccia_rifiuta','',false)`);
    }
    expect((await service(`select count(*)::int n from bank_reconciliations where transaction_id=$1`, [t])).rows[0].n).toBe(1);
    expect((await service(`select count(*)::int n from test_traccia`)).rows[0].n).toBe(0);
    const ev = (await service(`select risultato->'traccia' tr from tesoreria_esiti_storia where transaction_id=$1 and evento='confermato_clic'`, [t])).rows[0].tr;
    expect(ev[0].non_registrato).toMatch(/permesso/);
  });

  it("chi non vede la tesoreria riceve null, non un errore", async () => {
    await service(`delete from test_permissions where company_id=$1`, [company]);
    expect(await rpc("tesoreria_stato_automatismo", [company])).toBeNull();
  });
});

describe("IBAN verificati dei clienti e pagante terzo", () => {
  const IBAN_C = "IT44C0000000000000000000044";
  it("l'IBAN si conferma solo su un incasso già collegato; poi identifica il cliente anche senza nome", async () => {
    const d1 = await doc({ numero: "FT-2026-0401", totale: 700, cliente: "Omega Srl", piva: "IT01234567890" });
    const t1 = await tx({ amount: 700, type: "credit", desc: "bonifico", name: "OMEGA", iban: IBAN_C });
    await expect(rpc("tesoreria_ricorda_iban_cliente", [company, t1, d1])).rejects.toThrow(/Prima collega/);
    await service(`insert into bank_reconciliations(company_id,transaction_id,documento_id,matched_amount,regola) values($1,$2,$3,700,'manuale')`, [company, t1, d1]);
    expect(await rpc("tesoreria_ricorda_iban_cliente", [company, t1, d1])).toMatchObject({ cliente: "Omega Srl", iban: IBAN_C });
    // retry: nessun doppione
    await rpc("tesoreria_ricorda_iban_cliente", [company, t1, d1]);
    expect((await service(`select count(*)::int n from tesoreria_iban_verificati`)).rows[0].n).toBe(1);
    const d2 = await doc({ numero: "FT-2026-0402", totale: 450, cliente: "Omega Srl", piva: "01234567890" });
    const r = await classifica(await tx({ amount: 450, type: "credit", desc: "pagamento", iban: IBAN_C }));
    expect(r.esito).toBe("automatico");
    expect(r.candidati[0].righe[0].id).toBe(d2);
    expect(r.motivi).toContain("IBAN verificato della controparte");
  });

  it("IBAN verificato per un altro cliente: conflitto, anche con numero e nome giusti", async () => {
    const d1 = await doc({ numero: "FT-2026-0401", totale: 700, cliente: "Omega Srl", piva: "01234567890" });
    const t1 = await tx({ amount: 700, type: "credit", desc: "bonifico", name: "Omega", iban: IBAN_C });
    await service(`insert into bank_reconciliations(company_id,transaction_id,documento_id,matched_amount,regola) values($1,$2,$3,700,'manuale')`, [company, t1, d1]);
    await rpc("tesoreria_ricorda_iban_cliente", [company, t1, d1]);
    await service(`update documenti_fiscali set importo_pagato=700 where id=$1`, [d1]); // come la conferma vera
    await doc({ numero: "FT-2026-0500", totale: 300, cliente: "Psi Impianti", piva: "09876543210" });
    const r = await classifica(await tx({ amount: 300, type: "credit", desc: "fattura 500/2026", name: "Psi Impianti", iban: IBAN_C }));
    expect(r.esito).toBe("conflitto");
    expect(r.conflitti[0].motivi).toContain("IBAN verificato di un altro cliente");
    const elenco = await rpc("tesoreria_riferimenti_verificati", [company]);
    await rpc("tesoreria_revoca_iban_cliente", [company, elenco.iban_clienti[0].id]);
    expect((await classifica((await service(`select id from bank_transactions where amount=300`)).rows[0].id)).esito).toBe("automatico");
  });

  it("il rapporto col pagante terzo si registra con la prova e si revoca", async () => {
    await doc({ numero: "FT-2026-0077", totale: 500, cliente: "Mario Bianchi" });
    const t = await tx({ amount: 500, type: "credit", desc: "pagamento fattura 77/2026", name: "Immobiliare Verdi" });
    await expect(rpc("tesoreria_registra_pagante", [company, "Mario Bianchi", "Immobiliare Verdi", null, "", null])).rejects.toThrow(/prova/);
    const id1 = await rpc("tesoreria_registra_pagante", [company, "Mario Bianchi", "Immobiliare Verdi", null, "Delega firmata il 01/11", null]);
    expect((await classifica(t)).esito).toBe("automatico");
    await rpc("tesoreria_revoca_pagante", [company, id1]);
    expect((await classifica(t)).esito).toBe("conflitto");
  });
});

describe("Note di credito ricevute e F24 su più scadenze", () => {
  it("fattura del fornitore 1.000 − nota ricevuta 200 = bonifico 800: compensazione; collegata la nota, niente doppio sconto", async () => {
    const f = await supplier("Tau Laterizi");
    const sc = await scad({ amount: 1000, supplier: f, desc: "Fattura 10 Tau" });
    const nc = nid();
    await service(`insert into fatture_ricevute values($1,$2,$3,'TD04','NC-3','2026-11-05',200,'registrata','Tau Laterizi')`, [nc, company, f]);
    const t = await tx({ amount: 800, type: "debit", desc: "saldo al netto della nota", name: "Tau Laterizi" });
    const r = await classifica(t);
    expect(r).toMatchObject({ esito: "proposta", natura: "compensazione_nc", regola: "R-NC" });
    const righe = r.candidati[0].righe;
    expect(righe.find((x: any) => x.id === sc).quota).toBe(1000);
    expect(righe.find((x: any) => x.id === nc)).toMatchObject({ tipo: "nota_ricevuta", quota: -200 });
    // la nota collegata riduce la rata (nota_credito_collega): poi il bonifico è il residuo esatto, la nota non conta più
    await service(`insert into note_credito_storni(company_id,nota_id) values($1,$2)`, [company, nc]);
    await service(`update scadenze set amount=800 where id=$1`, [sc]);
    const r2 = await classifica(t);
    expect(r2.natura).toBe("documento");
    expect(r2.candidati[0].righe).toHaveLength(1);
    expect(r2.candidati[0].righe[0]).toMatchObject({ id: sc, quota: 800 });
  });

  it("F24 di 1.500 = IVA 1.000 + ritenute 500: proposta con due componenti, nessuna commessa", async () => {
    const a = await scad({ amount: 1000, desc: "F24 IVA ottobre", tipo: "scadenza_fiscale", order: id(998) });
    const b = await scad({ amount: 500, desc: "F24 ritenute ottobre", tipo: "scadenza_fiscale" });
    await scad({ amount: 700, desc: "F24 INPS ottobre", tipo: "scadenza_fiscale" });
    const r = await classifica(await tx({ amount: 1500, type: "debit", desc: "DELEGA F24" }));
    expect(r).toMatchObject({ esito: "proposta", natura: "f24", commesse: [] });
    expect(r.candidati[0].righe.map((x: any) => x.id).sort()).toEqual([a, b].sort());
  });
});

describe("Fatture importate: conferma e gestionale esterno", () => {
  it("l'incasso certo di una fattura importata si conferma e porta le «esterne» da allineare", async () => {
    const inv = nid();
    await service(`insert into invoices(id,company_id,invoice_number,total,client_name,external_provider) values($1,$2,'FT-2026-0901',1200,'Kappa Costruzioni','fattureincloud')`, [inv, company]);
    const t = await tx({ amount: 1200, type: "credit", desc: "saldo fattura 901/2026", name: "Kappa Costruzioni" });
    await rpc("tesoreria_classifica_movimenti", [company, 100, false]);
    const r = await rpc("tesoreria_conferma_esito", [company, t]);
    expect(r).toMatchObject({ natura: "documento", importo: 1200 });
    expect(r.esterne).toEqual([expect.objectContaining({ invoice_id: inv, provider: "fattureincloud", allinea: true })]);
    expect(Number((await service(`select paid_amount from invoices where id=$1`, [inv])).rows[0].paid_amount)).toBe(1200);
    expect((await service(`select a_tipo from test_traccia`)).rows).toEqual([{ a_tipo: "fattura_emessa" }]);
    // retry: già riconciliato, nessuna seconda quota
    await expect(rpc("tesoreria_conferma_esito", [company, t])).rejects.toThrow(/unico e verificato/);
    expect((await service(`select count(*)::int n from bank_reconciliations where transaction_id=$1`, [t])).rows[0].n).toBe(1);
  });
});

describe("Controllo di gestione: ordine, commessa e calendari", () => {
  it("fattura su un ordine col costo diretto sulla commessa; scadenza e rata sullo stesso costo", async () => {
    const cc = nid(), fr = nid(), cc2 = nid();
    await service(`insert into company_costs(id,company_id,name,amount,order_id) values($1,$2,'Materiale',500,$3)`, [cc, company, id(55)]);
    await service(`insert into fatture_ricevute(id,company_id,tipo_documento,numero_fattura,totale_documento,stato,company_cost_id) values($1,$2,'TD01','F-77',610,'contabilizzata',$3)`, [fr, company, cc]);
    await service(`insert into fattura_ricevuta_ordini values($1,$2,$3,500)`, [company, fr, id(56)]);
    await service(`insert into company_costs(id,company_id,name,amount) values($1,$2,'Noleggio',300)`, [cc2, company]);
    await service(`insert into scadenze(id,company_id,cost_id,description,direction,amount) values($1,$2,$3,'Noleggio','uscita',300)`, [nid(), company, cc2]);
    await service(`insert into rate_fornitori(company_id,company_cost_id,importo) values($1,$2,300)`, [company, cc2]);
    const doppi = await rpc<any[]>("cdg_controllo_doppi", [company]);
    expect(doppi.find((x) => x.controllo === "fattura_su_ordine_e_su_commessa")).toMatchObject({ ids: [fr, cc] });
    expect(doppi.find((x) => x.controllo === "scadenza_e_rata_sullo_stesso_costo")).toMatchObject({ ids: [cc2], importo: 300 });
    // collegato il costo all'ordine, il primo controllo tace
    await service(`update company_costs set purchase_order_id=$2 where id=$1`, [cc, id(56)]);
    expect((await rpc<any[]>("cdg_controllo_doppi", [company])).map((x) => x.controllo)).not.toContain("fattura_su_ordine_e_su_commessa");
  });
});

describe("Incassi oltre il totale", () => {
  it("sotto 1 € è arrotondamento; incassato il lordo lo dice", async () => {
    const a = await doc({ numero: "FT-2026-0601", totale: 1000, cliente: "A", pagato: 1000.5 });
    const b = await doc({ numero: "FT-2026-0602", totale: 1000, cliente: "B", pagato: 1220 });
    await service(`update documenti_fiscali set totale_documento=1220 where id=$1`, [b]);
    const c = await doc({ numero: "FT-2026-0603", totale: 1000, cliente: "C", pagato: 1500 });
    await service(`update documenti_fiscali set totale_documento=1000 where id=$1`, [c]);
    const oltre = (await rpc<any[]>("cdg_controllo_doppi", [company])).filter((x) => x.controllo === "documento_oltre_totale");
    expect(oltre.map((x) => x.ids[0]).sort()).toEqual([b, c].sort());
    expect(oltre.find((x) => x.ids[0] === b).cosa_fare).toMatch(/lordo/);
    expect(oltre.find((x) => x.ids[0] === c).cosa_fare).toMatch(/doppi/);
    expect(oltre.map((x) => x.ids[0])).not.toContain(a);
  });
});
