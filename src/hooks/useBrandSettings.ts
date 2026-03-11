import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";

export interface BrandSettings {
  white_label_enabled: boolean;
  brand_primary_color: string;
  brand_secondary_color: string;
  brand_accent_color: string;
  brand_text_on_primary: string;
  brand_platform_name: string | null;
  brand_favicon_url: string | null;
  brand_login_bg_url: string | null;
  brand_hide_powered_by: boolean;
  logo_url: string | null;
}

export interface EffectiveBrand {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  textOnPrimary: string;
  platformName: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  loginBgUrl: string | null;
  hidePoweredBy: boolean;
  isWhiteLabel: boolean;
}

const DEFAULTS = {
  primaryColor: "#1E40AF",
  secondaryColor: "#3B82F6",
  accentColor: "#DBEAFE",
  textOnPrimary: "#FFFFFF",
};

export function useBrandSettings(companyId?: string) {
  const { effectiveCompany } = useAuth();
  const id = companyId ?? effectiveCompany?.id;
  const queryClient = useQueryClient();

  const { data: brand, isLoading } = useQuery({
    queryKey: queryKeys.branding.settings(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select(
          "white_label_enabled, brand_primary_color, brand_secondary_color, brand_accent_color, brand_text_on_primary, brand_platform_name, brand_favicon_url, brand_login_bg_url, brand_hide_powered_by, logo_url"
        )
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as unknown as BrandSettings;
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });

  const saveBrand = useMutation({
    mutationFn: async (updates: Partial<BrandSettings>) => {
      const { error } = await supabase
        .from("companies")
        .update(updates as never)
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brand-settings", id] });
      queryClient.invalidateQueries({ queryKey: ["company-detail", id] });
    },
  });

  const uploadBrandFile = async (file: File, path: string) => {
    if (!id) throw new Error("No company");
    const filePath = `${id}/${path}`;
    const { error } = await supabase.storage
      .from("white-label-assets")
      .upload(filePath, file, { upsert: true });
    if (error) throw error;
    const { data: urlData } = supabase.storage
      .from("white-label-assets")
      .getPublicUrl(filePath);
    return urlData.publicUrl;
  };

  const effectiveBrand: EffectiveBrand = {
    primaryColor: brand?.white_label_enabled ? (brand.brand_primary_color ?? DEFAULTS.primaryColor) : DEFAULTS.primaryColor,
    secondaryColor: brand?.white_label_enabled ? (brand.brand_secondary_color ?? DEFAULTS.secondaryColor) : DEFAULTS.secondaryColor,
    accentColor: brand?.white_label_enabled ? (brand.brand_accent_color ?? DEFAULTS.accentColor) : DEFAULTS.accentColor,
    textOnPrimary: brand?.white_label_enabled ? (brand.brand_text_on_primary ?? DEFAULTS.textOnPrimary) : DEFAULTS.textOnPrimary,
    platformName: brand?.white_label_enabled ? (brand.brand_platform_name ?? null) : null,
    logoUrl: brand?.logo_url ?? null,
    faviconUrl: brand?.white_label_enabled ? (brand.brand_favicon_url ?? null) : null,
    loginBgUrl: brand?.white_label_enabled ? (brand.brand_login_bg_url ?? null) : null,
    hidePoweredBy: brand?.white_label_enabled ? (brand.brand_hide_powered_by ?? false) : false,
    isWhiteLabel: brand?.white_label_enabled ?? false,
  };

  return { brand, effectiveBrand, saveBrand, uploadBrandFile, isLoading };
}
