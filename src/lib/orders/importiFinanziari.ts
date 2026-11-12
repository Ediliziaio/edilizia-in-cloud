import { supabase } from '@/integrations/supabase/client';
import { withClientTimeout } from '@/lib/query-timeout';
export interface CreditiMisura {
  fatturato: number; incassato: number; residuo: number; scaduto: number;
  documenti: Array<{id:string;nativo:boolean;numero:string;totale:number;incassato:number;residuo:number;scadenza:string|null}>;
}
export interface ImportiFinanziari {
  order_type?: 'cliente'|'appaltatore_lavoro'|null;
  valorizzazione?: string|null;
  crediti_misura?: CreditiMisura|null;
  incasso_unita_lordo?: number|null;
  coperto_unita_netto?: number|null;
  permuta_unita_netto?: number|null;
}
const numero=(v:unknown):number=>{
  const n=Number(v); if(v==null || !Number.isFinite(n) || n<0) throw new Error('Importi finanziari da verificare. Riprova.');
  return n;
};
export function leggiCreditiMisura(raw:unknown):CreditiMisura|null {
  if(raw==null) return null;
  const r=raw as CreditiMisura;
  if(!Array.isArray(r.documenti)) throw new Error('Documenti dei crediti non disponibili.');
  return {fatturato:numero(r.fatturato),incassato:numero(r.incassato),residuo:numero(r.residuo),scaduto:numero(r.scaduto),
    documenti:r.documenti.map(d=>({...d,totale:numero(d.totale),incassato:numero(d.incassato),residuo:numero(d.residuo)}))};
}
export async function caricaImportiFinanziari<T extends {id:string}>(companyId:string,rows:T[]):Promise<Array<T & ImportiFinanziari>> {
  const map=new Map<string,ImportiFinanziari>();
  const ids=[...new Set(rows.map(r=>r.id))];
  for(let offset=0;offset<ids.length;offset+=200) {
    const batch=ids.slice(offset,offset+200);
    const {data,error}=await withClientTimeout(supabase.rpc('commesse_importi_finanziari' as never,{p_company_id:companyId,p_ids:batch} as never),'Lettura incassi e crediti',12000);
    if(error) throw new Error('Incassi e crediti non disponibili. Aggiorna la pagina o riprova.');
    if(!Array.isArray(data)) throw new Error('Risposta degli incassi non valida.');
    for(const item of data as Array<{id:string} & ImportiFinanziari>) {
      map.set(item.id,{...item,crediti_misura:leggiCreditiMisura(item.crediti_misura),
        incasso_unita_lordo:item.incasso_unita_lordo==null?null:numero(item.incasso_unita_lordo),
        coperto_unita_netto:item.coperto_unita_netto==null?null:numero(item.coperto_unita_netto),
        permuta_unita_netto:item.permuta_unita_netto==null?null:numero(item.permuta_unita_netto)});
    }
    if(batch.some(id=>!map.has(id))) throw new Error('Una commessa non è più disponibile. Aggiorna l’elenco.');
  }
  return rows.map(row=>({...row,...map.get(row.id)}));
}
