import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
export interface OrderContractLink {id:string; workflow_kind:"commessa"|"contratto"|"intervento"; parent_contract_id:string|null; intervention_reference:string|null;order_code:string|null}
export function useOrderContractLink(orderId?:string) {
 const {effectiveCompany}=useAuth(); const companyId=effectiveCompany?.id;
 return useQuery({queryKey:["order-contract-link",companyId,orderId],enabled:!!companyId&&!!orderId,queryFn:async():Promise<OrderContractLink>=>{
   const {data,error}=await (supabase as any).from("orders").select("id,workflow_kind,parent_contract_id,intervention_reference,order_code").eq("id",orderId!).eq("company_id",companyId!).single();
   if(error)throw error; return data;
 }});
}
