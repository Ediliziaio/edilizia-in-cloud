import type { FamilyWithAxes } from "@/types/articleFamily";
import { comeListinoFamily } from "@/lib/serramenti/pickerListino";
import {
  calcolaCostoPosizione,
  calcolaPrezzoProdotto,
} from "@/lib/serramenti/pricing";

/** FV extras are piece-count rows, not a second variant/grid configurator.
 * Keep the original pricing/cost engines and explain unsupported configurations
 * instead of treating a square-metre or unconfigured price as a piece price. */
export function prodottoExtraConversazioneFv(
  family: FamilyWithAxes,
): Record<string, unknown> {
  const blocked =
    family.modalita_prezzo_base !== "pz"
      ? "Questo prodotto richiede misure o un prezzo configurato: non può essere convertito automaticamente in pezzi."
      : family.axes.length > 0
        ? "Configura prima le varianti di questo prodotto: il prezzo base non è una configurazione completa."
        : family.manodopera_modalita && family.manodopera_modalita !== "nessuna"
          ? "Questo prodotto prevede posa dedicata: verifica prodotto e manodopera prima di usarlo come extra FV."
          : null;
  const native = comeListinoFamily(family);
  const price = blocked
    ? null
    : calcolaPrezzoProdotto(native, null, null, 1, []).prezzo;
  const cost = blocked
    ? null
    : calcolaCostoPosizione({
        family: native,
        larghezza: null,
        altezza: null,
        quantita: 1,
        posaEsclusa: true,
      }).prodotto;
  return {
    id: family.id,
    nome: family.nome,
    descrizione: family.descrizione,
    prezzo: price,
    prezzo_acquisto: cost,
    unita: family.modalita_prezzo_base,
    configurazione_richiesta: blocked,
  };
}
