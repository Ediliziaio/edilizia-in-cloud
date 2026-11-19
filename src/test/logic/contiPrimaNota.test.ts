import { describe, expect, it } from "vitest";
import { mappaContiPrimaNota, contiDiLiquidita } from "@/lib/contabilita/contiPrimaNota";
import type { ContoContabile } from "@/lib/contabilita/libroGiornale";

const conto = (id:string,descrizione:string,over:Partial<ContoContabile>={}):ContoContabile => ({
  id,codice:id,descrizione,natura:'attivo',sezione_cee:'SPA',voce_cee:null,mastro_id:null,movimentabile:true,attivo:true,...over,
});
const piano = [
  conto('banche','Disponibilità liquide',{codice_standard:'06.01',movimentabile:false}),
  conto('casse','Contanti',{codice_standard:'06.02',movimentabile:false}),
  conto('b1','Cassa di Risparmio',{mastro_id:'banche'}),
  conto('c1','Fondo ufficio',{mastro_id:'casse'}),
];
describe('conti di liquidità per tipo e identità',()=>{
  it('il ruolo del mastro distingue la banca dal contante anche con nomi diversi',()=>{
    const c=mappaContiPrimaNota([],piano);
    expect(c.find(x=>x.valore==='conto:b1')).toMatchObject({cassa:false,conto_liquidita_id:'b1'});
    expect(c.find(x=>x.valore==='conto:c1')).toMatchObject({cassa:true,conto_liquidita_id:'c1'});
  });
  it('la scelta del sottoconto conserva anche l’identità della banca corrispondente',()=>{
    const c=mappaContiPrimaNota([{id:'reale',display_name:'Cassa di Risparmio',currency:'EUR'}],piano);
    expect(c.find(x=>x.valore==='banca:reale')).toMatchObject({cassa:false,bank_account_id:'reale',conto_liquidita_id:'b1'});
    expect(c.find(x=>x.valore==='conto:b1')).toMatchObject({cassa:false,bank_account_id:'reale',conto_liquidita_id:'b1'});
  });
  it('due conti bancari con lo stesso nome richiedono la scelta dell’identità effettiva',()=>{
    const c=mappaContiPrimaNota([{id:'a',display_name:'Cassa di Risparmio'},{id:'b',display_name:'Cassa di Risparmio'}],piano);
    expect(c.find(x=>x.valore==='conto:b1')?.bank_account_id).toBeNull();
    expect(c.filter(x=>x.valore.startsWith('banca:')).map(x=>x.bank_account_id)).toEqual(['a','b']);
  });
  it('una banca chiamata Cassa non viene collegata al conto dei contanti omonimo',()=>{
    const c=mappaContiPrimaNota([{id:'banca',display_name:'Cassa'}],[conto('cash','Cassa',{codice_standard:'06.02'})]);
    expect(c.find(x=>x.valore==='banca:banca')).toMatchObject({cassa:false,conto_liquidita_id:null});
    expect(c.find(x=>x.valore==='conto:cash')).toMatchObject({cassa:true,bank_account_id:null});
  });
  it('esclude conti inattivi, non movimentabili e banche senza identità o non in euro',()=>{
    const c=mappaContiPrimaNota([{id:null,display_name:'Senza identità'},{id:'usd',currency:'USD'}],[...piano,conto('chiuso','Banca chiusa',{attivo:false})]);
    expect(c.map(x=>x.valore)).toEqual(['conto:b1','conto:c1']);
  });
  it('un ciclo nel piano non blocca la lettura e i conti di costo non diventano liquidità',()=>{
    const p=[conto('x','Deposito',{mastro_id:'y'}),conto('y','Altro',{mastro_id:'x'}),conto('costo','Banca',{natura:'costo'})];
    expect(contiDiLiquidita(p)).toEqual([]);
  });
});
