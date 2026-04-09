/**
 * pwa-manifest — Genera un manifest.json dinamico per PWA white-label.
 * Query param: ?company_id=xxx oppure rileva dal custom domain (Host header).
 * Se nessun branding custom → restituisce il manifest di default.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getBrandingForCompany } from "../_shared/getBranding.ts";

const DEFAULT_MANIFEST = {
  name: "Area Campo — Edilizia in Cloud",
  short_name: "Campo",
  description: "App cantiere per operai e subappaltatori",
  start_url: "/campo",
  display: "standalone",
  orientation: "portrait",
  background_color: "#020617",
  theme_color: "#f59e0b",
  icons: [
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
  ],
  categories: ["business", "productivity"],
  lang: "it",
};

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const companyId = url.searchParams.get("company_id");
  const host = req.headers.get("Host") ?? "";

  const headers: Record<string, string> = {
    "Content-Type": "application/manifest+json",
    "Cache-Control": "public, max-age=3600",
    "Access-Control-Allow-Origin": "*",
  };

  // Se nessun company_id e nessun custom domain → default
  if (!companyId && !host) {
    return new Response(JSON.stringify(DEFAULT_MANIFEST, null, 2), { headers });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let resolvedCompanyId = companyId;

    // Se non c'è company_id, prova a risolverlo dal custom domain
    if (!resolvedCompanyId && host) {
      const hostname = host.split(":")[0];
      const { data } = await supabase
        .from("company_branding")
        .select("company_id")
        .eq("custom_domain", hostname)
        .eq("custom_domain_verified", true)
        .maybeSingle();
      resolvedCompanyId = data?.company_id ?? null;
    }

    if (!resolvedCompanyId) {
      return new Response(JSON.stringify(DEFAULT_MANIFEST, null, 2), { headers });
    }

    const branding = await getBrandingForCompany(supabase, resolvedCompanyId);

    const manifest = {
      name: branding.pwaName || branding.platformName,
      short_name: branding.pwaShortName || branding.platformName.substring(0, 12),
      description: `App gestionale — ${branding.platformName}`,
      start_url: "/campo",
      display: "standalone",
      orientation: "portrait",
      background_color: branding.pwaThemeColor || "#020617",
      theme_color: branding.pwaThemeColor || branding.primaryColor,
      icons: [
        ...(branding.faviconUrl
          ? [{ src: branding.faviconUrl, sizes: "192x192", type: "image/png", purpose: "any maskable" }]
          : [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" }]),
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
      ],
      categories: ["business", "productivity"],
      lang: "it",
    };

    return new Response(JSON.stringify(manifest, null, 2), { headers });
  } catch (err) {
    console.error("pwa-manifest error:", err);
    return new Response(JSON.stringify(DEFAULT_MANIFEST, null, 2), { headers });
  }
});
