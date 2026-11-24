import { describe,expect,it } from 'vitest';
import { afterDays,upcomingDate,pipelineStages,concludedStages,stageCount,evidenceState,evidenceExpiring } from './portfolio';
import type { Evidence,Participation,Stage } from './types';

describe('riepiloghi del portafoglio',()=>{
 it('mantiene distinte pronte, presentate ed esiti e comprende tutti gli stati',()=>{
  const stages:Stage[]=['in_valutazione','in_preparazione','in_revisione','pronta','presentata','esito','ritirata','non_partecipare'];
  const rows=stages.map((stage,i)=>({id:String(i),stage})) as Participation[];
  expect(pipelineStages.map(s=>stageCount(rows,s.id))).toEqual([1,1,1,1,1]);
  expect(concludedStages.map(s=>stageCount(rows,s))).toEqual([1,1,1]);
  expect(new Set([...pipelineStages.map(s=>s.id),...concludedStages]).size).toBe(stages.length);
 });
 it('calcola le finestre di calendario attraverso fine mese e cambio d’ora',()=>{
  expect(afterDays('2026-10-25',7)).toBe('2026-11-01');
  expect(upcomingDate('2026-10-24','2026-10-25',7)).toBe(false);
  expect(upcomingDate('2026-10-25','2026-10-25',7)).toBe(true);
  expect(upcomingDate('2026-11-01','2026-10-25',7)).toBe(true);
  expect(upcomingDate('2026-11-02','2026-10-25',7)).toBe(false);
 });
 it('non presenta come valida un’evidenza scaduta, non verificata o verificata nel futuro',()=>{
  const e={status:'valido',verified_on:'2026-11-01',expires_on:'2026-12-01'} as Evidence;
  expect(evidenceState(e,'2026-11-11')).toBe('valida');
  for(const patch of [{expires_on:'2026-11-10'},{verified_on:''},{verified_on:'2026-11-12'},{status:'in_verifica'}])expect(evidenceState({...e,...patch},'2026-11-11')).toBe('da_verificare');
  expect(evidenceState({...e,status:'non_applicabile'},'2026-11-11')).toBe('non_applicabile');
 });
 it('segnala la scadenza entro 30 giorni soltanto tra le evidenze valide oggi',()=>{
  const e={status:'valido',verified_on:'2026-11-01',expires_on:'2026-12-11'} as Evidence;
  expect(evidenceExpiring(e,'2026-11-11')).toBe(true);
  for(const patch of [{expires_on:'2026-12-12'},{expires_on:null},{expires_on:'2026-11-10'},{status:'in_verifica'},{status:'non_applicabile'}])expect(evidenceExpiring({...e,...patch},'2026-11-11')).toBe(false);
 });
});
