import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Chiavi sensibili (segreti ad alto valore): lette SEMPRE da env-first
 * (Supabase Secrets / Deno.env). Hardening sicurezza: se la env è impostata
 * vince sempre sul DB, così il segreto NON dipende da ciò che è (o viene)
 * scritto in platform_settings. Se la env non è impostata, fallback sul DB
 * per retro-compatibilità.
 */
const ENV_FIRST_KEYS = new Set<string>([
  "stripe_secret_key",
  "stripe_webhook_secret",
]);

/**
 * Reads a single key.
 * - Per le chiavi NON sensibili: platform_settings (DB) first, poi env (retro-compat).
 * - Per le chiavi sensibili (ENV_FIRST_KEYS): env (Supabase Secrets) first, poi DB.
 */
export async function getPlatformSetting(key: string, envFallback?: string): Promise<string> {
  const envName = envFallback || key.toUpperCase();
  const envValue = Deno.env.get(envName) || "";

  // Segreti sensibili: la env (secret store) ha sempre precedenza sul DB.
  if (ENV_FIRST_KEYS.has(key) && envValue) {
    return envValue;
  }

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

  return envValue;
}
