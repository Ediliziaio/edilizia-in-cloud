import type { StaffPermissions } from "@/components/users/PermissionsDialog";
import { ALL_PERMISSION_SECTIONS, DEFAULT_PERMISSIONS, OPERATIONAL_EDIT_PAIRS, buildStaffPermissionsUpdate } from "@/components/users/permissionsDefaults";
import { OFFICE_PROFILES } from "./officeProfiles";

const names = new Map<string,string>(ALL_PERMISSION_SECTIONS.flatMap(s=>[
  [s.viewKey,s.label] as [string,string],
  ...(s.editKey ? [[s.editKey,`${s.label}: modifica`] as [string,string]] : []),
]));
for(const [view,edit] of OPERATIONAL_EDIT_PAIRS) names.set(edit,`${names.get(view) ?? 'Area operativa'}: modifica`);
Object.entries({can_approve_orders:"Approvazione commesse",can_edit_settings_scontistica:"Scontistica: modifica",can_manage_warehouse_items:"Gestione articoli di magazzino",can_view_messaggi_esterni:"Messaggi esterni",can_view_order_payment_status:"Stato degli incassi",can_view_order_amounts:"Importi di vendita",can_view_marketing:"Accesso generale CRM",can_edit_marketing:"Modifica generale CRM",can_view_marketing_automations:"Automazioni CRM",can_view_settings:"Accesso generale impostazioni",can_edit_settings:"Modifica generale impostazioni",office_profile:"Modello di partenza",only_assigned:"Solo portafoglio CRM assegnato",only_my_warehouse:"Solo magazzini assegnati",permessi_dettagliati:"Visualizzazione e modifica separate",pipeline_visibili:"Pipeline CRM visibili",sola_lettura:"Sola lettura",visible_areas:"Aree visibili"}).forEach(([key,label])=>names.set(key,label));
export function permissionLabel(key:string) {return names.get(key) ?? "Autorizzazione aggiuntiva";}

const derived = new Set(["can_view_marketing","can_edit_marketing","can_view_marketing_automations","can_view_settings","can_edit_settings"]);
export function permissionChanges(before:StaffPermissions, after:StaffPermissions) {
  const old=buildStaffPermissionsUpdate({...DEFAULT_PERMISSIONS,...before});
  const next=buildStaffPermissionsUpdate({...DEFAULT_PERMISSIONS,...after});
  return Object.keys(DEFAULT_PERMISSIONS).filter(key=>{
    if(derived.has(key)) return false;
    const a=old[key as keyof StaffPermissions],b=next[key as keyof StaffPermissions];
    if(Array.isArray(a)||Array.isArray(b)) return JSON.stringify([...(Array.isArray(a)?a:[])].sort())!==JSON.stringify([...(Array.isArray(b)?b:[])].sort());
    return (a??null)!==(b??null);
  }).map(key=>({key,label:permissionLabel(key),before:old[key as keyof StaffPermissions],after:next[key as keyof StaffPermissions]}));
}
export function permissionValue(key:string,value:unknown,pipelines:{id:string;name:string}[]=[]) {
  if(typeof value==="boolean") return ["only_assigned","only_my_warehouse","sola_lettura","permessi_dettagliati"].includes(key) ? (value ? "Attivo" : "Disattivato") : (value ? "Consentito" : "Non consentito");
  if(key==="office_profile") return OFFICE_PROFILES[String(value)]?.label ?? "Personalizzato";
  if(Array.isArray(value)) {
    if(!value.length) return key==="pipeline_visibili" ? "Tutte le pipeline, anche future" : "Tutte le aree";
    return value.map(id=>key==="pipeline_visibili" ? pipelines.find(p=>p.id===id)?.name ?? "Pipeline non disponibile" : String(id)).join(", ");
  }
  return String(value??"Personalizzato");
}
