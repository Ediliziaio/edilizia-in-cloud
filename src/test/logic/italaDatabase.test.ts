import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const db = new PGlite();
const company = '11111111-1111-4111-8111-111111111111';
const another = '22222222-2222-4222-8222-222222222222';
const document = { invoice_number:'1', issue_date:'2026-10-01',document_type:'invoice',status:'delivered',client_company_name:'Cliente',client_vat_number:'12345678901',subtotal:100,tax_amount:22,total:124,external_document_type:'TD01',external_tax_summary:[{aliquota:'22',imponibile:100,imposta:22,esigibilita:'I'}] };
const lines = [{ description:'Riga',quantity:1,unit_price:100,tax_rate:22,line_net:100,line_tax:22,line_gross:122,sort_order:0 }];
const save = async (id:string, doc:object = document, rows:object[] = lines, companyId = company) => (await db.query<{result:{id:string;updated?:boolean;duplicate?:boolean}}>('select public.billing_import_itala_issued($1,$2,$3,$4) as result',[companyId,id,JSON.stringify(doc),JSON.stringify(rows)])).rows[0].result;
beforeAll(async () => {
  await db.exec(readFileSync('src/test/fixtures/itala/schema.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20261027103542_itala_collegamento_iva.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20261027110730_itala_duplicati_documenti_nativi.sql','utf8'));
},30_000);
afterAll(() => db.close());
describe('Import ITALA atomico sul database',()=>{
  it('conserva il totale del documento, incassi e righe a ogni nuovo tentativo',async()=>{
    const first = await save('123');
    expect(first.updated).toBe(false);
    await db.query("update invoices set paid_amount=124,status='paid' where id=$1",[first.id]);
    expect(await save('123')).toMatchObject({id:first.id,updated:true});
    expect((await db.query('select subtotal,tax_amount,total,paid_amount,status from invoices where id=$1',[first.id])).rows[0]).toEqual({subtotal:'100',tax_amount:'22',total:'124',paid_amount:'124',status:'paid'});
    expect((await db.query('select count(*)::int as n from invoice_lines where invoice_id=$1',[first.id])).rows[0]).toEqual({n:1});
  });
  it('un errore sulle righe non cancella quelle già salvate',async()=>{
    await expect(save('123',document,[{...lines[0],quantity:null}])).rejects.toThrow();
    expect((await db.query('select count(*)::int as n from invoice_lines')).rows[0]).toEqual({n:1});
    expect((await db.query('select total from invoices')).rows[0]).toEqual({total:'124'});
  });
  it('riconosce una copia da un altro provider e blocca dati discordanti',async()=>{
    await db.query("insert into invoices(company_id,external_provider,external_id,invoice_number,issue_date,document_type,status,client_company_name,client_vat_number,subtotal,tax_amount,total) values($1,'fattureincloud','abc','2','2026-10-01','invoice','issued','Cliente','12345678901',100,22,124)",[company]);
    expect((await save('124',{...document,invoice_number:'2'})).duplicate).toBe(true);
    await expect(save('124',{...document,invoice_number:'2',total:125})).rejects.toThrow('differenti');
  });
  it('fattura e nota di credito con lo stesso numero restano documenti distinti',async()=>{
    const r = await save('125',{...document,document_type:'credit_note',external_document_type:'TD04'});
    expect(r.updated).toBe(false);
  });
  it('non confonde due aziende e separa i corpi di uno stesso file',async()=>{
    expect((await save('123',document,lines,another)).updated).toBe(false);
    expect((await save('126_1',{...document,invoice_number:'L1'})).updated).toBe(false);
    expect((await save('126_2',{...document,invoice_number:'L2'})).updated).toBe(false);
    await db.query("insert into fatture_ricevute(company_id,sdi_id_trasmissione,xml_sha256,indice_corpo) values($1,'SDI-1','hash',0),($1,'SDI-1','hash',1)",[company]);
    await expect(db.query("insert into fatture_ricevute(company_id,sdi_id_trasmissione,xml_sha256,indice_corpo) values($1,'SDI-1','hash',1)",[company])).rejects.toThrow('unique');
  });
  it('rispetta un periodo fiscale chiuso',async()=>{
    await db.query("insert into fiscalita_periodi values($1,'2026-10-01','chiuso')",[company]);
    await expect(save('127',{...document,invoice_number:'CLOSED'})).rejects.toThrow('Periodo fiscale chiuso');
    await expect(save('123',{...document,total:125})).rejects.toThrow('Periodo fiscale chiuso');
    expect((await save('123')).updated).toBe(true); // pure status/metadata refresh
    await db.query('delete from fiscalita_periodi');
  });
  it('il registro vede aliquote/nature originali ed esclude bozze e copie native identiche',async()=>{
    await save('128',{...document,invoice_number:'MIX',subtotal:200,tax_amount:22,total:222,external_tax_summary:[...document.external_tax_summary,{aliquota:'0',natura:'N4',imponibile:100,imposta:0,esigibilita:'I'}]});
    const mixed=(await db.query<{riepilogo_iva:unknown[]}>('select riepilogo_iva from fatture_vendite_iva where numero=$1',['MIX'])).rows[0];
    expect(mixed.riepilogo_iva[1]).toMatchObject({natura:'N4',imposta:0});
    await save('129',{...document,invoice_number:'DRAFT',status:'draft',external_status:'ERRO'});
    expect((await db.query("select count(*)::int as n from fatture_vendite_iva where numero='DRAFT'")).rows[0]).toEqual({n:0});
    await db.query("insert into documenti_fiscali(company_id,tipo,numero,data_emissione,anno,numero_progressivo,stato,cliente_snapshot,imponibile_totale,iva_totale,totale_documento) values($1,'fattura','1','2026-10-01',2026,1,'emessa',$2,100,22,124)",[company,JSON.stringify({partita_iva:'12345678901'})]);
    expect((await db.query("select origine from fatture_vendite_iva where company_id=$1 and numero='1' and tipo='fattura'",[company])).rows).toEqual([{origine:'nativa'}]);
  });
  it('la liquidazione include vendite importate, IVA separata e il controllo azienda',async()=>{
    const fiscalCompany='33333333-3333-4333-8333-333333333333';
    await save('555',{...document,subtotal:250,tax_amount:27,total:277,external_tax_summary:[{aliquota:'22',imponibile:100,imposta:22,esigibilita:'I'},{aliquota:'10',imponibile:50,imposta:5,esigibilita:'S'},{aliquota:'0',natura:'N4',imponibile:100,imposta:0,esigibilita:'I'}]},lines,fiscalCompany);
    await expect(db.query("select liquidazione_iva_periodo($1,'mensile',2026,10)",[fiscalCompany])).rejects.toThrow('Accesso negato');
    await db.query("select set_config('test.company',$1,false)",[fiscalCompany]);
    const r=(await db.query<{result:Record<string,unknown>}>("select liquidazione_iva_periodo($1,'mensile',2026,10) as result",[fiscalCompany])).rows[0].result;
    expect(r).toMatchObject({iva_vendite:22,iva_acquisti:0,saldo:22,escluso:{split_payment:5},documenti:{vendite:1},calcolabile:true});
  });
  it('una proforma con stessi importi non nasconde la fattura elettronica',async()=>{
    await db.query("insert into documenti_fiscali(company_id,tipo,numero,data_emissione,anno,numero_progressivo,stato,cliente_snapshot,imponibile_totale,iva_totale,totale_documento) values($1,'proforma','PF','2026-10-01',2026,2,'emessa',$2,100,22,124)",[company,JSON.stringify({partita_iva:'12345678901'})]);
    expect((await save('777',{...document,invoice_number:'PF'})).duplicate).not.toBe(true);
    expect((await db.query("select count(*)::int as n from fatture_vendite_iva where numero='PF' and origine='importata'")).rows[0]).toEqual({n:1});
  });
  it('un documento fiscale nativo discordante viene segnalato senza creare una seconda fattura',async()=>{
    await expect(save('778',{...document,total:125})).rejects.toThrow('Documento nativo');
    expect((await db.query("select count(*)::int as n from invoices where external_id='778'")).rows[0]).toEqual({n:0});
  });
  it('riconosce la partita IVA anche col prefisso IT e senza duplicare per un CF aggiuntivo',async()=>{
    await db.query("insert into documenti_fiscali(company_id,tipo,numero,data_emissione,anno,numero_progressivo,stato,cliente_snapshot,imponibile_totale,iva_totale,totale_documento) values($1,'fattura','VAT','2026-10-01',2026,3,'emessa',$2,100,22,124)",[company,JSON.stringify({partita_iva:'IT12345678901'})]);
    expect((await save('779',{...document,invoice_number:'VAT',client_fiscal_code:'CF-AGGIUNTIVO'})).duplicate).toBe(true);
  });
  it('l’import non è invocabile dal browser ed il registro rispetta RLS',async()=>{
    const privileges = (await db.query("select has_function_privilege('authenticated','public.billing_import_itala_issued(uuid,text,jsonb,jsonb)','execute') as browser, has_function_privilege('service_role','public.billing_import_itala_issued(uuid,text,jsonb,jsonb)','execute') as server")).rows[0];
    expect(privileges).toEqual({browser:false,server:true});
    await db.exec(`alter table invoices enable row level security; alter table documenti_fiscali enable row level security; grant select on invoices,documenti_fiscali to authenticated; set role authenticated;`);
    expect((await db.query('select count(*)::int as n from fatture_vendite_iva')).rows[0]).toEqual({n:0});
    await db.exec('reset role');
  });
});
