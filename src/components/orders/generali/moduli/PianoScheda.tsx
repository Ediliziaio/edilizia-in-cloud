// src/components/orders/generali/moduli/PianoScheda.tsx
// Modulo «Piano economico» della commessa generale: previsto, reale e a finire per voce, costi comuni, flusso di cassa e indicatori.
// Finché `modulo.pronto` è false la scheda non compare. Chi costruisce il modulo cambia SOLO questo
// file (più i suoi file nuovi): la pagina della generale lo trova da sé (schede.tsx).
import type { ModuloScheda } from "@/components/orders/generali/tipiScheda";

export const modulo: ModuloScheda = {
  pronto: false,
  titolo: "Piano economico",
  telefono: false,
  Scheda: () => null,
};
