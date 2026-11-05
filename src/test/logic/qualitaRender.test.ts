import { describe, expect, it } from 'vitest';
import { parametriQualitaRender, qualitaImmagineRender, tempoQaRender } from '../../../shared/render-quality/quality.ts';

describe('qualità effettiva comune ai motori render',()=>{
 it('conserva Standard per configurazioni precedenti e valori non supportati',()=>{
  for(const value of [null,{}, {qualita_render:'ultra'}, {qualita_render:true}]) expect(qualitaImmagineRender(value)).toBe('medium');
 });
 it('riconosce Alta nel body, nel config normale e nel payload legacy',()=>{
  for(const value of [{qualita_render:'alta'},{config:{qualita_render:'alta'}},{legacy_config:{qualita_render:'alta'}},{config:{schema_version:'render_v2',legacy_config:{qualita_render:'alta'}}}]) expect(qualitaImmagineRender(value)).toBe('high');
 });
 it('Alta va al provider diretto con tempo sufficiente e senza declassamento',()=>{
  expect(parametriQualitaRender({qualita_render:'alta'},1000,false,1000)).toEqual({openaiQuality:'high',directProviderOnly:true,timeoutMs:110000});
 });
 it('preparazione e tentativi consumano lo stesso budget',()=>{
  expect(parametriQualitaRender({qualita_render:'alta'},1000,false,51000).timeoutMs).toBe(70000);
  expect(parametriQualitaRender({},1000,false,51000).timeoutMs).toBe(35000);
  expect(()=>parametriQualitaRender({qualita_render:'alta'},1000,true,112000)).toThrow(/Tempo disponibile/);
 });
 it('il controllo visivo conserva una riserva per il salvataggio',()=>{
  expect(tempoQaRender(1000,1000)).toBe(18000);
  expect(tempoQaRender(1000,125000)).toBe(8000);
  expect(tempoQaRender(1000,140000)).toBe(1000);
 });
});
