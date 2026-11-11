type Turn={role:string;text?:string;content?:string;final?:boolean;type?:string};
const clean=(v:unknown)=>String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function fishHasExplicitConsent(text:string){const s=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();return !/non (?:ancora|confermo|proced|voglio|prenot)|aspetti|corregg|rettific|un momento|\bma\b|\binvece\b/.test(s) && /\b(?:si|confermo|proceda|va bene|va benissimo|d'accordo|puo(?: \w+){0,2} (?:annotare|registrare)|annoti pure|registri pure)\b/.test(s);}
export function fishActionConsent(turns:Turn[],tool:string,parameters:Record<string,unknown>){
 const spoken=turns.filter(t=>(!t.type || t.type==='message') && ['agent','assistant','user'].includes(t.role) && t.final!==false).map(t=>({role:t.role==='assistant'?'agent':t.role,text:String(t.text ?? t.content ?? '')}));
 const index=spoken.map(t=>t.role).lastIndexOf('user');const user=index>=0?spoken[index].text:'';const question=spoken.slice(0,index).filter(t=>t.role==='agent').at(-1)?.text || '';
 const directNote=tool==='aggiorna_opportunita' && /(?:pu[oò](?: \w+){0,2} (?:annotare|registrare)|annoti pure|registri pure)/i.test(user) && !/non (?:pu[oò]|annot|registr)/i.test(user);
 if(!directNote && !fishHasExplicitConsent(user))return {ok:false,risposta:'Non ho una conferma positiva verificabile del cliente. Riepiloga l’azione e attendi il sì: il consenso a parlare, una richiesta generica o una correzione non autorizzano la scrittura.'};
 const relevant=tool==='fissa_appuntamento'?/prenot|fiss|conferm.*appunt/i.test(question):tool==='richiesta_richiamo'?/richiam|ricontatt/i.test(question):/annot|registr|nota|ufficio|aggiorn/i.test(question);
 if(!directNote && (!question.includes('?') || !relevant))return {ok:false,risposta:'La risposta non segue il riepilogo di questa azione. Chiedi chiaramente la conferma della prenotazione, del richiamo o della nota prima di salvarla.'};
 return {ok:true};
}
export function fishHasOptoutRequest(value:string){const text=value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();return /non (?:mi|ci) (?:ri)?(?:chiam|contatt)|non (?:ri)?(?:chiam|contatt)atemi|non (?:voglio|desidero).*?(?:chiam|contatt)|smett.*?(?:chiam|contatt)|basta.*?(?:telefon|chiam)/.test(text);}
export function fishCallbackNumberAllowed(turns:Turn[],current:string,requested:string){if(requested===current)return true;return turns.filter(t=>t.role==='user' && t.final!==false).some(t=>{const digits=String(t.text ?? t.content ?? '').replace(/[^0-9]/g,'');return digits.length>=7 && (digits.includes(requested.replace(/\D/g,'')) || requested.replace(/\D/g,'').endsWith(digits));});}
