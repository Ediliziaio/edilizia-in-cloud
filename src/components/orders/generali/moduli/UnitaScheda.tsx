// src/components/orders/generali/moduli/UnitaScheda.tsx
// Modulo «Unità e vendite» della commessa generale: le unità in vendita: stato, acquirente, prezzi, caparre, permuta, margine per unità.
// Finché `modulo.pronto` è false la scheda non compare. Chi costruisce il modulo cambia SOLO questo
// file (più i suoi file nuovi): la pagina della generale lo trova da sé (schede.tsx).
import type { ModuloScheda } from "@/components/orders/generali/tipiScheda";

export const modulo: ModuloScheda = {
  pronto: false,
  titolo: "Unità e vendite",
  telefono: false,
  Scheda: () => null,
};
