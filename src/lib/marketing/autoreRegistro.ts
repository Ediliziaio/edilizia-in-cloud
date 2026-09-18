/**
 * Registro attività: cosa è successo, e soprattutto CHI l'ha fatto.
 *
 * 18/09/2026: nel registro (scheda contatto e popup dell'opportunità) mancava
 * proprio la risposta che serve quando una scheda si muove da sola. Le righe
 * scritte dal sistema restavano senza autore, e i tipi senza traduzione
 * uscivano in inglese («Stage changed»). Ora ogni riga dice «di Venusia
 * BeMade» oppure «dall'automazione «FB - Nuovo»», e i nomi di chi non è più in
 * squadra si leggono lo stesso.
 */

/** Nomi italiani dei tipi di attività registrati (marketing_contact_activities). */
const ETICHETTE: Record<string, string> = {
  created: "Contatto creato",
  contact_created: "Contatto creato",
  updated: "Contatto aggiornato",
  imported: "Importato",
  converted: "Convertito in cliente",
  assigned: "Assegnato",
  contact_assigned: "Contatto assegnato",
  opportunity_created: "Opportunità creata",
  opportunity_auto_created: "Opportunità creata in automatico",
  opportunity_assigned: "Opportunità assegnata",
  opportunity_deleted: "Opportunità nel cestino",
  opportunity_restored: "Opportunità ripristinata",
  opportunity_linked: "Opportunità collegata",
  stage_change: "Fase cambiata",
  stage_changed: "Fase cambiata",
  status_change: "Stato cambiato",
  status_changed: "Stato cambiato",
  tag_added: "Etichetta aggiunta",
  tag_removed: "Etichetta rimossa",
  note_added: "Nota aggiunta",
  document_uploaded: "Documento caricato",
  email_sent: "Email inviata",
  message_sent: "Messaggio inviato",
  quote_sent: "Preventivo inviato",
  quote_accepted: "Preventivo accettato",
  form_submitted: "Modulo compilato",
  lead_form_submission: "Nuova richiesta dal modulo",
  site_lead_submitted: "Modulo del sito compilato",
};

export function etichettaAttivita(tipo: string | null | undefined): string {
  const chiave = (tipo ?? "").trim();
  if (!chiave) return "Attività";
  if (ETICHETTE[chiave]) return ETICHETTE[chiave];
  const leggibile = chiave.replace(/[_-]+/g, " ");
  return leggibile.charAt(0).toUpperCase() + leggibile.slice(1);
}

/** Il nome del flusso scritto nelle note del motore: «L'automazione «FB - Nuovo» …». */
export function nomeFlussoDaTesto(testo: string | null | undefined): string | null {
  const m = /automazione\s+«([^»]{1,80})»/i.exec(testo ?? "");
  return m ? m[1].trim() || null : null;
}

export interface AutoreAzione {
  /** Chi l'ha fatto: nome della persona, o «Automazione …». */
  nome: string;
  /** true quando non è una persona (motore delle automazioni, importazioni, moduli). */
  automatica: boolean;
}

/**
 * Chi ha fatto l'azione.
 * - nome già pronto (operatore di una chiamata, «Agente AI») → quello;
 * - id di un utente → il nome, anche se non è più in squadra (nomi da profiles);
 * - nessun id → l'ha fatta il sistema: il flusso se il testo lo nomina.
 */
export function autoreAzione(dati: {
  agentId?: string | null;
  agentName?: string | null;
  testo?: string | null;
  nomi?: Map<string, string> | null;
}): AutoreAzione {
  const pronto = dati.agentName?.trim();
  if (pronto) return { nome: pronto, automatica: false };
  const id = dati.agentId?.trim();
  if (id) {
    const nome = dati.nomi?.get(id)?.trim();
    return { nome: nome || "un utente non più in squadra", automatica: false };
  }
  const flusso = nomeFlussoDaTesto(dati.testo);
  return { nome: flusso ? `Automazione «${flusso}»` : "Automazione", automatica: true };
}
