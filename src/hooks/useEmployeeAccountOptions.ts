import { useEffect, useState } from "react";
export interface EmployeeAccountOption { id:string; first_name:string; last_name:string; email:string|null }
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
     const {data,error}=await supabase.from("employees").select("id,first_name,last_name,email")
      .eq("company_id",companyId).eq("is_active",true).is("user_id",null).is("portal_user_id",null)
      .order("id").range(offset,offset+499);
     if(error)throw error;
     rows.push(...(data??[]));if(!data||data.length<500)break;
    }
    if(!cancelled)setOptions(rows);
   }catch{if(!cancelled)setError(true);}
   finally{if(!cancelled)setLoading(false);}
  })();
  return()=>{cancelled=true;};
 },[open,companyId]);
 return {options,loading,error};
}
