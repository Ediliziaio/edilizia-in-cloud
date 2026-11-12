import { describe, expect, it } from "vitest";
import { DEFAULT_PERMISSIONS } from "@/components/users/permissionsDefaults";
import { permissionChanges, permissionLabel } from "@/lib/users/permissionChanges";
import { applyOfficeProfile } from "@/lib/users/officeProfiles";
describe("confronto delle autorizzazioni da salvare",()=>{
 it("ogni permesso configurabile ha un nome leggibile nel confronto",()=>{
  for(const key of Object.keys(DEFAULT_PERMISSIONS)) expect(permissionLabel(key),key).not.toBe("Autorizzazione aggiuntiva");
 });
 it("mostra la revoca delle modifiche ereditate e non i flag aggregati ridondanti",()=>{
  const before={...DEFAULT_PERMISSIONS,can_view_orders:true,permessi_dettagliati:false};
  const changes=permissionChanges(before,{...before,sola_lettura:true});
  expect(changes).toEqual(expect.arrayContaining([expect.objectContaining({key:"can_edit_orders",before:true,after:false})]));
  expect(changes.some(c=>c.key==="can_edit_marketing" || c.key==="can_view_settings")).toBe(false);
 });
 it("un cambio di modello lascia traccia anche se i diritti risultano identici",()=>{
  const before=applyOfficeProfile(DEFAULT_PERMISSIONS,"tecnico");
  expect(permissionChanges(before,{...before,office_profile:null})).toEqual([expect.objectContaining({key:"office_profile"})]);
 });
});
