import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UnifiedRow } from '@/components/marketing/preventivi/UnifiedPreventiviList';
const f = vi.hoisted(() => ({ calls: [] as unknown[][], data: [{id:'x'}] as unknown[], error: null as null | {message:string} }));
vi.mock('@/integrations/supabase/client', () => {
  const chain: Record<string, unknown> = {};
  for (const m of ['update','eq','is']) chain[m] = (...args: unknown[]) => { f.calls.push([m,...args]); return chain; };
  chain.select = (...args: unknown[]) => { f.calls.push(['select',...args]); return Promise.resolve({data:f.data,error:f.error}); };
  return {supabase:{from:(name: string) => {f.calls.push(['from',name]); return chain;}}};
});
import { salvaSpostamentoPreventivo } from '@/lib/preventivi/salvaSpostamentoPipeline';
const riga: UnifiedRow = {id:'x',tipo:'serramenti',numero:'S-1',cliente:'Demo',commerciale_id:null,commerciale_nome:null,stato_raw:'bozza',stato_unif:'bozza',totale:100,data:'2026-01-01',href:'/test'};
beforeEach(() => {f.calls=[];f.data=[{id:'x'}];f.error=null;});
describe('salvataggio dello spostamento', () => {
 it('limita azienda, preventivo, stato precedente e documenti non eliminati', async () => {
  await salvaSpostamentoPreventivo('azienda-1',riga,'in_corso');
  expect(f.calls).toEqual([['from','sr_progetti'],['update',{stato:'da_consegnare'}],['eq','company_id','azienda-1'],['eq','id','x'],['eq','stato','bozza'],['is','deleted_at',null],['select','id']]);
 });
 it('rifiuta uno stato cambiato da un altro utente', async () => {
  f.data=[]; await expect(salvaSpostamentoPreventivo('azienda-1',riga,'in_corso')).rejects.toThrow('stato è cambiato');
 });
 it('non fa scritture per una transizione che richiede un documento', async () => {
  await expect(salvaSpostamentoPreventivo('azienda-1',{...riga,tipo:'computo'},'vinto')).rejects.toThrow();
  expect(f.calls).toEqual([]);
 });
});
