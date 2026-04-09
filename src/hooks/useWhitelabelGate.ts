/**
 * useWhitelabelGate — Centralizza il gating delle feature white-label
 * in base al tier dell'azienda (none | basic | full | agency).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface WhitelabelTierCapabilities {
  slug: string;
  name: string;
  description: string | null;
  canChangeLogo: boolean;
  canChangeColors: boolean;
  canChangeLoginPage: boolean;
  canCustomDomain: boolean;
  canHidePoweredBy: boolean;
  canCustomEmailBranding: boolean;
  canCustomPdfBranding: boolean;
  canCustomPwa: boolean;
  canCustomCss: boolean;
  canResell: boolean;
  maxCustomDomains: number;
  priceMonthly: number;
}

export interface WhitelabelGate extends WhitelabelTierCapabilities {
  tier: string;
  isLoading: boolean;
  isWhiteLabel: boolean;
}

const NO_CAPABILITIES: WhitelabelTierCapabilities = {
  slug: "none",
  name: "Nessuno",
  description: null,
  canChangeLogo: false,
  canChangeColors: false,
  canChangeLoginPage: false,
  canCustomDomain: false,
  canHidePoweredBy: false,
  canCustomEmailBranding: false,
  canCustomPdfBranding: false,
  canCustomPwa: false,
  canCustomCss: false,
  canResell: false,
  maxCustomDomains: 0,
  priceMonthly: 0,
};

export function useWhitelabelGate(): WhitelabelGate {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  // 1. Legge il tier della company corrente da company_branding
  const { data: brandingTier, isLoading: loadingBranding } = useQuery({
    queryKey: ["wl-branding-tier", companyId],
    queryFn: async () => {
      if (!companyId) return "none";
      const { data } = await (supabase as any)
        .from("company_branding")
        .select("whitelabel_tier")
        .eq("company_id", companyId)
        .maybeSingle();
      return (data?.whitelabel_tier as string) ?? "none";
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000, // 5 minuti
  });

  // 2. Legge le capabilities del tier
  const tier = brandingTier ?? "none";
  const { data: capabilities, isLoading: loadingTiers } = useQuery({
    queryKey: ["wl-tier-capabilities", tier],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("whitelabel_tiers")
        .select("*")
        .eq("slug", tier)
        .maybeSingle();
      if (!data) return NO_CAPABILITIES;
      return {
        slug: data.slug,
        name: data.name,
        description: data.description,
        canChangeLogo: data.can_change_logo ?? false,
        canChangeColors: data.can_change_colors ?? false,
        canChangeLoginPage: data.can_change_login_page ?? false,
        canCustomDomain: data.can_custom_domain ?? false,
        canHidePoweredBy: data.can_hide_powered_by ?? false,
        canCustomEmailBranding: data.can_custom_email_branding ?? false,
        canCustomPdfBranding: data.can_custom_pdf_branding ?? false,
        canCustomPwa: data.can_custom_pwa ?? false,
        canCustomCss: data.can_custom_css ?? false,
        canResell: data.can_resell ?? false,
        maxCustomDomains: data.max_custom_domains ?? 0,
        priceMonthly: data.price_monthly ?? 0,
      } as WhitelabelTierCapabilities;
    },
    enabled: tier !== "none" || !loadingBranding,
    staleTime: 10 * 60 * 1000, // 10 minuti — i tier cambiano raramente
  });

  const resolved = capabilities ?? NO_CAPABILITIES;
  const isLoading = loadingBranding || loadingTiers;

  return {
    tier,
    isLoading,
    isWhiteLabel: tier !== "none",
    ...resolved,
  };
}
