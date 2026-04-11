/**
 * Chat campo — riutilizza InternalChat (WhatsApp-style) per operai e subappaltatori.
 * Stessa esperienza degli utenti ufficio: canali, DM, gruppi, reazioni, risposte.
 */
import InternalChat from "@/pages/azienda/InternalChat";

export default function CampoChat() {
  return <InternalChat />;
}
