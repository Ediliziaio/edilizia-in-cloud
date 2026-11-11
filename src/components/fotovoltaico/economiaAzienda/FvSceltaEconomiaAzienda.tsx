import {Banknote,Landmark,FileKey2,RefreshCw,Check} from "lucide-react";
import type {ParametriEconomiaAzienda} from "../../../../supabase/functions/_shared/fvEconomiaAzienda";
import "./economiaAzienda.css";
type Modo=ParametriEconomiaAzienda["modo"];
const opzioni=[{modo:"cash",nome:"Acquisto diretto",testo:"Risorse proprie",Icon:Banknote},{modo:"rate",nome:"Finanziamento",testo:"Rata da offerta verificata",Icon:Landmark},{modo:"leasing",nome:"Leasing",testo:"Maxicanone e riscatto",Icon:FileKey2},{modo:"noleggio",nome:"Noleggio operativo",testo:"Canone da tabella",Icon:RefreshCw}] as const;
export function FvSceltaEconomiaAzienda({valore,onChange,readOnly=false}:{valore:Modo;onChange:(modo:Modo)=>void;readOnly?:boolean}){
 return <section className="eic-fin-choice" aria-label="Modalità preventivo azienda"><div className="eic-fin-choicehead"><h3>Modalità di pagamento</h3><span>Stesso impianto, formule diverse</span></div><div className="eic-fin-methods" role="radiogroup" aria-label="Pagamento azienda nella fase Finanza">{opzioni.map(({modo,nome,testo,Icon})=><button type="button" role="radio" aria-checked={valore===modo} aria-pressed={valore===modo} disabled={readOnly} key={modo} onClick={()=>onChange(modo)}><span className="eic-fin-methodicon"><Icon size={20} strokeWidth={1.7}/>{valore===modo&&<Check size={14}/>}</span><strong>{nome}</strong><span>{testo}</span></button>)}</div></section>;
}
