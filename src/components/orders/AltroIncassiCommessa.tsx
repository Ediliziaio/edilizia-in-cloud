/**
 * In fondo a Economia → Incassi e pagamenti (01/11/2026): quello che riguarda gli incassi ma non è la
 * prima cosa da leggere. IVA della commessa e ritenute di garanzia in sezioni richiudibili con una riga
 * che dice cosa sono; blocca prezzo e ripartizione dei bonus come schede, e solo quando l'azienda li usa
 * (si nascondono da sé).
 */
import { useLocation } from "react-router-dom";
import { Landmark, ShieldCheck } from "lucide-react";
import { BloccaPrezzoCard } from "./BloccaPrezzoCard";
import { BonusRipartizioneCard } from "./BonusRipartizioneCard";
import { IvaCommessa } from "./IvaCommessa";
import { SezioneRichiudibile } from "./SezioneRichiudibile";
import { RitenuteTab } from "@/components/ritenute/RitenuteTab";

export function AltroIncassiCommessa({ orderId, vatRate, hasBuildingBonus, customerId, saldoPagato, pivaImpresa, conIva, conImporti }: {
  orderId: string; vatRate: number; hasBuildingBonus: boolean; customerId?: string | null; saldoPagato: boolean;
  pivaImpresa?: string | null;
  /** IVA a debito e a credito: serve vedere sia gli importi sia i costi. */
  conIva: boolean;
  /** Blocca prezzo e bonus sono importi del cliente. */
  conImporti: boolean;
}) {
  // Chi arriva da un link alle ritenute (#section-ritenute) le trova aperte, non una riga chiusa.
  const { hash } = useLocation();
  return (
    <section aria-label="Altro su questa commessa" className="space-y-3">
      <h3 className="pt-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Altro su questa commessa</h3>
      {conImporti && (
        // Bonus, blocca prezzo: conti d'ufficio, dal telefono no.
        <div className="space-y-3 max-sm:hidden">
          {/* Blocca prezzo: soldi che stanno FUORI dal contratto e vanno restituiti. */}
          <BloccaPrezzoCard orderId={orderId} customerId={customerId} hasBuildingBonus={hasBuildingBonus} saldoPagato={saldoPagato} />
          {/* Ripartizione su più bonus: quanti bonifici parlanti servono e con che causale. */}
          <BonusRipartizioneCard orderId={orderId} vatRate={vatRate} hasBuildingBonus={hasBuildingBonus} datiCausale={{ pivaImpresa: pivaImpresa ?? null }} />
        </div>
      )}
      {conIva && (
        <SezioneRichiudibile icona={<Landmark className="h-4 w-4" />} titolo="IVA della commessa"
          descrizione="L'IVA delle fatture al cliente (a debito) e di quelle dei fornitori (a credito), e il saldo.">
          <IvaCommessa orderId={orderId} />
        </SezioneRichiudibile>
      )}
      <div id="section-ritenute" className="scroll-mt-24">
        <SezioneRichiudibile icona={<ShieldCheck className="h-4 w-4" />} titolo="Ritenute di garanzia" aperta={hash === "#section-ritenute"}
          descrizione="Le somme trattenute a garanzia, dal cliente e ai subappaltatori, e quando si svincolano.">
          <RitenuteTab orderId={orderId} />
        </SezioneRichiudibile>
      </div>
    </section>
  );
}
