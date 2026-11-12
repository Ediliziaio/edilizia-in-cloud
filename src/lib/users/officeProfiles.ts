import type { StaffPermissions } from '@/components/users/PermissionsDialog';
import { DEFAULT_PERMISSIONS } from '@/components/users/permissionsDefaults';
export const OFFICE_PROFILES: Record<string,{label:string;permissions:Partial<StaffPermissions>}> = {
 tecnico:{label:'Ufficio tecnico',permissions:{can_view_orders:true,can_edit_orders:true,can_view_giornale_lavori:true,can_view_calendar:true,can_view_order_payment_status:true}},
 ordini:{label:'Ufficio ordini e acquisti',permissions:{can_view_orders:true,can_edit_orders:true,can_view_costs:true,can_manage_purchasing:true,can_view_warehouse:true,can_manage_suppliers:true}},
 amministrazione:{label:'Ufficio amministrazione',permissions:{can_view_orders:true,can_view_order_amounts:true,can_view_costs:true,can_view_billing:true,can_view_scadenzario:true,can_view_prima_nota:true}},
 responsabile:{label:'Responsabile commesse',permissions:{can_view_orders:true,can_edit_orders:true,can_view_order_amounts:true,can_view_costs:true,can_view_margins:true,can_view_giornale_lavori:true,can_view_calendar:true}},
 hr:{label:'Personale e HR',permissions:{can_view_orders:true,can_view_employees:true,can_view_persone:true,can_view_costs:true}},
 commerciale:{label:'Commerciale CRM',permissions:{can_view_marketing_contacts:true,can_view_marketing_opportunities:true,can_view_marketing_activities:true,can_view_marketing_appointments:true,can_view_preventivi:true,can_view_order_amounts:true,only_assigned:true}},
};
/** A named starting configuration; the saved granular flags remain authoritative. */
export function applyOfficeProfile(current:StaffPermissions,id:string):StaffPermissions {
 const profile=OFFICE_PROFILES[id];if(!profile)return current;
 return {...DEFAULT_PERMISSIONS,can_view_order_amounts:false,only_assigned:current.only_assigned,only_my_warehouse:current.only_my_warehouse,pipeline_visibili:current.pipeline_visibili,visible_areas:current.visible_areas,sola_lettura:current.sola_lettura,permessi_dettagliati:true,office_profile:id,...profile.permissions};
}
