import { describe, expect, it, vi } from 'vitest';
import { attendiRicerca, cercaConfronti, creaCacheConfronti } from '@/lib/prezzario/ricercaConfronti';
import type { VoceComputoDaConfrontare, VocePrezzario } from '@/lib/prezzario/confronto';
const voce = (id='v'): VoceComputoDaConfrontare => ({id,descrizione:'demolizione pavimento',unita_misura:'mq',prezzo_unitario:10,quantita:1});
const rif: VocePrezzario = {id:'r',codice:'C',descrizione:'demolizione pavimento',unita_misura:'m2',prezzo:8};
function fake(responses: Array<{data:VocePrezzario[]|null;error:{message:string}|null}>) {
  const calls: string[]=[]; const signals: AbortSignal[]=[];
  const db={ from:()=>{
    let mode=''; const q={select:()=>q,eq:()=>q,in:()=>{mode='codici';return q;},textSearch:()=>{mode='testo';return q;},ilike:()=>{mode='fallback';return q;},limit:()=>q,
      abortSignal:(s:AbortSignal)=>{signals.push(s);calls.push(mode);return Promise.resolve(responses.shift()??{data:[],error:null});}};return q;
  }};
  return {db,calls,signals};
}
describe('prezzario: nessuna scansione ripetuta o inutile',()=>{
  it('riusa ricerche identiche anche aggiungendo una riga al computo',async()=>{
    const f=fake([{data:[rif],error:null}]);const memo=creaCacheConfronti();
    const signal=new AbortController().signal;
    await cercaConfronti(f.db,'utente/azienda','fonte',[voce()],signal,memo);
    const result=await cercaConfronti(f.db,'utente/azienda','fonte',[voce(),voce('copia')],signal,memo);
    expect(f.calls).toEqual(['testo']);expect(result.size).toBe(2);
  });
  it('mai fallback dopo timeout o permesso negato',async()=>{
    const f=fake([{data:null,error:{message:'statement timeout'}}]);
    await expect(cercaConfronti(f.db,'u','f',[voce()],new AbortController().signal,creaCacheConfronti())).rejects.toThrow('timeout');
    expect(f.calls).toEqual(['testo']);
  });
  it('fallback solo dopo ricerca completata senza risultati',async()=>{
    const f=fake([{data:[],error:null},{data:[rif],error:null}]);
    expect((await cercaConfronti(f.db,'u','f',[voce()],new AbortController().signal,creaCacheConfronti())).get('v')?.rif).toEqual(rif);
    expect(f.calls).toEqual(['testo','fallback']);
  });
  it('codice certo evita la ricerca descrittiva',async()=>{
    const f=fake([{data:[rif],error:null}]);
    const result=await cercaConfronti(f.db,'u','f',[{...voce(),codicePrezzario:'C'}],new AbortController().signal,creaCacheConfronti());
    expect(f.calls).toEqual(['codici']);expect(result.get('v')?.confidenza).toBe('certa');
  });
  it('cache isolata per identità/azienda e fonte',async()=>{
    const f=fake(Array.from({length:3},()=>({data:[rif],error:null as null})));const memo=creaCacheConfronti();
    for(const [scope,source] of [['a','f'],['b','f'],['a','g']]) await cercaConfronti(f.db,scope,source,[voce()],new AbortController().signal,memo);
    expect(f.calls).toHaveLength(3);
  });
  it('annullamento interrompe debounce senza query',async()=>{
    vi.useFakeTimers();const c=new AbortController();const pending=attendiRicerca(c.signal);c.abort(new Error('cambiato'));
    await expect(pending).rejects.toThrow('cambiato');expect(vi.getTimerCount()).toBe(0);vi.useRealTimers();
  });
  it('signal già annullato impedisce qualsiasi chiamata',async()=>{
    const f=fake([]),c=new AbortController();c.abort(new Error('stop'));
    await expect(cercaConfronti(f.db,'u','f',[voce()],c.signal,creaCacheConfronti())).rejects.toThrow('stop');expect(f.calls).toHaveLength(0);
  });
});
