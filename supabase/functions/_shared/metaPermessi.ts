/**
 * Permessi Meta chiesti nel collegamento (meta-oauth-start), divisi per gruppo.
 *
 * Un permesso chiesto nel login ma non ancora aggiunto all'app su Meta fa
 * fallire il collegamento per TUTTE le aziende, lead compresi. Per questo ogni
 * gruppo si accende da solo, con platform_settings.meta_permessi_modalita
 * (JSON, es. {"post":"revisione","statistiche":"spento"}):
 *  - "spento"    → non chiesto;
 *  - "revisione" → chiesto solo dal super admin (ruolo sull'app), per le prove
 *                  e i video della App Review;
 *  - "attivo"    → chiesto a tutti, dopo l'approvazione di Meta.
 * I messaggi leggono ancora meta_messaggi_attivi se nel JSON non ci sono.
 */
import { leggiModalita, type ModalitaMessaggiSocial } from "./socialMessaggiMeta.ts";

export type Modalita = ModalitaMessaggiSocial;
export type GruppoAttivabile = "sponsorizzate" | "messaggi" | "post" | "statistiche";

export const PERMESSI_BASE = [
  "pages_show_list",
  "pages_read_engagement",
  // Senza pages_manage_metadata l'iscrizione della pagina al webhook
  // (POST /{page}/subscribed_apps) NON è effettiva: Meta risponde success ma
  // non consegna gli eventi → lead solo via backfill.
  "pages_manage_metadata",
  "leads_retrieval",
  "pages_manage_ads",
  "ads_read",
  "business_management",
];

export const PERMESSI_GRUPPO: Record<GruppoAttivabile, string[]> = {
  // Creare, modificare e mettere in pausa campagne (approvato il 28/07/2026).
  sponsorizzate: ["ads_management"],
  messaggi: ["pages_messaging", "instagram_basic", "instagram_manage_messages"],
  post: ["pages_manage_posts", "instagram_basic", "instagram_content_publish"],
  statistiche: ["read_insights", "instagram_basic", "instagram_manage_insights"],
};

export const CHIAVE_MODALITA = "meta_permessi_modalita";

/** Default: acceso solo ciò che Meta ha già approvato. */
export const MODALITA_PREDEFINITE: Record<GruppoAttivabile, Modalita> = {
  sponsorizzate: "attivo",
  messaggi: "spento",
  post: "spento",
  statistiche: "spento",
};

export function leggiModalitaGruppi(
  valoreJson: unknown,
  valoreMessaggiVecchio?: unknown,
): Record<GruppoAttivabile, Modalita> {
  let oggetto: Record<string, unknown> = {};
  if (typeof valoreJson === "string" && valoreJson.trim()) {
    try {
      const parsed = JSON.parse(valoreJson);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) oggetto = parsed as Record<string, unknown>;
    } catch {
      oggetto = {};
    }
  } else if (valoreJson && typeof valoreJson === "object" && !Array.isArray(valoreJson)) {
    oggetto = valoreJson as Record<string, unknown>;
  }
  const esito = { ...MODALITA_PREDEFINITE };
  for (const g of Object.keys(PERMESSI_GRUPPO) as GruppoAttivabile[]) {
    if (oggetto[g] != null) esito[g] = leggiModalita(oggetto[g]);
  }
  if (oggetto.messaggi == null && valoreMessaggiVecchio != null) {
    esito.messaggi = leggiModalita(valoreMessaggiVecchio);
  }
  return esito;
}

/** Elenco scope per il dialogo OAuth: base + gruppi accesi (senza doppioni). */
export function scopeRichiesti(modalita: Record<GruppoAttivabile, Modalita>, isSuperAdmin: boolean): string[] {
  const scope = new Set(PERMESSI_BASE);
  for (const g of Object.keys(PERMESSI_GRUPPO) as GruppoAttivabile[]) {
    const m = modalita[g];
    if (m === "attivo" || (m === "revisione" && isSuperAdmin)) {
      for (const p of PERMESSI_GRUPPO[g]) scope.add(p);
    }
  }
  return [...scope];
}

// deno-lint-ignore no-explicit-any
export async function modalitaPermessiMeta(admin: any): Promise<Record<GruppoAttivabile, Modalita>> {
  try {
    const { data } = await admin.from("platform_settings").select("key, value")
      .in("key", [CHIAVE_MODALITA, "meta_messaggi_attivi"]);
    const righe = (data ?? []) as { key: string; value: unknown }[];
    const json = righe.find((r) => r.key === CHIAVE_MODALITA)?.value;
    const vecchio = righe.find((r) => r.key === "meta_messaggi_attivi")?.value;
    return leggiModalitaGruppi(json, vecchio);
  } catch {
    return { ...MODALITA_PREDEFINITE };
  }
}

/** Da una risposta di GET /me/permissions: i permessi con status "granted". */
export function estraiPermessiConcessi(risposta: unknown): string[] {
  const dati = (risposta as { data?: unknown } | null)?.data;
  if (!Array.isArray(dati)) return [];
  return dati
    .filter((p) => (p as { status?: string })?.status === "granted" && typeof (p as { permission?: unknown }).permission === "string")
    .map((p) => (p as { permission: string }).permission);
}
