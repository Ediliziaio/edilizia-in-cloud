/**
 * Stato della scheda «WhatsApp Business» in Impostazioni → Integrazioni.
 *
 * Prima la scheda guardava solo il numero «Operativo / Cantieri»: un'azienda con numeri Marketing o Lead
 * attivi, su cui i messaggi arrivavano, vedeva «Non collegato» e il pulsante «Configura» (3 aziende su 4
 * con numeri attivi, il 09/10/2026). Ora conta qualunque numero dell'azienda, di qualunque scopo.
 *
 * Solo lettura: non cambia nessun collegamento, legge soltanto.
 */
import { etichettaStatoNumero } from "@/hooks/whatsapp/useWhatsAppNumbers";

/** Le sole colonne che servono (tutte nel GRANT di `ai_whatsapp_numbers`: mai token o PIN). */
export const COLONNE_STATO_WHATSAPP = "id, stato, webhook_verified, numero" as const;

export interface NumeroPerStato {
  stato: string | null;
  webhook_verified: boolean | null;
  numero: string | null;
}

export interface StatoWhatsAppIntegrazione {
  status: "connected" | "pending" | "warning" | "disconnected";
  detail: string | null;
}

export function statoWhatsAppDaiNumeri(numeri: NumeroPerStato[]): StatoWhatsAppIntegrazione {
  const inUso = numeri.filter((n) => n.stato !== "removed");
  if (inUso.length === 0) return { status: "disconnected", detail: null };

  // «Attivo» come nella scheda del numero: attivo E verificato da Meta.
  const attivi = inUso.filter((n) => n.stato === "active" && n.webhook_verified);
  if (attivi.length > 0) {
    const detail =
      attivi.length > 1 ? `${attivi.length} numeri collegati` : attivi[0].numero ? `Numero: ${attivi[0].numero}` : "1 numero collegato";
    return { status: "connected", detail };
  }

  // Nessun numero attivo: il caso di uno solo si spiega con le parole della scheda del numero.
  const detail = inUso.length === 1 ? etichettaStatoNumero(inUso[0].stato, inUso[0].webhook_verified) : `Nessuno dei ${inUso.length} numeri è attivo`;
  // In verifica / in attesa si aspetta; sospeso o altro va guardato.
  const inAttesa = inUso.some(
    (n) => n.stato === "pending" || n.stato === "pending_verification" || (n.stato === "active" && !n.webhook_verified),
  );
  return { status: inAttesa ? "pending" : "warning", detail };
}
