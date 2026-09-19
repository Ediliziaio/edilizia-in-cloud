/**
 * Come si legge lo stato di una riga del registro delle automazioni
 * (automation_execution_log).
 *
 * «skipped» dal 19/09/2026 è un passo RINVIATO: un WhatsApp fuori dalle fasce
 * del passo o con i numeri tutti occupati, che riparte da solo. Prima il motore
 * lo scriveva «error» e il builder lo mostrava come un errore, in rosso.
 */
export type TonoStatoRegistro = "riuscito" | "errore" | "attesa";

const STATI: Record<string, { etichetta: string; tono: TonoStatoRegistro }> = {
  success: { etichetta: "Riuscito", tono: "riuscito" },
  ok: { etichetta: "Riuscito", tono: "riuscito" },
  error: { etichetta: "Errore", tono: "errore" },
  skipped: { etichetta: "Rinviato", tono: "attesa" },
  running: { etichetta: "In corso", tono: "attesa" },
  pending: { etichetta: "In attesa", tono: "attesa" },
};

export function statoRegistro(stato: string | null | undefined): { etichetta: string; tono: TonoStatoRegistro } {
  return STATI[stato ?? ""] ?? { etichetta: stato ?? "—", tono: "attesa" };
}
