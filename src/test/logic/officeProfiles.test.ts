import {describe,it,expect} from 'vitest';
import {OFFICE_PROFILES,applyOfficeProfile} from '@/lib/users/officeProfiles';
import {DEFAULT_PERMISSIONS,buildStaffPermissionsUpdate} from '@/components/users/permissionsDefaults';
describe('Profili ufficio e portafoglio CRM',()=>{
 it.each(['tecnico','ordini','amministrazione','responsabile','hr'])('%s vede le commesse con la propria configurazione',id=>{
 const p=buildStaffPermissionsUpdate(applyOfficeProfile({...DEFAULT_PERMISSIONS,only_assigned:true},id));
 expect(p.can_view_orders).toBe(true);expect(p.only_assigned).toBe(true);expect(p.office_profile).toBe(id);
 });
 it('ordini non eredita venduto, margine o stipendi da un profilo precedente',()=>{
 const p=applyOfficeProfile({...DEFAULT_PERMISSIONS,can_view_margins:true,can_view_employees:true},'ordini');expect(p.can_view_costs).toBe(true);expect(p.can_view_margins).toBe(false);expect(p.can_view_order_amounts).toBe(false);expect(p.can_view_employees).toBe(false);
 });
 it('i preset non sono autorizzazioni implicite',()=>{const p=applyOfficeProfile(DEFAULT_PERMISSIONS,'tecnico');p.can_view_orders=false;expect(buildStaffPermissionsUpdate(p).can_view_orders).toBe(false)});
 it('usa soltanto chiavi salvabili',()=>{for(const p of Object.values(OFFICE_PROFILES))for(const k of Object.keys(p.permissions))expect(k in DEFAULT_PERMISSIONS).toBe(true)});
});
