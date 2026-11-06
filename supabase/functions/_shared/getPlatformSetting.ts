import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  ATTESE_RITENTATIVO_MS,
  eChiaveSegreta,
  eErroreTransitorio,
  type EsitoImpostazione,
} from "./segretiPiattaforma.ts";

export { eChiaveSegreta };
export type { EsitoImpostazione };

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

const dormi = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Legge un'impostazione dicendo anche SE l'ha letta: `letturaRiuscita: false`
 * vuol dire «non lo so», non «non è impostata».
 *
 * Serve perché il 06/11/2026 `openwa-webhook` ha rifiutato 25 webhook WhatsApp
 * in ingresso con «openwa_webhook_secret non configurato», mentre il segreto
 * c'era (64 caratteri nel Vault). La RPC era fallita per motivi transitori —
 * 17 volte PostgREST ha risposto una pagina HTML di errore, 8 volte «Could not
 * query the database for the schema cache» — il ripiego sulla tabella ha letto
 * la riga vuota del segreto, e un intoppo di un istante è diventato un 401:
 * al mittente «messaggio rifiutato», per sempre, invece di «riprova».
 */
export async function leggiImpostazionePiattaformaEsito(chiave: string): Promise<EsitoImpostazione> {
  const segreta = eChiaveSegreta(chiave);
  let ultimoErrore = "";
  try {
    const admin = clientServizio();
    for (let tentativo = 0; ; tentativo++) {
      const { data, error } = await admin.rpc("impostazione_piattaforma", { p_chiave: chiave });
      if (!error) {
        return { valore: typeof data === "string" ? data : "", letturaRiuscita: true, errore: null };
      }
      ultimoErrore = error.message ?? String(error);
      if (tentativo >= ATTESE_RITENTATIVO_MS.length || !eErroreTransitorio(ultimoErrore)) break;
      await dormi(ATTESE_RITENTATIVO_MS[tentativo]);
    }

    // Per una chiave segreta la tabella è vuota per costruzione: non la si
    // interroga, perché la sua risposta non significherebbe niente.
    if (segreta) {
      console.error(
        `impostazione_piattaforma("${chiave}") non riuscita e la chiave è segreta: non è leggibile dalla tabella. Ultimo errore: ${ultimoErrore}`,
      );
      return { valore: "", letturaRiuscita: false, errore: ultimoErrore };
    }
    console.warn(`impostazione_piattaforma("${chiave}") non riuscita, leggo platform_settings: ${ultimoErrore}`);
    const { data: riga, error: erroreTabella } = await admin
      .from("platform_settings")
      .select("value")
      .eq("key", chiave)
      .maybeSingle();
    if (erroreTabella) {
      return { valore: "", letturaRiuscita: false, errore: erroreTabella.message ?? ultimoErrore };
    }
    return { valore: riga?.value ?? "", letturaRiuscita: true, errore: null };
  } catch (e) {
    const messaggio = e instanceof Error ? e.message : String(e);
    console.warn(`Impostazione "${chiave}" non leggibile:`, messaggio);
    return { valore: "", letturaRiuscita: false, errore: messaggio };
  }
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
  return (await leggiImpostazionePiattaformaEsito(chiave)).valore;
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
