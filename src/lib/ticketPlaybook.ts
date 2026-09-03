/**
 * Playbook assistenza — il percorso standard di un ticket.
 *
 * Stesso meccanismo delle commesse (motore condiviso in `flussoLavoro.ts`), ma
 * su tempi da assistenza: qui si ragiona in ore e giorni, non in settimane.
 * Il "vertical" del flusso è la CATEGORIA del ticket (`tickets.category`), così
 * un guasto in garanzia può seguire un percorso diverso da un intervento a
 * pagamento; NULL = flusso valido per tutte le categorie.
 */

import { applicaFlusso, type PassoFlusso } from "@/lib/flussoLavoro";

/**
 * Percorso predefinito di un'assistenza. Come per le commesse è una lista
 * piatta: la catena (chi sblocca chi, e a quale ufficio) è una scelta
 * dell'azienda, che se la costruisce da "Gestisci flusso".
 */
export const TICKET_PLAYBOOK: PassoFlusso[] = [
  { titolo: "Presa in carico e primo contatto col cliente", giorni_offset: 0, priorita: "urgente" },
  { titolo: "Diagnosi del guasto / sopralluogo tecnico", giorni_offset: 1, priorita: "alta" },
  { titolo: "Preventivo intervento al cliente", giorni_offset: 2, priorita: "alta" },
  { titolo: "Ordine ricambi al fornitore", giorni_offset: 4, priorita: "normale" },
  { titolo: "Intervento in loco", giorni_offset: 7, priorita: "alta" },
  { titolo: "Rapportino firmato dal cliente", giorni_offset: 8, priorita: "normale" },
  { titolo: "Fatturazione intervento", giorni_offset: 10, priorita: "normale" },
];

/**
 * Applica il flusso al ticket: crea le attività di assistenza, incatenate come
 * l'azienda le ha configurate. Se non ha configurato niente usa il percorso
 * predefinito qui sopra.
 */
export async function applyPlaybookToTicket(params: {
  companyId: string;
  ticketId: string;
  /** Categoria del ticket: permette percorsi diversi per tipo di assistenza. */
  category?: string | null;
  baseDate: Date;
  /** Tecnico del ticket: i passi senza assegnatario proprio vanno a lui. */
  assignedTo?: string | null;
}): Promise<{ created: number }> {
  return applicaFlusso({
    companyId: params.companyId,
    ambito: "ticket",
    entitaId: params.ticketId,
    vertical: params.category ?? null,
    baseDate: params.baseDate,
    assignedTo: params.assignedTo,
    passiPredefiniti: TICKET_PLAYBOOK,
    categoriaTask: "assistenza",
  });
}
