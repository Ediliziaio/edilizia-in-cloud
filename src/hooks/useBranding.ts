import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";

export interface CompanyBranding {
  id: string;
  company_id: string;
  logo_url: string | null;
  favicon_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  sidebar_bg_color: string | null;
  sidebar_text_color: string | null;
  login_bg_color: string | null;
  login_logo_url: string | null;
  login_title: string | null;
  login_subtitle: string | null;
  custom_domain: string | null;
  email_header_logo_url: string | null;
  email_footer_text: string | null;
  hide_platform_branding: boolean;
  created_at: string;
  updated_at: string;
}

export function useBranding() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const query = useQuery({
    queryKey: ["company-branding", companyId],
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

  // Apply CSS custom properties when branding changes
  useEffect(() => {
    const branding = query.data;
    const root = document.documentElement;

    if (!branding) {
      // Reset custom branding vars
      root.style.removeProperty("--brand-primary");
      root.style.removeProperty("--brand-secondary");
      root.style.removeProperty("--brand-accent");
      root.style.removeProperty("--brand-sidebar-bg");
      root.style.removeProperty("--brand-sidebar-text");
      return;
    }

    if (branding.primary_color) {
      root.style.setProperty("--brand-primary", branding.primary_color);
    }
    if (branding.secondary_color) {
      root.style.setProperty("--brand-secondary", branding.secondary_color);
    }
    if (branding.accent_color) {
      root.style.setProperty("--brand-accent", branding.accent_color);
    }
    if (branding.sidebar_bg_color) {
      root.style.setProperty("--brand-sidebar-bg", branding.sidebar_bg_color);
    }
    if (branding.sidebar_text_color) {
      root.style.setProperty("--brand-sidebar-text", branding.sidebar_text_color);
    }

    // Update favicon
    if (branding.favicon_url) {
      const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
      if (link) {
        link.href = branding.favicon_url;
      }
    }

    return () => {
      root.style.removeProperty("--brand-primary");
      root.style.removeProperty("--brand-secondary");
      root.style.removeProperty("--brand-accent");
      root.style.removeProperty("--brand-sidebar-bg");
      root.style.removeProperty("--brand-sidebar-text");
    };
  }, [query.data]);

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
