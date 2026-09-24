/**
 * Esportazioni del CRM (24/09/2026): chi può farle, e il registro di chi le fa.
 *
 * «Esporta Clienti» (staff_permissions.can_export_clients) c'era nella
 * schermata dei permessi, ma nessun bottone lo guardava: contatti,
 * opportunità, clienti e i loro sottoinsiemi si scaricavano dal browser senza
 * lasciare traccia nel database. A BeMade un operatore del call center senza
 * il permesso poteva portarsi via tutti i contatti e tutte le opportunità
 * dell'azienda.
 *
 * Adesso, in ogni punto che consegna un file con righe di persone del CRM:
 *  1. il bottone c'è solo con `permissions.canExportClients` (gli
 *     amministratori ce l'hanno sempre);
 *  2. lette le righe e PRIMA di consegnare il file si chiama
 *     `registraEsportazioneCrm`: il database ricontrolla il permesso
 *     sull'azienda e scrive `crm_exported` in user_audit_log con chi, cosa,
 *     formato, quante righe e con quali filtri. Se rifiuta o non risponde, il
 *     file non parte.
 *
 * Il registro si legge nella scheda dell'utente (Log Attività) e in
 * Impostazioni → Sicurezza → Audit Log. Quali esportazioni passano di qui lo
 * tiene fermo src/test/security/esportazioniCrm.test.ts.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { userErrorMessage } from "@/lib/userErrorMessage";

/** Cosa si esporta: gli stessi valori che accetta il database. */
export type OggettoEsportazioneCrm =
  | "contatti"
  | "opportunita"
  | "clienti"
  | "contatti_sms"
  | "destinatari_campagna"
  | "opportunita_ferme"
  | "lead_migliori"
  | "archivio_azienda";

export type FormatoEsportazioneCrm = "csv" | "xlsx" | "pdf" | "zip";

export const ETICHETTE_OGGETTO_ESPORTATO: Record<OggettoEsportazioneCrm, string> = {
  contatti: "Contatti",
  opportunita: "Opportunità",
  clienti: "Clienti",
  contatti_sms: "Contatti SMS",
  destinatari_campagna: "Destinatari di una campagna email",
  opportunita_ferme: "Opportunità ferme",
  lead_migliori: "Lead migliori",
  archivio_azienda: "Archivio completo dell'azienda",
};

export interface EsportazioneCrm {
  companyId: string;
  oggetto: OggettoEsportazioneCrm;
  formato: FormatoEsportazioneCrm;
  righe: number;
  /** Come sono state scelte le righe: finisce nel registro. */
  filtri?: Record<string, unknown>;
}

/** Il database non ha registrato l'esportazione: il file non va consegnato. */
export class EsportazioneNonRegistrata extends Error {
  readonly codice?: string;

  constructor(messaggio: string, codice?: string) {
    super(messaggio);
    this.name = "EsportazioneNonRegistrata";
    this.codice = codice;
  }
}

function vuoto(valore: unknown): boolean {
  if (valore === null || valore === undefined || valore === "" || valore === false) return true;
  if (Array.isArray(valore)) return valore.length === 0;
  if (typeof valore === "object") return Object.keys(valore as object).length === 0;
  return false;
}

/**
 * Solo i filtri accesi: il registro dice cosa è uscito senza elencare tutto
 * quello che era spento. Via null, stringhe vuote, false, liste e oggetti vuoti.
 */
export function filtriAttivi(filtri: Record<string, unknown> | undefined): Record<string, Json> {
  const attivi: Record<string, Json> = {};
  for (const [chiave, valore] of Object.entries(filtri ?? {})) {
    const pulito =
      valore && typeof valore === "object" && !Array.isArray(valore)
        ? filtriAttivi(valore as Record<string, unknown>)
        : valore;
    if (!vuoto(pulito)) attivi[chiave] = pulito as Json;
  }
  return attivi;
}

/**
 * Da chiamare dopo aver letto le righe e prima di consegnare il file. Lancia
 * `EsportazioneNonRegistrata` se il database rifiuta (niente «Esporta
 * Clienti» in quell'azienda) o non risponde: chi chiama non consegna il file.
 */
export async function registraEsportazioneCrm(esportazione: EsportazioneCrm): Promise<void> {
  const { error } = await supabase.rpc("registra_esportazione_crm", {
    p_company_id: esportazione.companyId,
    p_oggetto: esportazione.oggetto,
    p_formato: esportazione.formato,
    p_righe: Math.max(0, Math.round(esportazione.righe)),
    p_filtri: filtriAttivi(esportazione.filtri),
  });
  if (error) throw new EsportazioneNonRegistrata(error.message, error.code);
}

function valoreLeggibile(valore: unknown): string {
  if (Array.isArray(valore)) return valore.map(valoreLeggibile).join(", ");
  if (valore && typeof valore === "object") {
    const voci = Object.entries(valore as Record<string, unknown>);
    if (voci.every(([, v]) => v === null || typeof v !== "object")) {
      return voci.map(([k, v]) => `${k} ${String(v)}`).join(", ");
    }
    return JSON.stringify(valore);
  }
  return String(valore);
}

/**
 * Una riga `crm_exported` del registro in parole, per chi la legge:
 * «Contatti · 1.234 righe · XLSX · ricerca: rossi · perimetro: tutta l'azienda».
 */
export function descriviEsportazioneCrm(dettagli: unknown): string {
  const d = (dettagli && typeof dettagli === "object" ? dettagli : {}) as {
    oggetto?: string;
    formato?: string;
    righe?: number;
    filtri?: Record<string, unknown>;
  };
  const cosa = ETICHETTE_OGGETTO_ESPORTATO[d.oggetto as OggettoEsportazioneCrm] ?? d.oggetto ?? "Esportazione";
  const righe = typeof d.righe === "number"
    ? `${d.righe.toLocaleString("it-IT")} ${d.righe === 1 ? "riga" : "righe"}`
    : null;
  const filtri = Object.entries(d.filtri ?? {}).map(([k, v]) => `${k.replace(/_/g, " ")}: ${valoreLeggibile(v)}`);
  return [cosa, righe, d.formato?.toUpperCase(), ...filtri].filter(Boolean).join(" · ");
}

/** Il messaggio per l'utente quando un'esportazione non parte. */
export function messaggioEsportazioneNonRiuscita(errore: unknown): string {
  if (errore instanceof EsportazioneNonRegistrata) {
    if (errore.codice === "42501") {
      return "Non hai il permesso «Esporta Clienti»: chiedilo a un amministratore.";
    }
    return userErrorMessage(errore, "Esportazione non registrata, file non scaricato. Riprova tra qualche secondo.");
  }
  return userErrorMessage(errore, "Errore durante l'esportazione");
}
