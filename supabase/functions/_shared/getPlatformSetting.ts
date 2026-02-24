import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Reads a single key from platform_settings (DB) first,
 * falling back to Deno.env if not found. Ensures backward compatibility.
 */
export async function getPlatformSetting(key: string, envFallback?: string): Promise<string> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data } = await admin
      .from("platform_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();

    if (data?.value) return data.value;
  } catch (e) {
    console.warn(`Failed to read platform_settings key "${key}", falling back to env:`, e);
  }

  return Deno.env.get(envFallback || key.toUpperCase()) || "";
}
