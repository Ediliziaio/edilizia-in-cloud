import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Reads META_APP_ID and META_APP_SECRET from platform_settings (DB) first,
 * falling back to Deno.env if not found. Ensures backward compatibility.
 */
export async function getMetaCredentials(): Promise<{ metaAppId: string; metaAppSecret: string }> {
  let metaAppId = "";
  let metaAppSecret = "";

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data } = await admin
      .from("platform_settings")
      .select("key, value")
      .in("key", ["meta_app_id", "meta_app_secret"]);

    for (const row of data || []) {
      if (row.key === "meta_app_id" && row.value) metaAppId = row.value;
      if (row.key === "meta_app_secret" && row.value) metaAppSecret = row.value;
    }
  } catch (e) {
    console.warn("Failed to read platform_settings, falling back to env:", e);
  }

  // Fallback to env
  if (!metaAppId) metaAppId = Deno.env.get("META_APP_ID") || "";
  if (!metaAppSecret) metaAppSecret = Deno.env.get("META_APP_SECRET") || "";

  return { metaAppId, metaAppSecret };
}
