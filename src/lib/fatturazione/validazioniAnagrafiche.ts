/** Validazione fiscale condivisa tra editor, anagrafiche e invio SDI. */
import { validatePartitaIva, validateCodiceFiscale } from '../../../supabase/functions/_shared/italianFiscalValidation';
export function validaPartitaIva(raw: string): {valida:boolean;errore?:string} {
 if (!/^\d{11}$/.test(raw.replace(/\s/g,''))) return {valida:false,errore:'La P.IVA deve avere 11 cifre'};
 const r=validatePartitaIva(raw);return {valida:r.ok,errore:r.hint};
}
export function validaCodiceFiscale(raw: string): {valida:boolean;errore?:string} {
 if(!raw.trim())return {valida:false,errore:'Codice fiscale mancante'};
 const r=validateCodiceFiscale(raw);return {valida:r.ok,errore:r.hint};
}
