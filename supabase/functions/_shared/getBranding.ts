/**
 * getBrandingForCompany — Helper condiviso per edge functions.
 * Ogni edge function che genera email, PDF o notifiche deve usare questo
 * per ottenere il branding personalizzato della company.
 */

const DEFAULT_LOGO_URL = "https://app.ediliziaincloud.com/edilizia-in-cloud-logo.webp";
const DEFAULT_PLATFORM_NAME = "Edilizia in Cloud";
const DEFAULT_PRIMARY_COLOR = "#F97415";
const DEFAULT_SITE_URL = "https://app.ediliziaincloud.com";

export interface BrandingConfig {
  platformName: string;
  logoUrl: string;
  faviconUrl: string | null;
  primaryColor: string;
  secondaryColor: string | null;
  accentColor: string | null;
  emailHeaderLogo: string;
  emailFooterText: string;
  emailFromName: string;
  documentHeaderHtml: string | null;
  documentFooterHtml: string | null;
  hidePoweredBy: boolean;
  poweredByText: string;
  siteUrl: string;
  pwaName: string;
  pwaShortName: string | null;
  pwaThemeColor: string | null;
}

export async function getBrandingForCompany(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  companyId: string
): Promise<BrandingConfig> {
  const { data } = await supabase
    .from("company_branding")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();

  return {
    platformName: data?.platform_name || DEFAULT_PLATFORM_NAME,
    logoUrl: data?.logo_url || DEFAULT_LOGO_URL,
    faviconUrl: data?.favicon_url || null,
    primaryColor: data?.primary_color || DEFAULT_PRIMARY_COLOR,
    secondaryColor: data?.secondary_color || null,
    accentColor: data?.accent_color || null,
    emailHeaderLogo: data?.email_header_logo_url || DEFAULT_LOGO_URL,
    emailFooterText:
      data?.email_footer_text ||
      `© ${new Date().getFullYear()} ${DEFAULT_PLATFORM_NAME}`,
    emailFromName: data?.email_from_name || DEFAULT_PLATFORM_NAME,
    documentHeaderHtml: data?.document_header_html || null,
    documentFooterHtml: data?.document_footer_html || null,
    hidePoweredBy: data?.hide_platform_branding || false,
    poweredByText: data?.powered_by_text || `Powered by ${DEFAULT_PLATFORM_NAME}`,
    siteUrl: data?.custom_domain
      ? `https://${data.custom_domain}`
      : DEFAULT_SITE_URL,
    pwaName: data?.pwa_name || DEFAULT_PLATFORM_NAME,
    pwaShortName: data?.pwa_short_name || null,
    pwaThemeColor: data?.pwa_theme_color || null,
  };
}
