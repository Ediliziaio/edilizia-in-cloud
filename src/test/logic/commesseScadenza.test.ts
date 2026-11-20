import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Scadenza } from "@/hooks/useScadenzario";
import { commesseScadenza, completaCommesseScadenze, noteFattureScadenze } from "@/lib/finance/commesseScadenza";

const stato=vi.hoisted(()=>({chiamate:[] as Array<{tabella:string;company?:string;ids?:string[]}>,errore:false}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{from:(tabella:string)=>{
  const chiamata:{tabella:string;company?:string;ids?:string[]}={tabella};stato.chiamate.push(chiamata);
  let da=0,a=499;
  const q={select:()=>q,order:()=>q,eq:(_k:string,v:string)=>{chiamata.company=v;return q;},in:(_k:string,v:string[])=>{chiamata.ids=v;return q;},range:(d:number,f:number)=>{da=d;a=f;return q;},
    then:(ok:(r:unknown)=>unknown)=>Promise.resolve({error:stato.errore?new Error('Lettura incompleta'):null,data:(tabella==='orders'?(chiamata.ids??[]).map(id=>({id,order_code:`COD-${id}`})):
      Array.from({length:501},(_,i)=>({id:`f${i}`,company_cost_id:'costo',numero_fattura:`F${i}`,note_interne:i===500?'Ultima nota':i===0?'Nota fattura':null}))).slice(da,a+1)}).then(ok)};
  return q;
}}}));
const riga=(extra:Partial<Scadenza>={})=>({id:'scadenza',order_id:null,cost_id:'costo',orders:null,company_costs:{name:'Spesa',allocations:[{order_id:'A',pct:60},{order_id:'B',pct:40}]},notes:'Nota scadenza [DOC:00000000-0000-4000-a000-000000000001]',...extra}) as Scadenza;
beforeEach(()=>{stato.chiamate=[];stato.errore=false;});
describe('Commesse e note dello scadenzario',()=>{
  it('risolve tutte le commesse di un costo ripartito anche senza order_id sulla scadenza',async()=>{
    const righe=await completaCommesseScadenze('azienda',[riga(),riga({id:'seconda'})]);
    expect(commesseScadenza(righe[0])).toBe('COD-A · COD-B');
    expect(stato.chiamate).toEqual([{tabella:'orders',company:'azienda',ids:['A','B']}]);
  });
  it('usa la destinazione attuale del costo e non una precedente associazione della rata',async()=>{
    const [s]=await completaCommesseScadenze('azienda',[riga({order_id:'vecchia',orders:{order_code:'VECCHIA'}})]);
    expect(commesseScadenza(s)).toBe('COD-A · COD-B');
  });
  it('esporta note della scadenza, del costo e di tutte le fatture anche oltre la prima pagina',async()=>{
    const [s]=[riga({company_costs:{name:'Spesa',notes:'Nota costo'}})];
    const note=await noteFattureScadenze('azienda',[s]);
    expect(note.get(s.id)).toBe('Nota scadenza | Nota costo | Fatt. F0: Nota fattura | Fatt. F500: Ultima nota');
    expect(stato.chiamate.every(c=>c.company==='azienda')).toBe(true);
  });
  it('non esporta un risultato parziale quando fallisce la lettura delle associazioni o delle note',async()=>{
    stato.errore=true;
    await expect(completaCommesseScadenze('azienda',[riga()])).rejects.toThrow('Lettura incompleta');
    await expect(noteFattureScadenze('azienda',[riga()])).rejects.toThrow('Lettura incompleta');
  });
});
