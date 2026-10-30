// src/components/orders/generali/moduli/DocumentiScheda.tsx
// Modulo «Documenti» della commessa generale: i documenti che servono per questo tipo di operazione, con scadenze e avvisi.
// Finché `modulo.pronto` è false la scheda non compare. Chi costruisce il modulo cambia SOLO questo
// file (più i suoi file nuovi): la pagina della generale lo trova da sé (schede.tsx).
import type { ModuloScheda } from "@/components/orders/generali/tipiScheda";

export const modulo: ModuloScheda = {
  pronto: false,
  titolo: "Documenti",
  telefono: false,
  Scheda: () => null,
};
