/**
 * In fondo a Economia → Incassi e pagamenti (01/11/2026): quello che riguarda gli incassi ma non è la
 * prima cosa da leggere. IVA della commessa e ritenute di garanzia in sezioni richiudibili con una riga
 * che dice cosa sono; blocca prezzo e ripartizione dei bonus come schede, e solo quando l'azienda li usa
 * (si nascondono da sé).
 */
import { useLocation } from "react-router-dom";
import { BloccaPrezzoCard } from "./BloccaPrezzoCard";
import { BonusRipartizioneCard } from "./BonusRipartizioneCard";
import { IvaCommessa } from "./IvaCommessa";
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
  const { hash, search } = useLocation();
  const sezione = hash.slice(1) || new URLSearchParams(search).get("section");
  return (
    <section aria-labelledby="altri-dati-economici" className="space-y-2">
      <h3 id="altri-dati-economici" className="pt-2 text-sm font-semibold">Altri dati economici</h3>
      {conImporti && (
        <>
          {/* Blocca prezzo: soldi che stanno FUORI dal contratto e vanno restituiti. */}
          <BloccaPrezzoCard compatta orderId={orderId} customerId={customerId} hasBuildingBonus={hasBuildingBonus} saldoPagato={saldoPagato} />
          {/* Ripartizione su più bonus: quanti bonifici parlanti servono e con che causale. */}
          <div className="max-sm:hidden empty:hidden">
            <BonusRipartizioneCard orderId={orderId} vatRate={vatRate} hasBuildingBonus={hasBuildingBonus} datiCausale={{ pivaImpresa: pivaImpresa ?? null }} />
          </div>
        </>
      )}
      {conIva && <div id="section-iva-commessa" className="scroll-mt-24">
        <IvaCommessa orderId={orderId} compatta aperta={sezione === "section-iva-commessa"} />
      </div>}
      <div id="section-ritenute" className="scroll-mt-24">
        <RitenuteTab orderId={orderId} aperta={sezione === "section-ritenute"} />
      </div>
    </section>
  );
}
