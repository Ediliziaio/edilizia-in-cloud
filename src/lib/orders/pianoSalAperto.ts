import type {Installment} from "@/lib/orderUtils";
import {parseDecimalITStrict} from "@/lib/parseDecimalIT";
export type ModalitaPiano = "fixed" | "advance_sal" | "sal";
export interface PianoSalAperto {version:1; mode:"advance_sal"|"sal";}
export function leggiPianoSal(raw:unknown):PianoSalAperto|null {
 if(!raw||typeof raw!=="object")return null;
 const r=raw as Record<string,unknown>;
 return r.version===1&&(r.mode==="advance_sal"||r.mode==="sal")?{version:1,mode:r.mode}:null;
}
export function pianoSalDaOrdine(order:unknown){return order&&typeof order==="object"&&"payment_terms" in order?leggiPianoSal(order.payment_terms):null;}
export function preparaPianoSal(mode:"advance_sal"|"sal",total:number,input:string="20",unit:"percent"|"amount"="percent"):{rate:Installment[];error:string|null} {
 if(!Number.isFinite(total)||total<=0)return {rate:[],error:"Inserisci prima il totale del contratto."};
 if(mode==="sal")return {rate:[],error:null};
 const value=parseDecimalITStrict(input);
 const amount=Math.round((unit==="percent"?total*value/100:value)*100)/100;
 if(!Number.isFinite(value)||value<=0||Math.abs(value-Math.round(value*100)/100)>0.000001||amount<=0||amount>=Math.round(total*100)/100)return {rate:[],error:"L’acconto deve essere maggiore di zero e inferiore al totale del contratto, con al massimo due decimali."};
 return {rate:[{position:0,label:"Acconto alla firma",type:"deposit",amount,is_paid:false,trigger_evento:"firma_contratto",...(unit==="percent"?{percent:value}:{})}],error:null};
}
export function verificaPianoSal(policy:PianoSalAperto,rate:ReadonlyArray<Installment>,total:number):string|null {
 if(!Number.isFinite(total)||total<=0)return "Inserisci prima il totale del contratto.";
 if(rate.some(r=>r.type!=="deposit" || !Number.isFinite(r.amount)||r.amount<0))return "Nel piano a SAL non inserire un saldo futuro: si determina dai lavori effettivi.";
 if(rate.reduce((s,r)=>s+r.amount,0)>Math.round(total*100)/100)return "I pagamenti già definiti superano il totale del contratto.";
 if(policy.mode==="advance_sal"&&!rate.some(r=>r.amount>0))return "Definisci l’acconto iniziale oppure scegli Solo SAL.";
 return null;
}
