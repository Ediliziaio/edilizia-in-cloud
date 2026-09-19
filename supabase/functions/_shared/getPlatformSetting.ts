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
  // La chiave ElevenLabs paga a consumo: non deve dipendere da cio' che chiunque
  // con accesso a platform_settings potrebbe scrivere. Secret store prima.
  "elevenlabs_api_key",
]);

// deno-lint-ignore no-explicit-any
function clientServizio(): any {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

/**
 * Un'impostazione di piattaforma, senza fallback su env.
 *
 * 19/09/2026 — i segreti (…_key, …_secret, …_token, …_pass) non stanno più in
 * chiaro in platform_settings ma nel Vault: impostazione_piattaforma() li legge
 * da lì, e per le altre chiavi legge la tabella come prima. Se la funzione non
 * risponde (per esempio il database non l'ha ancora) si legge la tabella: è la
 * lettura di prima, e durante il passaggio i valori ci sono ancora.
 * Stringa vuota = non impostata.
 */
export async function leggiImpostazionePiattaforma(chiave: string): Promise<string> {
  try {
    const admin = clientServizio();
    const { data, error } = await admin.rpc("impostazione_piattaforma", { p_chiave: chiave });
    if (!error) return typeof data === "string" ? data : "";
    console.warn(`impostazione_piattaforma("${chiave}") non riuscita, leggo platform_settings:`, error.message);
    const { data: riga } = await admin.from("platform_settings").select("value").eq("key", chiave).maybeSingle();
    return riga?.value ?? "";
  } catch (e) {
    console.warn(`Impostazione "${chiave}" non leggibile:`, e);
    return "";
  }
}

/**
 * Più impostazioni in una chiamata: { chiave: valore } per quelle che hanno un
 * valore. Stessa regola di leggiImpostazionePiattaforma (i segreti dal Vault).
 */
export async function leggiImpostazioniPiattaforma(chiavi: string[]): Promise<Record<string, string>> {
  const valori: Record<string, string> = {};
  if (chiavi.length === 0) return valori;
  try {
    const admin = clientServizio();
    const { data, error } = await admin.rpc("impostazioni_piattaforma", { p_chiavi: chiavi });
    if (!error) {
      for (const r of (data ?? []) as Array<{ chiave: string; valore: string | null }>) {
        if (r.valore != null) valori[r.chiave] = r.valore;
      }
      return valori;
    }
    console.warn("impostazioni_piattaforma non riuscita, leggo platform_settings:", error.message);
    const { data: righe } = await admin.from("platform_settings").select("key, value").in("key", chiavi);
    for (const r of (righe ?? []) as Array<{ key: string; value: string | null }>) {
      if (r.value != null) valori[r.key] = r.value;
    }
  } catch (e) {
    console.warn("Impostazioni di piattaforma non leggibili:", e);
  }
  return valori;
}

/**
 * Reads a single key.
 * - Per le chiavi NON sensibili: platform_settings (DB) first, poi env (retro-compat).
 * - Per le chiavi sensibili (ENV_FIRST_KEYS): env (Supabase Secrets) first, poi DB.
 * I segreti del DB stanno nel Vault: vedi leggiImpostazionePiattaforma.
 */
export async function getPlatformSetting(key: string, envFallback?: string): Promise<string> {
  const envName = envFallback || key.toUpperCase();
  const envValue = Deno.env.get(envName) || "";

  // Segreti sensibili: la env (secret store) ha sempre precedenza sul DB.
  if (ENV_FIRST_KEYS.has(key) && envValue) {
    return envValue;
  }

  const valore = await leggiImpostazionePiattaforma(key);
  if (valore) return valore;

  return envValue;
}
