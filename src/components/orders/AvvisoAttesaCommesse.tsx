import {useEffect,useState} from "react";
import {Button} from "@/components/ui/button";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
/** Si monta soltanto durante l’attesa: nessun timer sopravvive alla pagina o al cambio azienda. */
export function AvvisoAttesaCommesse({onRetry,delay=20000}:{onRetry:()=>void;delay?:number}){
 const t=useT();
 const [visibile,setVisibile]=useState(false);
 useEffect(()=>{const timer=setTimeout(()=>setVisibile(true),delay);return()=>clearTimeout(timer);},[delay]);
 if(!visibile)return null;
 return <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><div><p className="font-semibold">{t("Il caricamento sta impiegando più del previsto")}</p><p className="text-xs">{t("Le commesse non risultano ancora caricate. Puoi riprovare senza uscire dal gestionale.")}</p></div><Button type="button" variant="outline" size="sm" onClick={onRetry}>{t("Riprova caricamento")}</Button></div>;
}
