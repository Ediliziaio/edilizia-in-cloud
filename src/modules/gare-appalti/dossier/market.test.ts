import{describe,it,expect}from'vitest';import{marketSummary,parseMarketCsv,type MarketRecord}from'./market';import{watchDifference,watchedTenders}from'./search-watch';import type{Workspace}from'../types';
describe('Storico e monitoraggio locale',()=>{
 it('calcola la mediana soltanto su ribassi confermati, inclusi zeri e senza inventare dati mancanti',()=>{const record=(discount:number|null,status='confermato')=>({discount,status,reviewed_by:'r'} as MarketRecord);const s=marketSummary([record(0),record(10),record(20),record(null),record(90,'in_verifica')]);expect(s.count).toBe(3);expect(s.median).toBe(10);expect(s.min).toBe(0);expect(s.buckets.reduce((n,b)=>n+b.count,0)).toBe(3);expect(marketSummary([]).median).toBeNull();});
 it('CSV valida date, numeri, fonte e duplicati senza convertire un importo in ribasso',()=>{const header='external_key;tender_name;authority;territory;category;award_date;base_amount;discount;award_amount;operator;source;source_url;notes';const row='CIG001;Gara esempio;Comune;Lombardia;OG1;2026-10-10;100000;;85000;Impresa;Esito pubblicato;;Test';expect(parseMarketCsv(header+'\n'+row)[0].discount).toBeNull();expect(()=>parseMarketCsv(header+'\n'+row+'\n'+row)).toThrow(/duplicato/);expect(()=>parseMarketCsv(header+'\n'+row.replace('2026-10-10','2026-02-30'))).toThrow(/data/);expect(()=>parseMarketCsv(header+'\n'+row.replace('100000','1.000,00'))).toThrow(/numero/);});
 it('ricerche applicano gli stessi filtri e separano aggiunte e rimozioni',()=>{const data={tenders:[{id:'a',title:'Scuola',authority:'Comune',territory:'Lombardia',base_amount:100,kind:'gara_aperta',deadline_date:'2026-12-01'},{id:'b',title:'Scuola',authority:'Comune',territory:'Veneto',base_amount:1000,kind:'invito',deadline_date:null}],preferences:[]} as unknown as Workspace;expect(watchedTenders(data,new URLSearchParams({q:'scuola',territorio:'Lombardia',importo_min:'50',entro:'2026-12-31'})).map(t=>t.id)).toEqual(['a']);expect(watchDifference(['a','b'],['b','c'])).toEqual({added:['c'],removed:['a']});});
});

it('ritrova una gara per ente e numero in qualunque ordine e per CIG del lotto', () => {
 const data = {
  tenders:[{id:'aler',title:'ALER 24/2026',authority:'ALER Brescia – Cremona – Mantova'}],
  lots:[{tender_id:'aler',code:'LOT-0001',title:'Cremona Sud · CIG BD613D6005'}],
  preferences:[],
 } as unknown as Workspace;
 for(const q of ['2026 aler 24','ALER 24-2026','bd613d6005','cremona lot-0001']) {
  expect(watchedTenders(data,new URLSearchParams({q})).map(t=>t.id)).toEqual(['aler']);
 }
 expect(watchedTenders(data,new URLSearchParams({q:'bd613d7000'}))).toEqual([]);
});
