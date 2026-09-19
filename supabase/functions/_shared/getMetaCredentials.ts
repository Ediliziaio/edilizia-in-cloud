import { leggiImpostazioniPiattaforma } from "./getPlatformSetting.ts";

/**
 * Reads META_APP_ID and META_APP_SECRET from platform_settings (DB) first,
 * falling back to Deno.env if not found. Ensures backward compatibility.
 * Dal 19/09/2026 il segreto sta nel Vault: lo legge leggiImpostazioniPiattaforma.
 */
export async function getMetaCredentials(): Promise<{ metaAppId: string; metaAppSecret: string }> {
  const valori = await leggiImpostazioniPiattaforma(["meta_app_id", "meta_app_secret"]);
  const metaAppId = valori.meta_app_id || Deno.env.get("META_APP_ID") || "";
  const metaAppSecret = valori.meta_app_secret || Deno.env.get("META_APP_SECRET") || "";
  return { metaAppId, metaAppSecret };
}
