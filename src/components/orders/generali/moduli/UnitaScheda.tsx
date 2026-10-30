// src/components/orders/generali/moduli/UnitaScheda.tsx
// Modulo «Unità e vendite» della commessa generale: le unità in vendita: stato, acquirente, prezzi, caparre, permuta, margine per unità.
// Finché `modulo.pronto` è false la scheda non compare. Chi costruisce il modulo cambia SOLO questo
// file (più i suoi file nuovi): la pagina della generale lo trova da sé (schede.tsx).
// I file del modulo stanno in src/components/orders/generali/unita/ e src/lib/orders/generali/unita*.ts.
import type { ModuloScheda } from "@/components/orders/generali/tipiScheda";
import { RiquadroUnita } from "@/components/orders/generali/unita/RiquadroUnita";
import { SchedaUnita } from "@/components/orders/generali/unita/SchedaUnita";

export const modulo: ModuloScheda = {
  pronto: true,
  titolo: "Unità e vendite",
  // Da telefono: il tabellone e il cambio dello stato di vendita (il commerciale in visita).
  telefono: true,
  Scheda: SchedaUnita,
  Riquadro: RiquadroUnita,
};
