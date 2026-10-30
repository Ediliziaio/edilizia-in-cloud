// src/components/orders/generali/moduli/DocumentiScheda.tsx
// Modulo «Documenti» della commessa generale: i documenti che servono per questo tipo di operazione, con scadenze e avvisi.
// Finché `modulo.pronto` è false la scheda non compare. Chi costruisce il modulo cambia SOLO questo
// file (più i suoi file nuovi): la pagina della generale lo trova da sé (schede.tsx).
// I file restano nell'archivio delle commesse; la checklist è in src/components/orders/generali/documenti/.
import { RiquadroDocumenti } from "@/components/orders/generali/documenti/RiquadroDocumenti";
import { SchedaDocumenti } from "@/components/orders/generali/documenti/SchedaDocumenti";
import type { ModuloScheda } from "@/components/orders/generali/tipiScheda";

export const modulo: ModuloScheda = {
  pronto: true,
  titolo: "Documenti",
  // Da telefono in sola lettura: la checklist compatta, toccando una voce si apre il file.
  telefono: true,
  Scheda: SchedaDocumenti,
  Riquadro: RiquadroDocumenti,
};
