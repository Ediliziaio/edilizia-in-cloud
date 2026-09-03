/**
 * Playbook commessa — il percorso standard di una commessa, per mestiere.
 *
 * Qui vivono solo i percorsi PREDEFINITI (quelli che l'azienda si trova già
 * pronti) e l'aggancio alla commessa. Il motore che crea le attività e le
 * incatena è condiviso con i ticket di assistenza: `src/lib/flussoLavoro.ts`.
 */

import { applicaFlusso, type PassoFlusso } from "@/lib/flussoLavoro";

/** I passi di un playbook sono passi di flusso: il tipo è quello condiviso. */
export type PlaybookStep = PassoFlusso;

const SERRAMENTISTA: PlaybookStep[] = [
  { titolo: "Sopralluogo e rilievo misure", giorni_offset: 2, priorita: "alta" },
  { titolo: "Conferma misure e capitolato col cliente", giorni_offset: 4, priorita: "normale" },
  { titolo: "Ordine serramenti al fornitore", giorni_offset: 5, priorita: "alta" },
  { titolo: "Verifica arrivo merce in magazzino", giorni_offset: 25, priorita: "normale" },
  { titolo: "Programmazione posa con la squadra", giorni_offset: 28, priorita: "normale" },
  { titolo: "Posa in opera", giorni_offset: 35, priorita: "alta" },
  { titolo: "Collaudo e firma verbale fine lavori", giorni_offset: 40, priorita: "normale" },
  { titolo: "Richiesta saldo + dossier detrazioni", giorni_offset: 42, priorita: "normale" },
];

const FOTOVOLTAICO: PlaybookStep[] = [
  { titolo: "Sopralluogo tecnico e rilievo tetto", giorni_offset: 3, priorita: "alta" },
  { titolo: "Pratica connessione (TICA) + CILA in Comune", giorni_offset: 7, priorita: "alta" },
  { titolo: "Ordine moduli, inverter e accumulo", giorni_offset: 10, priorita: "alta" },
  { titolo: "Installazione impianto", giorni_offset: 25, priorita: "alta" },
  { titolo: "Allaccio rete + collaudo", giorni_offset: 35, priorita: "normale" },
  { titolo: "Pratica GSE (Scambio sul Posto)", giorni_offset: 40, priorita: "normale" },
  { titolo: "Consegna dossier detrazioni + saldo", giorni_offset: 45, priorita: "normale" },
];

const TETTI: PlaybookStep[] = [
  { titolo: "Sopralluogo copertura e rilievo", giorni_offset: 2, priorita: "alta" },
  { titolo: "Conferma capitolato + documenti sicurezza (PSC/POS)", giorni_offset: 5, priorita: "alta" },
  { titolo: "Ordine materiali", giorni_offset: 7, priorita: "normale" },
  { titolo: "Allestimento cantiere e ponteggio", giorni_offset: 12, priorita: "normale" },
  { titolo: "Rifacimento / posa copertura", giorni_offset: 25, priorita: "alta" },
  { titolo: "Smontaggio ponteggio e pulizia cantiere", giorni_offset: 35, priorita: "normale" },
  { titolo: "Collaudo + saldo", giorni_offset: 40, priorita: "normale" },
];

const GENERICO: PlaybookStep[] = [
  { titolo: "Sopralluogo iniziale", giorni_offset: 2, priorita: "alta" },
  { titolo: "Conferma preventivo e capitolato", giorni_offset: 4, priorita: "normale" },
  { titolo: "Ordine materiali ai fornitori", giorni_offset: 6, priorita: "alta" },
  { titolo: "Avvio lavori in cantiere", giorni_offset: 10, priorita: "normale" },
  { titolo: "Verifica avanzamento (SAL)", giorni_offset: 20, priorita: "normale" },
  { titolo: "Fine lavori e collaudo", giorni_offset: 35, priorita: "alta" },
  { titolo: "Saldo e chiusura commessa", giorni_offset: 40, priorita: "normale" },
];

const PLAYBOOKS: Record<string, PlaybookStep[]> = {
  serramentista: SERRAMENTISTA,
  fotovoltaico: FOTOVOLTAICO,
  tetti: TETTI,
  generico: GENERICO,
};

/** Etichetta umana del playbook scelto (per il messaggio di conferma). */
export const PLAYBOOK_LABELS: Record<string, string> = {
  serramentista: "Serramenti",
  fotovoltaico: "Fotovoltaico",
  tetti: "Tetti e coperture",
  generico: "Generico edile",
};

/** Restituisce il playbook per il vertical (fallback: generico). */
export function getOrderPlaybook(vertical?: string | null): { key: string; steps: PlaybookStep[] } {
  const key = vertical && PLAYBOOKS[vertical] ? vertical : "generico";
  return { key, steps: PLAYBOOKS[key] };
}

/**
 * Applica il flusso alla commessa: crea le attività standard, incatenate come
 * l'azienda le ha configurate in "Gestisci". Se non ha configurato niente usa
 * il playbook predefinito del mestiere (che è una lista piatta: la catena è una
 * scelta dell'azienda).
 */
export async function applyPlaybookToOrder(params: {
  companyId: string;
  orderId: string;
  vertical?: string | null;
  baseDate: Date;
  /** Responsabile della commessa: i passi senza assegnatario proprio vanno a lui. */
  assignedTo?: string | null;
}): Promise<{ created: number; playbookKey: string }> {
  const { key, steps } = getOrderPlaybook(params.vertical);
  const { created } = await applicaFlusso({
    companyId: params.companyId,
    ambito: "commessa",
    entitaId: params.orderId,
    vertical: params.vertical,
    baseDate: params.baseDate,
    assignedTo: params.assignedTo,
    passiPredefiniti: steps,
    categoriaTask: "ordini",
  });
  return { created, playbookKey: key };
}
