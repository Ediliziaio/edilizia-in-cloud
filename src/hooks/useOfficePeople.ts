import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";

export function useOfficePeople(companyId?: string) {
  const staff = useCompanyStaffUsers(companyId);
  const employees = useQuery({
    queryKey: ["office-employees", companyId], enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("id,first_name,last_name,user_id,area")
        .eq("company_id",companyId!).eq("is_active",true).neq("area","cantiere");
      if(error) throw error;
      return data ?? [];
    },
  });
  const officeIds = new Set((employees.data ?? []).map(e=>e.user_id).filter(Boolean));
  return {
    people: (staff.data ?? []).filter(p => officeIds.has(p.id) || p.roles?.some(r=>["company_admin","company_staff"].includes(r))).map(p=>({...p, label:`${p.first_name??""} ${p.last_name??""} · ${officeIds.has(p.id)?"Personale collegato":"Utente aziendale"}`.trim()})),
    unlinked: (employees.data ?? []).filter(e=>!e.user_id),
    isLoading: staff.isLoading || employees.isLoading,
    isError: staff.isError || employees.isError,
  };
}
