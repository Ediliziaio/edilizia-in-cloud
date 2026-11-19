import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

const pg = new PGlite();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const company = id(1), other = id(2), user = id(3), costo = id(10), altroCosto = id(11), debito = id(12), estero = id(13), fattura = id(20);
const righe = (conto = costo, importo = 100) => [{ conto_id: conto, dare: importo, avere: 0 }, { conto_id: debito, dare: 0, avere: importo }];
const dati: { data_registrazione: string; causale: string; descrizione: string; documento_numero: string | null; documento_data: string | null } = { data_registrazione: "2026-10-15", causale: "Stipendi", descrizione: "Retribuzioni ottobre", documento_numero: null, documento_data: null };
async function rpc<T = unknown>(nome: string, args: unknown[]): Promise<T> {
  return (await pg.query<{ v: T }>(`select to_jsonb(public.${nome}(${args.map((_, i) => `$${i + 1}`).join(",")})) v`, args)).rows[0].v;
}
async function nuova(origine = "manuale", doc: string | null = null) {
  return rpc<string>("contabilita_inserisci_scrittura", [company,"2026-10-15","Stipendi","Retribuzioni ottobre",null,null,JSON.stringify(righe()),origine,doc,null]);
}
beforeAll(async () => {
  await pg.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
    create function public.utente_bloccato() returns boolean language sql stable as $$select false$$;
    create function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('test.role',true),''),'authenticated')$$;
    create table companies(id uuid primary key);
    create function public.azienda_ancora_esiste(uuid) returns boolean language sql stable as $$select true$$;
    create function public.user_can_access_company(uuid) returns boolean language sql stable as $$select $1=nullif(current_setting('test.company',true),'')::uuid$$;
    create function public.e_amministratore_di(uuid) returns boolean language sql stable as $$select public.user_can_access_company($1) and coalesce(current_setting('test.readonly',true),'false')<>'true'$$;
    create function public.has_role(uuid,text) returns boolean language sql stable as $$select false$$;
    create function public.user_can_write_accountant_company(uuid) returns boolean language sql stable as $$select false$$;
    create function public.utente_sola_lettura(uuid) returns boolean language sql stable as $$select coalesce(current_setting('test.readonly',true),'false')='true'$$;
    create function public.aziende_con_permesso(text) returns uuid[] language sql stable as $$select array[nullif(current_setting('test.company',true),'')::uuid]$$;`);
  await pg.exec(await readFile("supabase/migrations/20290210100000_contabilita_partita_doppia.sql", "utf8"));
  await pg.exec(`create table contabilita_esercizi(company_id uuid,anno integer,chiuso_il timestamptz,stampato_fino_al date,primary key(company_id,anno));
    create table fatture_ricevute(id uuid primary key,company_id uuid,conti_righe jsonb not null default '{}',righe jsonb,stato text default 'letta',righe_generate jsonb);
    create table documenti_fiscali(id uuid primary key,company_id uuid,sdi_stato text);
    create table test_vendite(id uuid primary key,company_id uuid,deleted_at timestamptz,stato text,tipo text);
    create view fatture_vendite_iva as select * from test_vendite;
    alter table fatture_ricevute enable row level security;
    create policy tenant on fatture_ricevute for all to authenticated using(user_can_access_company(company_id)) with check(user_can_access_company(company_id) and not utente_sola_lettura(company_id));
    grant usage on schema public,auth to authenticated;grant select,update on fatture_ricevute to authenticated;
    create function public.contabilita_righe_uguali(p_scrittura uuid,p_righe jsonb) returns boolean language sql stable as $$
      select coalesce((select jsonb_agg(jsonb_build_object('conto_id',conto_id,'dare',dare,'avere',avere,'descrizione',descrizione) order by riga) from contabilita_righe where scrittura_id=p_scrittura),'[]')=p_righe$$;
    create function public.contabilita_data_utile(uuid,date) returns date language sql as $$select $2$$;
    create function public.contabilita_genera_da_documenti(p_company uuid,p_anno int,p_solo uuid default null) returns jsonb language plpgsql as $$
      declare f fatture_ricevute; begin
       select * into f from fatture_ricevute where id=p_solo and company_id=p_company;
       if f.righe_generate is null then return jsonb_build_object('fatture_ricevute',0,'errori',jsonb_build_array('mancano i dati')); end if;
       perform public.contabilita_inserisci_scrittura(p_company,'2026-10-15','Fattura ricevuta','Fornitore',null,null,f.righe_generate,'fattura_ricevuta',f.id,null);
       return jsonb_build_object('fatture_ricevute',1,'errori','[]'::jsonb);
      end$$;`);
  await pg.exec(await readFile("supabase/migrations/20290421180000_contabilita_revisioni_provvisorie.sql", "utf8"));
  await pg.exec(await readFile("supabase/migrations/20290421181000_iva_sezionali_protocolli.sql", "utf8"));
}, 30000);
beforeEach(async () => {
  await pg.exec(`reset role; truncate contabilita_righe,contabilita_scritture,contabilita_revisioni,contabilita_conti,contabilita_esercizi,iva_protocolli,iva_sezionali,fatture_ricevute,test_vendite,documenti_fiscali,companies restart identity cascade;
    select set_config('test.user','${user}',false),set_config('test.company','${company}',false),set_config('test.readonly','false',false),set_config('test.role','authenticated',false);
    insert into companies values('${company}'),('${other}');
    insert into contabilita_conti(id,company_id,codice,descrizione,natura) values
      ('${costo}','${company}','30.01','Salari','costo'),('${altroCosto}','${company}','30.02','Contributi','costo'),('${debito}','${company}','13.01','Debiti dipendenti','passivo'),('${estero}','${other}','30.01','Altro tenant','costo');
    insert into contabilita_esercizi(company_id,anno) values('${company}',2026);`);
  await pg.query<Record<string, unknown>>(`insert into fatture_ricevute(id,company_id,righe_generate) values($1,$2,$3)`,[fattura,company,JSON.stringify(righe(altroCosto))]);
});
afterAll(() => pg.close());

describe("Correzione delle scritture provvisorie", () => {
  it("registra il personale senza fattura: lordo, contributi, TFR e debiti distinti restano in quadratura",async()=>{
    await pg.exec(`insert into contabilita_conti(id,company_id,codice,descrizione,natura) values
      ('${id(14)}','${company}','30.12','Quota TFR','costo'),('${id(15)}','${company}','13.20','INPS','passivo'),
      ('${id(16)}','${company}','13.12','Ritenute IRPEF','passivo'),('${id(17)}','${company}','13.40','Fondo TFR','passivo');`);
    const movimenti=[{conto_id:costo,dare:10000},{conto_id:altroCosto,dare:3000},{conto_id:id(14),dare:850},
      {conto_id:debito,avere:7600},{conto_id:id(15),avere:3400},{conto_id:id(16),avere:2000},{conto_id:id(17),avere:850}];
    const scrittura=await rpc<string>("contabilita_registra_scrittura",[company,"2026-10-31","Stipendi","Cedolino sintetico di prova",null,null,JSON.stringify(movimenti)]);
    const tot=(await pg.query<{dare:string;avere:string;n:number}>("select sum(dare) dare,sum(avere) avere,count(*)::int n from contabilita_righe where scrittura_id=$1",[scrittura])).rows[0];
    expect(Number(tot.dare)).toBe(13850);expect(Number(tot.avere)).toBe(13850);expect(tot.n).toBe(7);
  });
  it("un pagamento con commissione e sconto separa il debito estinto dall'uscita bancaria",async()=>{
    await pg.exec(`insert into contabilita_conti(id,company_id,codice,descrizione,natura) values
      ('${id(14)}','${company}','06.01','Banca Alfa','attivo'),('${id(15)}','${company}','40.02','Commissioni bancarie','costo'),
      ('${id(16)}','${company}','20.04','Sconti attivi','ricavo');`);
    const movimenti=[{conto_id:debito,dare:1000},{conto_id:id(15),dare:2},{conto_id:id(14),avere:990},{conto_id:id(16),avere:12}];
    const scrittura=await rpc<string>("contabilita_registra_scrittura",[company,"2026-10-31","Pagamento fornitore","Debito 1000, sconto 12 e spese 2",null,null,JSON.stringify(movimenti)]);
    const tot=(await pg.query<{dare:string;avere:string}>("select sum(dare) dare,sum(avere) avere from contabilita_righe where scrittura_id=$1",[scrittura])).rows[0];
    expect(Number(tot.dare)).toBe(1002);expect(Number(tot.avere)).toBe(1002);
    expect(Number((await pg.query<{banca:string}>("select avere banca from contabilita_righe where scrittura_id=$1 and conto_id=$2",[scrittura,id(14)])).rows[0].banca)).toBe(990);
  });
  it("l'aggiornamento automatico conserva identità e numero e lascia le definitive allo storno",async()=>{
    const s=await nuova("fattura_ricevuta",fattura);
    expect(await rpc("contabilita_rivedi_provvisoria",[s,JSON.stringify(righe(altroCosto)),"Documento aggiornato"])).toBe(true);
    expect((await pg.query<Record<string,unknown>>("select id,numero,revisione from contabilita_scritture")).rows).toEqual([{id:s,numero:1,revisione:2}]);
    await pg.exec("update contabilita_esercizi set stampato_fino_al='2026-10-31'");
    expect(await rpc("contabilita_rivedi_provvisoria",[s,JSON.stringify(righe()),"Documento aggiornato"])).toBe(false);
  });
  it("innesta le revisioni nel generatore reale per fatture, prima nota e cedolini",async()=>{
    const originale=(await pg.query<{sql:string}>("select pg_get_functiondef('contabilita_genera_da_documenti(uuid,integer,uuid)'::regprocedure) sql")).rows[0].sql;
    try {
      const migrazione=await readFile("supabase/migrations/20290312240000_contabilita_lotto_d_completezza.sql","utf8");
      const inizio=migrazione.indexOf("CREATE OR REPLACE FUNCTION public.contabilita_genera_da_documenti");
      const fine=migrazione.indexOf("END $$;",inizio)+"END $$;".length;
      await pg.exec(migrazione.slice(inizio,fine));
      const patch=await readFile("supabase/migrations/20290421184000_contabilita_generazione_revisioni.sql","utf8");
      await pg.exec(patch);await pg.exec(patch);
      const nuova=(await pg.query<{sql:string}>("select pg_get_functiondef('contabilita_genera_da_documenti(uuid,integer,uuid)'::regprocedure) sql")).rows[0].sql;
      expect(nuova.match(/public.contabilita_rivedi_provvisoria\(/g)).toHaveLength(4);
      expect(nuova).toContain("Documento annullato, rifiutato o cancellato");
      expect(nuova).toContain("pn.auto_source IS DISTINCT FROM 'bank_alignment'");
      expect(nuova).toContain("public.contabilita_liquidita_incasso(p_company,e.id");
    } finally {await pg.exec(originale);}
  });
  it("conserva numero e identità, aggiorna i conti e registra la versione precedente", async () => {
    const s = await nuova();
    await rpc("contabilita_modifica_scrittura",[s,1,dati.data_registrazione,dati.causale,dati.descrizione,null,null,JSON.stringify(righe(altroCosto,180))]);
    expect((await pg.query<{ n:number; revisione:number }>("select numero n,revisione from contabilita_scritture where id=$1",[s])).rows).toEqual([{n:1,revisione:2}]);
    expect((await pg.query<Record<string, unknown>>("select operazione,prima->>'numero' numero from contabilita_revisioni")).rows).toEqual([{operazione:"modifica",numero:"1"}]);
    expect(Number((await pg.query<{ d:string }>("select sum(dare) d from contabilita_righe where scrittura_id=$1",[s])).rows[0].d)).toBe(180);
  });
  it("rigenera una fattura senza produrre uno storno o un nuovo numero", async () => {
    const s = await nuova("fattura_ricevuta",fattura);
    const esito = await rpc<{aggiornate:number;stornate:number}>("contabilita_riregistra_documento",[company,fattura,"Cambio conto"]);
    expect(esito.aggiornate).toBe(1);expect(esito.stornate).toBe(0);
    expect((await pg.query<Record<string, unknown>>("select id,numero,revisione from contabilita_scritture")).rows).toEqual([{id:s,numero:1,revisione:2}]);
    expect((await pg.query<Record<string, unknown>>("select conto_id from contabilita_righe where dare>0")).rows[0].conto_id).toBe(altroCosto);
  });
  it("ripetere lo stesso salvataggio non produce revisioni o storni", async () => {
    await nuova("fattura_ricevuta",fattura);
    await rpc("contabilita_riregistra_documento",[company,fattura,"Cambio conto"]);
    await rpc("contabilita_riregistra_documento",[company,fattura,"Cambio conto"]);
    expect((await pg.query<Record<string, unknown>>("select count(*)::int n from contabilita_scritture")).rows[0].n).toBe(1);
    expect((await pg.query<Record<string, unknown>>("select count(*)::int n from contabilita_revisioni")).rows[0].n).toBe(1);
  });
  it("un errore nel documento ripristina automaticamente la scrittura precedente", async () => {
    const s = await nuova("fattura_ricevuta",fattura);
    await pg.exec("update fatture_ricevute set righe_generate=null");
    await expect(rpc("contabilita_riregistra_documento",[company,fattura,"Cambio conto"])).rejects.toThrow(/mancano i dati/);
    expect((await pg.query<Record<string, unknown>>("select id,origine,revisione from contabilita_scritture")).rows).toEqual([{id:s,origine:"fattura_ricevuta",revisione:1}]);
  });
  it("rifiuta righe non quadrate, conto di un altro tenant e revisioni superate", async () => {
    const s=await nuova();
    await expect(rpc("contabilita_sostituisci_provvisoria",[s,1,JSON.stringify(dati),JSON.stringify([righe()[0],{...righe()[1],avere:80}]),"Correzione"])).rejects.toThrow(/non quadra/);
    await expect(rpc("contabilita_sostituisci_provvisoria",[s,1,JSON.stringify(dati),JSON.stringify(righe(estero)),"Correzione"])).rejects.toThrow(/Conto non valido/);
    await expect(rpc("contabilita_elimina_scrittura",[s,9,"Errore"])).rejects.toThrow(/è cambiata/);
    expect((await pg.query<Record<string, unknown>>("select count(*)::int n from contabilita_righe")).rows[0].n).toBe(2);
  });
  it("elimina solo la manuale provvisoria e conserva lo storico della cancellazione", async () => {
    const s=await nuova();await rpc("contabilita_elimina_scrittura",[s,1,"Inserimento errato"]);
    expect((await pg.query<Record<string, unknown>>("select count(*)::int n from contabilita_scritture")).rows[0].n).toBe(0);
    expect((await pg.query<Record<string, unknown>>("select operazione from contabilita_revisioni")).rows[0].operazione).toBe("eliminazione");
    const f=await nuova("fattura_ricevuta",fattura);
    await expect(rpc("contabilita_elimina_scrittura",[f,1,"Errore"])).rejects.toThrow(/documento/);
  });
  it("protegge periodi definitivi, storico degli storni e utenti in sola lettura", async () => {
    const s=await nuova();
    await pg.exec("update contabilita_esercizi set stampato_fino_al='2026-10-31'");
    await expect(rpc("contabilita_elimina_scrittura",[s,1,"Errore"])).rejects.toThrow(/definitivo/);
    await pg.exec("update contabilita_esercizi set stampato_fino_al=null; select set_config('test.readonly','true',false)");
    await expect(rpc("contabilita_elimina_scrittura",[s,1,"Errore"])).rejects.toThrow(/Accesso negato/);
  });
  it("non permette al client di usare il bypass dei trigger né le funzioni interne", async () => {
    const s=await nuova();await pg.exec("set role authenticated");
    await expect(pg.query<Record<string, unknown>>("select set_config('app.contabilita_provvisoria',$1,false)",[s]).then(()=>pg.query<Record<string, unknown>>("delete from contabilita_scritture where id=$1",[s]))).rejects.toThrow(/permission denied/);
    await expect(rpc("contabilita_verifica_provvisoria",[s,1])).rejects.toThrow(/permission denied/);
  });
});

describe("Sezionali e protocolli IVA", () => {
  it("continua una numerazione storica e mantiene numerazioni separate per sezionale e anno",async()=>{
    const a=await rpc<string>("iva_crea_sezionale",[company,"acquisti","A1","Acquisti"]);
    const b=await rpc<string>("iva_crea_sezionale",[company,"acquisti","EST","Acquisti esteri"]);
    const p=await rpc<{numero:number}>("iva_assegna_protocollo",[a,fattura,"2026-10-15",644]);expect(p.numero).toBe(644);
    await pg.query<Record<string, unknown>>("insert into fatture_ricevute(id,company_id) values($1,$2),($3,$2),($4,$2)",[id(21),company,id(22),id(23)]);
    expect((await rpc<{numero:number}>("iva_assegna_protocollo",[a,id(21),"2026-10-16",null])).numero).toBe(645);
    expect((await rpc<{numero:number}>("iva_assegna_protocollo",[b,id(22),"2026-10-16",null])).numero).toBe(1);
    expect((await rpc<{numero:number}>("iva_assegna_protocollo",[a,id(23),"2027-01-02",null])).numero).toBe(1);
  });
  it("è idempotente, evita doppioni e conserva i numeri annullati",async()=>{
    const s=await rpc<string>("iva_crea_sezionale",[company,"acquisti","A1","Acquisti"]);
    const p=await rpc<{id:string;numero:number}>("iva_assegna_protocollo",[s,fattura,"2026-10-15",null]);
    expect((await rpc<{id:string}>("iva_assegna_protocollo",[s,fattura,"2026-10-15",null])).id).toBe(p.id);
    await expect(rpc("iva_assegna_protocollo",[s,fattura,"2026-10-16",null])).rejects.toThrow(/già un protocollo/);
    await rpc("iva_annulla_protocollo",[p.id,"Sezionale scelto per errore"]);
    expect((await rpc<{numero:number}>("iva_assegna_protocollo",[s,fattura,"2026-10-15",null])).numero).toBe(2);
  });
  it("rifiuta documento di altro tenant, sola lettura e stampe definitive",async()=>{
    const s=await rpc<string>("iva_crea_sezionale",[company,"acquisti","A1","Acquisti"]);
    await pg.query<Record<string, unknown>>("insert into fatture_ricevute(id,company_id) values($1,$2)",[id(21),other]);
    await expect(rpc("iva_assegna_protocollo",[s,id(21),"2026-10-15",null])).rejects.toThrow(/non disponibile/);
    await pg.exec("update contabilita_esercizi set stampato_fino_al='2026-10-31'");
    await expect(rpc("iva_assegna_protocollo",[s,fattura,"2026-10-15",null])).rejects.toThrow(/definitivo/);
    await pg.exec("select set_config('test.readonly','true',false)");
    await expect(rpc("iva_crea_sezionale",[company,"vendite","PA","Pubblica amministrazione"])).rejects.toThrow(/permesso/);
  });
});
