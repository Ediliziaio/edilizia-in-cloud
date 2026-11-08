import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import {DbMinimo,denoFinto} from '../helpers/edgeFinto';
const rt=vi.hoisted(()=>({db:null as unknown as DbMinimo,create:vi.fn(),mail:vi.fn()}));
vi.mock('https://esm.sh/@supabase/supabase-js@2',()=>({createClient:()=>rt.db}));
vi.mock('../../../supabase/functions/_shared/auth.ts',()=>({requireAuth:async()=>({userId:'actor',supabaseAdmin:rt.db}),requireRole:async()=>{},requireCompanyAccess:async()=>({})}));
vi.mock('../../../supabase/functions/_shared/amministraAzienda.ts',()=>({richiediAmministratoreAzienda:async()=>{}}));
vi.mock('../../../supabase/functions/_shared/sendEmailUnified.ts',()=>({sendEmailUnified:()=>rt.mail()}));
vi.mock('../../../supabase/functions/_shared/getBranding.ts',()=>({getBrandingForCompany:async()=>({siteUrl:'https://example.invalid'})}));
beforeEach(()=>{vi.resetModules();rt.db=new DbMinimo();rt.create.mockReset().mockResolvedValue({data:{user:{id:'portal-user'}},error:null});rt.mail.mockReset();rt.db.tabelle.companies=[{id:'a',name:'A',customer_portal_enabled:false}];rt.db.tabelle.marketing_contacts=[{id:'contact',company_id:'a',customer_profile_id:null}];Object.assign(rt.db,{auth:{admin:{createUser:rt.create,deleteUser:vi.fn()}}});});
afterEach(()=>vi.unstubAllGlobals());
async function converti(){const d=denoFinto();vi.stubGlobal('Deno',d.finto);const file='../../../supabase/functions/convert-contact-to-customer/index.ts';await import(/* @vite-ignore */file);const response=await d.gestore()!(new Request('https://example.invalid',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contact_id:'contact',company_id:'a',first_name:'Mario',last_name:'Rossi',email:'mario@example.invalid'})}));return {status:response.status,data:await response.json()};}
describe('Conversione contatto senza portale',()=>{
 it('conserva anagrafica e collegamento senza creare Auth, password o inviare email',async()=>{const r=await converti();expect(r.status).toBe(200);expect(r.data.portal_account_created).toBe(false);expect(r.data.password).toBeNull();expect(rt.create).not.toHaveBeenCalled();expect(rt.mail).not.toHaveBeenCalled();expect(rt.db.tabelle.profiles[0]).toMatchObject({id:r.data.customer_id,email:'mario@example.invalid',is_blocked:true,portal_disabled:true});expect(rt.db.tabelle.marketing_contacts[0].customer_profile_id).toBe(r.data.customer_id);});
 it('crea il login solo se il portale è attivo',async()=>{rt.db.tabelle.companies[0].customer_portal_enabled=true;const r=await converti();expect(r.status).toBe(200);expect(rt.create).toHaveBeenCalledOnce();expect(r.data.customer_id).toBe('portal-user');expect(rt.mail).toHaveBeenCalledOnce();});
});
