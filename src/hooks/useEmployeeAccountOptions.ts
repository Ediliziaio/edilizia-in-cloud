import { useEffect, useState } from "react";
export interface EmployeeAccountOption { id:string; first_name:string; last_name:string; email:string|null; mansione?:string|null }
/** No salary or personal documents are requested to link an app login. */
export function useEmployeeAccountOptions(open:boolean,companyId?:string) {
 const [options,setOptions]=useState<EmployeeAccountOption[]>([]);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState(false);
 useEffect(()=>{
  let cancelled=false;
  setOptions([]);setError(false);setLoading(Boolean(open&&companyId));
  if(!open||!companyId)return;
  void(async()=>{
   try {
    const {supabase}=await import("@/integrations/supabase/client");
    const rows:EmployeeAccountOption[]=[];
    for(let offset=0;;offset+=500){
     if(cancelled)return;
     const {data,error}=await supabase.from("employees").select("id,first_name,last_name,email,hr_profili!hr_profili_employee_id_fkey(nome,cognome,email,mansione,attivo,user_id)")
      .eq("company_id",companyId).eq("is_active",true).is("user_id",null).is("portal_user_id",null)
      .order("id").range(offset,offset+499);
     if(error)throw error;
     for (const employee of data ?? []) {
       const profiles = Array.isArray(employee.hr_profili) ? employee.hr_profili : employee.hr_profili ? [employee.hr_profili] : [];
       const profile = profiles[0];
       if (profiles.length > 1 || (profile && (!profile.attivo || profile.user_id))) continue;
       rows.push({
         id: employee.id, first_name: profile?.nome || employee.first_name,
         last_name: profile?.cognome || employee.last_name,
         email: profile?.email || employee.email, mansione: profile?.mansione,
       });
     }
     if(!data||data.length<500)break;
    }
    if(!cancelled)setOptions(rows.sort((a,b) => a.last_name.localeCompare(b.last_name, "it") || a.first_name.localeCompare(b.first_name, "it")));
   }catch{if(!cancelled)setError(true);}
   finally{if(!cancelled)setLoading(false);}
  })();
  return()=>{cancelled=true;};
 },[open,companyId]);
 return {options,loading,error};
}
