import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/contexts/AuthContext";

export interface CompanyBranding {
  id: string;
  company_id: string;
  logo_url: string | null;
  favicon_url: string | null;
  platform_name: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  sidebar_bg_color: string | null;
  sidebar_text_color: string | null;
  login_bg_color: string | null;
  login_logo_url: string | null;
  login_title: string | null;
  login_subtitle: string | null;
  subdomain: string | null;
  custom_domain: string | null;
  custom_domain_verified: boolean;
  custom_domain_cname: string | null;
  custom_domain_verified_at: string | null;
  email_header_logo_url: string | null;
  email_footer_text: string | null;
  hide_platform_branding: boolean | null;
  is_active: boolean;
  whitelabel_tier: string;
  custom_css: string | null;
  powered_by_text: string | null;
  created_at: string;
  updated_at: string;
}

export function useBranding() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const query = useQuery({
    queryKey: queryKeys.companyBranding.byCompany(companyId),
    enabled: !!companyId,
    queryFn: async (): Promise<CompanyBranding | null> => {
      const { data, error } = await supabase
        .from("company_branding" as never)
        .select("*")
        .eq("company_id", companyId!)
        .maybeSingle();

      if (error) throw error;
      return data as unknown as CompanyBranding | null;
    },
    staleTime: 5 * 60 * 1000,
  });

  // NOTA: nessun side-effect CSS qui. L'applicazione del tema brand avviene
  // SOLO nei layout via applyBrandTheme (src/lib/brandTheme.ts) — questo hook
  // veniva montato da più componenti e i cleanup concorrenti si cancellavano
  // a vicenda le variabili.

  return {
    branding: query.data ?? null,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

export function useBrandingMutation() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const upsert = async (updates: Partial<CompanyBranding>) => {
    if (!companyId) throw new Error("Nessuna azienda associata");

    const { data: existing } = await supabase
      .from("company_branding" as never)
      .select("id")
      .eq("company_id", companyId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("company_branding" as never)
        .update({ ...updates, updated_at: new Date().toISOString() } as never)
        .eq("company_id", companyId);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("company_branding" as never)
        .insert({ ...updates, company_id: companyId } as never);
      if (error) throw error;
    }
  };

  const uploadBrandingFile = async (file: File, path: string) => {
    if (!companyId) throw new Error("Nessuna azienda associata");
    const filePath = `${companyId}/${path}`;
    
    const { error } = await supabase.storage
      .from("branding")
      .upload(filePath, file, { upsert: true });

    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from("branding")
      .getPublicUrl(filePath);

    return urlData.publicUrl;
  };

  return { upsert, uploadBrandingFile, companyId };
}
