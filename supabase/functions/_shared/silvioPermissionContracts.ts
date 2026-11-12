/** Authorization belongs to the server, not to a role label or a model prompt. */
export const STAFF_TOOL_ROLES = ['company_staff','salesperson','call_center','employee','subcontractor'];
type Permission = Record<string,unknown>;
type Contract = {any?:string[];all?:string[];write?:boolean;fieldReport?:boolean;fieldOrders?:boolean;adapter?:boolean};
export const SILVIO_PERMISSION_CONTRACTS:Record<string,Contract> = {
 get_orders_summary:{all:['can_view_orders'],fieldOrders:true,adapter:true},
 search_orders:{all:['can_view_orders'],fieldOrders:true,adapter:true},
 report_commessa:{all:['can_view_orders'],fieldOrders:true,adapter:true},
 get_marginalita_commesse:{all:['can_view_orders','can_view_margins'],adapter:true},
 get_quadro_incassi:{all:['can_view_orders'],any:['can_view_order_amounts','can_view_order_payment_status'],adapter:true},
 get_overdue_payments:{all:['can_view_orders','can_view_order_amounts'],adapter:true},
 get_team_summary:{any:['can_view_employees','can_view_persone'],adapter:true},
 lista_dipendenti_oggi:{any:['can_view_employees','can_view_persone'],adapter:true},
 cerca_contatti_autorizzati:{all:['can_view_marketing_contacts'],adapter:true},
 cerca_opportunita_autorizzate:{all:['can_view_marketing_opportunities'],adapter:true},
 aggiorna_stato_commessa:{all:['can_view_orders','can_edit_orders'],write:true},
 registra_pagamento_commessa:{all:['can_view_orders','can_edit_orders','can_view_order_amounts','can_manage_payments'],write:true},
 registra_rapportino:{all:['can_view_orders','can_edit_giornale_lavori'],write:true,fieldReport:true},
 aggiorna_opportunita:{all:['can_view_marketing_opportunities','can_edit_marketing_opportunities'],write:true},
 create_quote_draft:{all:['can_view_preventivi','can_edit_preventivi'],write:true},
 crea_preventivo_bozza:{all:['can_view_preventivi','can_edit_preventivi'],write:true},
 fissa_appuntamento:{all:['can_view_calendar'],write:true},
};
export const AUTHORIZED_AREAS:Record<string,Contract>={
 commesse:{all:['can_view_orders'],fieldOrders:true},economia:{all:['can_view_orders'],fieldOrders:true},incassi:{all:['can_view_orders'],any:['can_view_order_amounts','can_view_order_payment_status']},
 personale:{any:['can_view_employees','can_view_persone']},contatti:{all:['can_view_marketing_contacts']},opportunita:{all:['can_view_marketing_opportunities']},fatture:{all:['can_view_billing']},fornitori:{any:['can_manage_suppliers','can_manage_purchasing']},calendario:{all:['can_view_calendar']},attivita:{},documenti:{all:['can_view_orders'],fieldOrders:true},
};
SILVIO_PERMISSION_CONTRACTS.leggi_dati_autorizzati={adapter:true};
SILVIO_PERMISSION_CONTRACTS.modifica_contatto_autorizzato={all:['can_view_marketing_contacts','can_edit_marketing_contacts'],write:true,adapter:true};
SILVIO_PERMISSION_CONTRACTS.modifica_opportunita_autorizzata={all:['can_view_marketing_opportunities','can_edit_marketing_opportunities'],write:true,adapter:true};
for (const name of ['crea_attivita_area','prendi_in_carico_attivita','rilascia_attivita_area']) SILVIO_PERMISSION_CONTRACTS[name]={write:true,adapter:true};
export function contractPermission(name:string,p:Permission,role?:string,args?:Record<string,unknown>):boolean|null {
 if(name==='leggi_dati_autorizzati'){
  if(!args)return Object.keys(AUTHORIZED_AREAS).some(area=>contractPermission(name,p,role,{area})===true);
  const area=AUTHORIZED_AREAS[String(args.area)];if(!area)return false;
  return (!area.all||area.all.every(k=>p[k]===true||k==='can_view_orders'&&area.fieldOrders&&['employee','subcontractor'].includes(role??'')))&&(!area.any||area.any.some(k=>p[k]===true));
 }
 const c=SILVIO_PERMISSION_CONTRACTS[name];if(!c)return null;
 if(c.write && p.sola_lettura===true)return false;
 if(c.fieldReport && ['employee','subcontractor'].includes(role??''))return true;
 return (!c.all || c.all.every(k=>p[k]===true || (k==='can_view_orders' && c.fieldOrders && ['employee','subcontractor'].includes(role??'')))) && (!c.any || c.any.some(k=>p[k]===true));
}
export function staffToolRoleAllowed(name:string,role:string,original:string[]):boolean {
 return original.includes(role)||original.includes('*')||STAFF_TOOL_ROLES.includes(role)&&!!SILVIO_PERMISSION_CONTRACTS[name];
}
