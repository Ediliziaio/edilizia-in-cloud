import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";

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

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);
const PLATFORM_ROOT_DOMAINS = ["ediliziaincloud.com", "ediliziaincloud.it"];
const RESERVED_PLATFORM_SUBDOMAINS = new Set(["www", "app", "admin", "clienti", "lavori", "commercialista", "referral"]);
const BLOCKED_CUSTOM_DOMAIN_ROOTS = ["ediliziaincloud.com", "ediliziaincloud.it", "supabase.co", "supabase.com"];
const DOMAIN_LABEL_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function getHostnameParts(hostname: string): string[] {
  return hostname.toLowerCase().replace(/\.$/, "").split(".").filter(Boolean);
}

function isIpAddress(hostname: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.includes(":");
}

function getPlatformRoot(hostname: string): string | null {
  return PLATFORM_ROOT_DOMAINS.find((root) => hostname === root || hostname.endsWith(`.${root}`)) ?? null;
}

function getPlatformSubdomain(hostname: string): string | null {
  const root = getPlatformRoot(hostname);
  if (!root || hostname === root) return null;
  const sub = hostname.slice(0, -(root.length + 1)).split(".")[0]?.toLowerCase();
  if (!sub || RESERVED_PLATFORM_SUBDOMAINS.has(sub)) return null;
  return sub;
}

function canResolveBrandingForHostname(hostname: string): boolean {
  if (!hostname || LOCAL_HOSTNAMES.has(hostname) || isIpAddress(hostname)) return false;
  if (hostname.includes("supabase.co") || hostname.includes("supabase.in")) return false;
  return true;
}

export function normalizeCustomDomainInput(input: string): string {
  const raw = input.trim().toLowerCase();
  if (!raw) return "";
  const withProtocol = raw.includes("://") ? raw : `https://${raw}`;
  try {
    return new URL(withProtocol).hostname.replace(/\.$/, "");
  } catch {
    return raw.split("/")[0].split(":")[0].replace(/\.$/, "");
  }
}

export function isValidCustomDomain(input: string): boolean {
  const hostname = normalizeCustomDomainInput(input);
  const parts = getHostnameParts(hostname);
  if (hostname.length > 253 || parts.length < 2) return false;
  if (LOCAL_HOSTNAMES.has(hostname) || isIpAddress(hostname)) return false;
  if (BLOCKED_CUSTOM_DOMAIN_ROOTS.some((root) => hostname === root || hostname.endsWith(`.${root}`))) {
    return false;
  }
  const tld = parts[parts.length - 1] ?? "";
  return parts.every((part) => DOMAIN_LABEL_REGEX.test(part)) && /^[a-z]{2,}$/.test(tld);
}

function invalidateBrandingQueries(qc: ReturnType<typeof useQueryClient>, companyId: string | undefined) {
  qc.invalidateQueries({ queryKey: queryKeys.companyBranding.all });
  qc.invalidateQueries({ queryKey: queryKeys.companyBranding.byCompany(companyId) });
  qc.invalidateQueries({ queryKey: ["wl-branding-tier", companyId] });
}

/** Load branding by hostname for the login page (unauthenticated) */
export function useBrandingByDomain() {
  const hostname = typeof window !== "undefined" ? window.location.hostname.toLowerCase() : "";
  const canResolve = canResolveBrandingForHostname(hostname);

  return useQuery({
    queryKey: ["branding-by-domain", hostname],
    queryFn: async (): Promise<DomainBranding | null> => {
      if (!canResolve) return null;

      // Try custom_domain match first
      const { data: byDomain } = await supabase
        .from("company_branding" as never)
        .select("id, company_id, platform_name, primary_color, login_bg_color, login_logo_url, login_title, login_subtitle, logo_url, favicon_url, custom_domain, custom_domain_verified, custom_domain_cname, custom_domain_verified_at, subdomain, is_active, hide_platform_branding")
        .eq("custom_domain", hostname)
        .eq("custom_domain_verified", true)
        .eq("is_active", true)
        .maybeSingle();

      if (byDomain) return byDomain as unknown as DomainBranding;

      // Try subdomain only on the platform roots, never on arbitrary custom domains.
      const sub = getPlatformSubdomain(hostname);
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
    enabled: canResolve,
    staleTime: 10 * 60 * 1000,
  });
}

/** Save subdomain for a company */
export function useSaveSubdomain(companyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (subdomain: string) => {
      if (!companyId) throw new Error("companyId richiesto");
      const normalized = subdomain.trim().toLowerCase() || null;
      const { error } = await supabase
        .from("company_branding" as never)
        .upsert(
          {
            company_id: companyId,
            subdomain: normalized,
            is_active: true,
            updated_at: new Date().toISOString(),
          } as never,
          { onConflict: "company_id" } as never,
        );
      if (error) throw error;
    },
    onSuccess: () => invalidateBrandingQueries(qc, companyId),
  });
}

/** Request custom domain verification — generates a CNAME target */
export function useRequestDomainVerification(companyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (customDomain: string) => {
      if (!companyId) throw new Error("companyId richiesto");
      const normalized = normalizeCustomDomainInput(customDomain);
      if (!isValidCustomDomain(normalized)) throw new Error("Formato dominio non valido");
      const { data, error } = await supabase.functions.invoke("provision-custom-domain", {
        body: { company_id: companyId, custom_domain: normalized },
      });
      if (error) throw error;
      return data as { success: boolean; cname_target: string; instructions?: string };
    },
    onSuccess: () => invalidateBrandingQueries(qc, companyId),
  });
}

/** Verify custom domain CNAME via edge function */
export function useVerifyCustomDomain(companyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("companyId richiesto");
      const { data, error } = await supabase.functions.invoke("verify-custom-domain", {
        body: { company_id: companyId },
      });
      if (error) throw error;
      return data as { verified: boolean; error?: string };
    },
    onSuccess: () => invalidateBrandingQueries(qc, companyId),
  });
}
