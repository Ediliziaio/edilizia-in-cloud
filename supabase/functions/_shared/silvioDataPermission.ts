import {contractPermission} from "./silvioPermissionContracts.ts";
/** These two tools have exact granular gates; legacy aggregate flags are not grants. */
export function silvioVerifiedToolPermission(name:string,p:Record<string,unknown>,role?:string):boolean|null {
 const contract=contractPermission(name,p,role);if(contract!==null)return contract;
 if(name==='cerca_contatti_autorizzati')return p.can_view_marketing_contacts===true;
 if(name==='cerca_opportunita_autorizzate')return p.can_view_marketing_opportunities===true;
 return null;
}

/** Server policy, before tool execution. A prompt is never an authorization. */
export function silvioDataPermissionIssue(name:string,_domain:string|undefined,p:Record<string,unknown>,_writing=false,role?:string,args?:Record<string,unknown>):string|null {
 const allowed=contractPermission(name,p,role,args);
 if(allowed!==null)return allowed ? null : "Non hai i permessi richiesti per questo strumento. Nessuna operazione eseguita.";
 // Loading the catalogue grants no business data; every loaded tool is filtered again.
 if(name==='carica_strumenti')return null;
 return 'Questo strumento non dispone di un contratto di accesso verificato per il tuo utente. Usa gli strumenti autorizzati.';
}

/** Early UX denial; data/tool guards remain authoritative for every query. */
export function silvioQuestionPermissionIssue(question:string,p:Record<string,unknown>):string|null {
 const q=question.toLowerCase();
 if(/liquidit|saldo.*(?:banc|conto|conti)|disponibilit.*banc/.test(q) && p.can_view_bank_balances!==true)return "Non hai il permesso di consultare saldi bancari e liquidità.";
 if(/stipend|retribuz|bust[ae] pag|cedolin|costo orario|tariff[ae].*(operai|dipendent|person)/.test(q) && !(p.can_view_costs===true && (p.can_view_employees===true||p.can_view_persone===true)))return 'Non hai il permesso di consultare le retribuzioni o i costi individuali del personale.';
 if(/margini?|marginalit|redditiv|util[ei] della commessa/.test(q) && p.can_view_margins!==true)return 'Non hai il permesso di consultare i margini.';
 if(/costi|quanto costa|costo della commessa/.test(q) && p.can_view_costs!==true && p.can_manage_purchasing!==true)return 'Non hai il permesso di consultare i costi.';
 if(/incass|pagat[oa]|\brate\b/.test(q) && p.can_view_order_amounts!==true && (p.can_view_order_payment_status!==true || /quanto|import|somma|euro|totale|€/.test(q)))return 'Non hai il permesso di consultare questi dati sugli incassi. Il solo stato delle rate non comprende gli importi.';
 return null;
}
