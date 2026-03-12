import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DomainBranding {
  id: string;
  company_id: string;
  platform_name: string | null;
  primary_color: string | null;
  login_bg_color: string | null;
  login_logo_url: string | null;
  login_title: string | null;
  login_subtitle: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  custom_domain: string | null;
  custom_domain_verified: boolean;
  custom_domain_cname: string | null;
  custom_domain_verified_at: string | null;
  subdomain: string | null;
  is_active: boolean;
  hide_platform_branding: boolean | null;
}

const MAIN_DOMAINS = ["localhost", "lovable.app", "lovable.dev"];

function isCustomHostname(hostname: string): boolean {
  return !MAIN_DOMAINS.some((d) => hostname.includes(d));
}

/** Load branding by hostname for the login page (unauthenticated) */
export function useBrandingByDomain() {
  const hostname = typeof window !== "undefined" ? window.location.hostname : "";
  const isCustom = isCustomHostname(hostname);

  return useQuery({
    queryKey: ["branding-by-domain", hostname],
    queryFn: async (): Promise<DomainBranding | null> => {
      if (!isCustom) return null;

      // Try custom_domain match first
      const { data: byDomain } = await supabase
        .from("company_branding" as never)
        .select("id, company_id, platform_name, primary_color, login_bg_color, login_logo_url, login_title, login_subtitle, logo_url, favicon_url, custom_domain, custom_domain_verified, custom_domain_cname, custom_domain_verified_at, subdomain, is_active, hide_platform_branding")
        .eq("custom_domain", hostname)
        .eq("custom_domain_verified", true)
        .eq("is_active", true)
        .maybeSingle();

      if (byDomain) return byDomain as unknown as DomainBranding;

      // Try subdomain match (first segment of hostname)
      const sub = hostname.split(".")[0];
      if (sub) {
        const { data: bySub } = await supabase
          .from("company_branding" as never)
          .select("id, company_id, platform_name, primary_color, login_bg_color, login_logo_url, login_title, login_subtitle, logo_url, favicon_url, custom_domain, custom_domain_verified, custom_domain_cname, custom_domain_verified_at, subdomain, is_active, hide_platform_branding")
          .eq("subdomain", sub)
          .eq("is_active", true)
          .maybeSingle();

        if (bySub) return bySub as unknown as DomainBranding;
      }

      return null;
    },
    enabled: isCustom,
    staleTime: 10 * 60 * 1000,
  });
}

/** Save subdomain for a company */
export function useSaveSubdomain(companyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (subdomain: string) => {
      if (!companyId) throw new Error("companyId richiesto");
      const { error } = await supabase
        .from("company_branding" as never)
        .update({ subdomain: subdomain || null, updated_at: new Date().toISOString() } as never)
        .eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company-branding"] }),
  });
}

/** Request custom domain verification — generates a CNAME target */
export function useRequestDomainVerification(companyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (customDomain: string) => {
      if (!companyId) throw new Error("companyId richiesto");
      const cnameTarget = `verify-${companyId.slice(0, 8)}.platform-verify.com`;
      const { error } = await supabase
        .from("company_branding" as never)
        .update({
          custom_domain: customDomain,
          custom_domain_cname: cnameTarget,
          custom_domain_verified: false,
          custom_domain_verified_at: null,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("company_id", companyId);
      if (error) throw error;
      return cnameTarget;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company-branding"] }),
  });
}

/** Verify custom domain CNAME via edge function */
export function useVerifyCustomDomain(companyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("verify-custom-domain", {
        body: { company_id: companyId },
      });
      if (error) throw error;
      return data as { verified: boolean; error?: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company-branding"] }),
  });
}
