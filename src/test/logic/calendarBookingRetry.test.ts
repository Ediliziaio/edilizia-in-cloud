import {it,expect,vi} from 'vitest';
import {prenotaSuCalendario} from '../../../supabase/functions/_shared/calendarioPrenotazione';
const mirror=vi.hoisted(()=>vi.fn());
vi.mock('../../../supabase/functions/_shared/appuntamentiPubblici.ts',async(importOriginal)=>({...await importOriginal<object>(),sincronizzaCalendariEsterni:mirror}));
it('reaches the atomic retry even when its original slot is occupied and preserves end-of-day 24:00',async()=>{
 const rpc=vi.fn(async(name:string,args:unknown)=>{if(name!=='reserve_calendar_booking')throw Error('A preliminary availability read would reject the existing booking');return{data:{id:'existing-appointment',duplicate:true},error:null}});
 const q:any=new Proxy({},{get:(_,method)=>method==='then'?(resolve:unknown)=>Promise.resolve({data:{id:'calendar',company_id:'company',duration_minutes:30,owner_id:'owner'},error:null}).then(resolve as never):()=>q});
 const result=await prenotaSuCalendario({rpc,from:()=>q},{calendarId:'calendar',companyId:'company',dataIso:'2026-12-01',ora:'23:30',contactId:null,opportunityId:null,titolo:'Prova',descrizione:'',requestKey:'queue:stable'});
 expect(result).toMatchObject({ok:true,duplicate:true,appointmentId:'existing-appointment',fine:'24:00'});
 expect(rpc).toHaveBeenCalledWith('reserve_calendar_booking',expect.objectContaining({p_fine:'24:00:00',p_riga:expect.objectContaining({request_key:'queue:stable'})}));
 expect(mirror).not.toHaveBeenCalled();
});
