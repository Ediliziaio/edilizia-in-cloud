import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface OnboardingStep {
  key: string;
  label: string;
  description: string;
  done: boolean;
  href: string;
}

export function useOnboardingProgress() {
  const { effectiveCompany, role } = useAuth();
  const companyId = effectiveCompany?.id;

  return useQuery({
    queryKey: ["onboarding-progress", companyId],
    queryFn: async () => {
      if (!companyId) return { steps: [], pct: 0, completed: 0, total: 0 };

      const [ordersRes, profilesRes, suppliersRes, employeesRes] = await Promise.all([
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("company_id", companyId),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("company_id", companyId),
        supabase.from("suppliers").select("id", { count: "exact", head: true }).eq("company_id", companyId),
        supabase.from("employees").select("id", { count: "exact", head: true }).eq("company_id", companyId),
      ]);

      const hasOrders = (ordersRes.count || 0) > 0;
      const hasMultipleUsers = (profilesRes.count || 0) >= 2;
      const hasSuppliers = (suppliersRes.count || 0) > 0;
      const hasEmployees = (employeesRes.count || 0) > 0;

      // Check company profile completeness
      const company = effectiveCompany as any;
      const hasLogo = !!company?.logo_url;
      const hasAddress = !!(company?.operational_address || company?.legal_address);

      const steps: OnboardingStep[] = [
        {
          key: "profile",
          label: "Completa il profilo aziendale",
          description: "Aggiungi logo, indirizzo e dati fiscali",
          done: hasLogo && hasAddress,
          href: "/azienda/impostazioni/profilo",
        },
        {
          key: "team",
          label: "Invita il tuo team",
          description: "Aggiungi almeno un altro utente",
          done: hasMultipleUsers,
          href: "/azienda/impostazioni/utenti",
        },
        {
          key: "supplier",
          label: "Aggiungi un fornitore",
          description: "Configura i tuoi fornitori principali",
          done: hasSuppliers,
          href: "/azienda/impostazioni/fornitori",
        },
        {
          key: "order",
          label: "Crea la prima commessa",
          description: "Inizia a gestire i tuoi lavori",
          done: hasOrders,
          href: "/azienda/commesse",
        },
        {
          key: "employee",
          label: "Aggiungi un dipendente",
          description: "Gestisci il tuo team operativo",
          done: hasEmployees,
          href: "/azienda/personale",
        },
      ];

      const completed = steps.filter((s) => s.done).length;
      const pct = Math.round((completed / steps.length) * 100);

      return { steps, pct, completed, total: steps.length };
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });
}
