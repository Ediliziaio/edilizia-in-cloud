import {contractPermission,SILVIO_PERMISSION_CONTRACTS}from"./silvioPermissionContracts.ts";
/** These two tools have exact granular gates; legacy aggregate flags are not grants. */
export function silvioVerifiedToolPermission(name:string,p:Record<string,unknown>,role?:string):boolean|null {
 const contract=contractPermission(name,p,role);if(contract!==null)return contract;
 if(name==='cerca_contatti_autorizzati')return p.can_view_marketing_contacts===true;
 if(name==='cerca_opportunita_autorizzate')return p.can_view_marketing_opportunities===true;
 return null;
}

/** Server policy, before tool execution. A prompt is never an authorization. */
export function silvioDataPermissionIssue(name:string,domain:string|undefined,p:Record<string,unknown>,writing=false,role?:string,args?:Record<string,unknown>):string|null {
 if(SILVIO_PERMISSION_CONTRACTS[name])return contractPermission(name,p,role,args) ? null : "Non hai i permessi richiesti per questo strumento. Nessuna operazione eseguita.";
 if(name!=='carica_strumenti')return 'Questo strumento non dispone di un contratto di accesso verificato per il tuo utente. Usa gli strumenti autorizzati.';
 if(writing && ['cantiere','operations'].includes(domain??'') && p.can_edit_orders!==true)return 'Puoi consultare le commesse ma non modificarle.';
 if(/export|esporta/.test(name) && ['crm','sales','marketing'].includes(domain??'') && p.can_export_clients!==true)return 'Non hai il permesso di esportare i contatti.';
 if(name==='universal_search')return 'Usa gli strumenti delle singole aree: la ricerca trasversale non garantisce i tuoi permessi sui dati.';
 if(/marginalit|margin|profit|redditiv/i.test(name) && p.can_view_margins!==true)return 'Non hai il permesso di vedere i margini.';
 if(/overdue_payments|revenue_forecast|pricing_history|customers_ltv|get_top_customers|quotes_summary/.test(name) && p.can_view_order_amounts!==true)return 'Non hai il permesso di vedere gli importi.';
 const legacyCrm = ['crm','sales','marketing','preventivi'].includes(domain??'') && !['cerca_contatti_autorizzati','cerca_opportunita_autorizzate','search_brain'].includes(name);
 if(legacyCrm && writing)return 'Questo strumento non ha ancora una verifica completa dei permessi di modifica. Usa la funzione autorizzata della piattaforma.';
 if(legacyCrm && ['can_view_marketing_contacts','can_view_marketing_opportunities','can_view_marketing_activities','can_view_marketing_appointments','can_view_marketing_reports'].some(k=>p[k]!==true))return 'Questo strumento CRM aggrega più tipi di dati. Usa gli strumenti autorizzati per contatti o opportunità.';
 if(p.only_assigned===true && ['crm','sales','marketing','preventivi'].includes(domain??'') && !['cerca_contatti_autorizzati','cerca_opportunita_autorizzate','search_brain'].includes(name))return 'Per il tuo portafoglio CRM usa cerca_contatti_autorizzati o cerca_opportunita_autorizzate. Questo strumento non garantisce il filtro sui dati assegnati.';
 if(name==='cerca_contatti_autorizzati' && p.can_view_marketing_contacts!==true)return 'Non hai accesso ai contatti CRM.';
 if(name==='cerca_opportunita_autorizzate' && p.can_view_marketing_opportunities!==true)return 'Non hai accesso alle opportunità CRM.';
 return null;
}

/** Early UX denial; data/tool guards remain authoritative for every query. */
export function silvioQuestionPermissionIssue(question:string,p:Record<string,unknown>):string|null {
 const q=question.toLowerCase();
 if(/stipend|retribuz|bust[ae] pag|cedolin|costo orario|tariff[ae].*(operai|dipendent|person)/.test(q) && !(p.can_view_costs===true && (p.can_view_employees===true||p.can_view_persone===true)))return 'Non hai il permesso di consultare le retribuzioni o i costi individuali del personale.';
 if(/margini?|marginalit|redditiv|util[ei] della commessa/.test(q) && p.can_view_margins!==true)return 'Non hai il permesso di consultare i margini.';
 if(/costi|quanto costa|costo della commessa/.test(q) && p.can_view_costs!==true && p.can_manage_purchasing!==true)return 'Non hai il permesso di consultare i costi.';
 if(/incass|pagat[oa]|\brate\b/.test(q) && p.can_view_order_amounts!==true && (p.can_view_order_payment_status!==true || /quanto|import|somma|euro|totale|€/.test(q)))return 'Non hai il permesso di consultare questi dati sugli incassi. Il solo stato delle rate non comprende gli importi.';
 return null;
}
