// src/components/orders/generali/moduli/ContrattoScheda.tsx
// Modulo «Contratto e SAL» della commessa generale: contratto con il committente, atti aggiuntivi, garanzie, SAL di contratto, elenco prezzi e misure.
// Finché `modulo.pronto` è false la scheda non compare. Chi costruisce il modulo cambia SOLO questo
// file (più i suoi file nuovi): la pagina della generale lo trova da sé (schede.tsx).
import type { ModuloScheda } from "@/components/orders/generali/tipiScheda";

export const modulo: ModuloScheda = {
  pronto: false,
  titolo: "Contratto e SAL",
  telefono: false,
  Scheda: () => null,
};
