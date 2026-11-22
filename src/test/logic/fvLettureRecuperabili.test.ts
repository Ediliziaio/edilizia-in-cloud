import { describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client',()=>({supabase:{}}));
import { integraLettureBollettaFv, erroreLetturaBollettaFv, type LetturaBollettaFv } from '@/lib/fotovoltaico/lettureBolletta';
import { analisiConsumiIniziale, datiBollettaVuoti, leggiAnalisiConsumi, type DocumentoBollettaFv } from '../../../supabase/functions/_shared/fvBollette';
const hash='a'.repeat(64), project='20000000-0000-4000-a000-000000000001', company='10000000-0000-4000-a000-000000000001';
const path=`${company}/${project}/${hash}.pdf`, pod='IT001E12345678';
function doc(kwh=6000,spesa:number|null=1800,podValue=pod,id=0):DocumentoBollettaFv {
 const dati={...datiBollettaVuoti(),pod:podValue,consumo_annuo_kwh:kwh,spesa_annua:spesa};
 return {id:`${hash}:${id}`,hash,path,nome:'Bolletta pubblica esempio.pdf',mime:'application/pdf',dati,estratti:structuredClone(dati),confermato:false,pagine_totali:3,pagine_non_lette:[],metodo:'ai'};
}
function job(documenti=[doc()]):LetturaBollettaFv{return {id:'30000000-0000-4000-a000-000000000001',path,nome:'Bolletta pubblica esempio.pdf',stato:'completata',documenti,errore:null,scade_il:'2026-11-22T12:00:00Z',updated_at:'2026-11-22T11:00:00Z'};}
describe('esiti bollette dopo chiusura e riapertura',()=>{
 it('acquisisce automaticamente consumi e spesa; salva e riapre senza aggiungere doppioni',()=>{
  const first=integraLettureBollettaFv(analisiConsumiIniziale(),[job()]);
  expect(first.documenti[0].dati).toMatchObject({consumo_annuo_kwh:6000,spesa_annua:1800});
  expect(first.documenti[0].confermato).toBe(false);
  const saved=leggiAnalisiConsumi(JSON.parse(JSON.stringify(first)))!;
  expect(integraLettureBollettaFv(saved,[job()])).toBe(saved);
  // La rimozione esplicita del documento resta salvata e non viene annullata dal recupero.
  const removed={...saved,documenti:[] as DocumentoBollettaFv[]};expect(integraLettureBollettaFv(removed,[job()])).toBe(removed);
 });
 it('una rilettura completa integra la spesa mancante e conserva il consumo corretto a mano',()=>{
  const old=doc(6000,null);old.pagine_non_lette=[3];old.dati.consumo_annuo_kwh=6100;
  const current={...analisiConsumiIniziale(),documenti:[old]};
  const next=integraLettureBollettaFv(current,[job()]);
  expect(next.documenti[0].dati).toMatchObject({consumo_annuo_kwh:6100,spesa_annua:1800});
  expect(next.documenti[0].estratti).toMatchObject({consumo_annuo_kwh:6000,spesa_annua:1800});
  expect(next.documenti[0].pagine_non_lette).toEqual([]);
 });
 it('non cambia un documento già confermato, neppure se arriva un esito differente',()=>{
  const old=doc(7000,2000);old.confermato=true;
  const current={...analisiConsumiIniziale(),documenti:[old],proiezioneConfermata:true};
  const next=integraLettureBollettaFv(current,[job()]);
  expect(next.documenti[0]).toBe(old);expect(next.proiezioneConfermata).toBe(true);
 });
 it('mantiene l’identità della fornitura se la nuova lettura cambia l’ordine dei POD',()=>{
  const pod2='IT001E87654321', a=doc(6000,null,pod,0),b=doc(8000,null,pod2,1);a.dati.consumo_annuo_kwh=6100;
  const next=integraLettureBollettaFv({...analisiConsumiIniziale(),documenti:[a,b]},[job([doc(8000,2400,pod2,0),doc(6000,1800,pod,1)])]);
  expect(next.documenti).toHaveLength(2);
  expect(next.documenti.find(d=>d.dati.pod===pod)?.dati).toMatchObject({consumo_annuo_kwh:6100,spesa_annua:1800});
  expect(next.documenti.find(d=>d.dati.pod===pod)?.id).toBe(a.id);
 });
 it('ignora esiti falliti, dati non validi e percorsi diversi dal lavoro richiesto',()=>{
  const initial=analisiConsumiIniziale();
  expect(integraLettureBollettaFv(initial,[{...job(),stato:'fallita'}])).toBe(initial);
  expect(integraLettureBollettaFv(initial,[{...job(),documenti:'JSON non valido'}])).toBe(initial);
  expect(integraLettureBollettaFv(initial,[{...job(),path:'altra-azienda/privato.pdf'}])).toBe(initial);
 });
 it('traduce trasporto e scadenza sessione, mantenendo il messaggio italiano del credito',async()=>{
  for(const message of ['Failed to send a request to the Edge Function','Supabase request timeout after 70000ms','signal is aborted without reason'])
    expect(await erroreLetturaBollettaFv(Error(message))).toMatch(/Connessione interrotta/);
  expect(await erroreLetturaBollettaFv(Error('Invalid JWT'))).toMatch(/Sessione non valida/);
  expect(await erroreLetturaBollettaFv({context:{json:async()=>({error:'Crediti AI esauriti. Ricarica per continuare.'})}})).toBe('Crediti AI esauriti. Ricarica per continuare.');
 });
});
