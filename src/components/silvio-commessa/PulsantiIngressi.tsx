/**
 * Le porte del popup sulle pagine degli altri (31/10/2026, fase 3, lotto 3.3):
 * - `FanneUnaCommessa`: sotto gli allegati di un'email. Il popup si apre con gli allegati
 *   che Silvio sa leggere come fonti, letti dove stanno (niente download, niente copie);
 *   la stima è sul pulsante, quindi il tocco è il via.
 * - `CommessaDaContratto`: su un contratto dell'app. Se il contratto è già di una commessa,
 *   «Completa la commessa da questo contratto»; altrimenti «Crea la commessa».
 * Spariscono con l'interruttore spento, come il pulsante di Nuova commessa.
 */
import { PulsanteCreaConSilvio } from "./PulsanteCreaConSilvio";
import { euroAI } from "./presentazione";
import type { FonteDaAggiungere } from "./useBozzaSilvio";
import { fontiDallEmail, stimaDelleFonti, type AllegatoEmail } from "./fontiDegliIngressi";

export function FanneUnaCommessa({ emailId, allegati }: { emailId: string; allegati: readonly AllegatoEmail[] }) {
  const fonti = fontiDallEmail(emailId, allegati);
  if (!fonti.length) return null;
  return (
    <div className="px-3 pb-3 empty:hidden">
      <PulsanteCreaConSilvio size="sm" variant="outline" className="h-8 border-orange-200 text-xs text-orange-800 hover:bg-orange-50"
        etichetta={`Fanne una commessa · ${fonti.length === 1 ? "1 allegato" : `${fonti.length} allegati`} · ~${euroAI(stimaDelleFonti(fonti))}`}
        iniziale={fonti} />
    </div>
  );
}

export function CommessaDaContratto({ contrattoId, orderId, etichettaCommessa }: {
  contrattoId: string; orderId?: string | null; etichettaCommessa?: string | null;
}) {
  const fonte: FonteDaAggiungere = { tipo: "contratto", id: contrattoId };
  return orderId
    ? <PulsanteCreaConSilvio size="sm" variant="outline" etichetta="Completa la commessa da questo contratto"
      orderId={orderId} etichettaCommessa={etichettaCommessa} iniziale={[fonte]} />
    : <PulsanteCreaConSilvio size="sm" variant="outline" etichetta="Crea la commessa da questo contratto" iniziale={fonte} />;
}
