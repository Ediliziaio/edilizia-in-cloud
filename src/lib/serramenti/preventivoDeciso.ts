/**
 * Un preventivo «deciso» (06/10/2026): il cliente l'ha firmato o accettato, o ne è nata una commessa. Il piano di
 * pagamento e di finanziamento, la detrazione e il resto dell'economia fanno parte di ciò che è stato firmato, e il
 * PDF si rifà dai dati salvati: lo step Economia non li riscrive MAI da solo (aprendo il passo, cambiando un
 * prezzo da un altro passo), solo per una scelta di chi lavora.
 *
 * Tutti i modi in cui un preventivo Serramenti si considera deciso:
 *  - firmato: la firma del cliente scrive `firmato_il` (e lo stato «accettato»; `firma_cliente_url` è l'immagine);
 *  - in commessa: `ordine_id` (la commessa creata dal preventivo);
 *  - accettato: lo stato «accettato», anche segnato a mano da chi ha avuto il sì a voce.
 * Stato, firma e commessa li cambia il server: si leggono dalla copia salvata, non dal modulo.
 */
import type { SrProgettoRow } from "@/types/serramenti";

export type MotivoDeciso = "firmato" | "accettato" | "in commessa";

type CampiDelloStato = Partial<Pick<SrProgettoRow, "stato" | "firmato_il" | "firma_cliente_url" | "ordine_id">>;

/** Perché il preventivo è deciso, o null se è ancora aperto (bozza, consegnato, in valutazione, rifiutato, scaduto...). */
export function motivoPreventivoDeciso(p: CampiDelloStato | null | undefined): MotivoDeciso | null {
  if (!p) return null;
  if (p.firmato_il || p.firma_cliente_url) return "firmato";
  if (p.ordine_id) return "in commessa";
  if (p.stato === "accettato") return "accettato";
  return null;
}
