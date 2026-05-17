/**
 * QuoteBuilder — helpers
 * Estratto da QuoteBuilder.tsx (MP-MKT-001).
 */
import { supabase } from "@/integrations/supabase/client";

/**
 * Risolve un path di asset template (logo, immagine cover ecc.) a URL pubblico.
 *
 * Gestisce 3 casi:
 *  1. URL già completo (http(s)://...) → ritorna invariato
 *  2. Path con prefisso bucket noto (`quote-template-assets/...`,
 *     `company-assets/...`) → usa quel bucket
 *  3. Path senza prefisso → assume bucket `quote-template-assets`
 */
export const templateAssetUrl = (path?: string | null) => {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  const clean = path.replace(/^\/+/, "");
  const [maybeBucket, ...rest] = clean.split("/");
  if ((maybeBucket === "quote-template-assets" || maybeBucket === "company-assets") && rest.length > 0) {
    return supabase.storage.from(maybeBucket).getPublicUrl(rest.join("/")).data.publicUrl;
  }
  return supabase.storage.from("quote-template-assets").getPublicUrl(clean).data.publicUrl;
};
