// src/components/orders/generali/moduli/InvestitoriScheda.tsx
// Modulo «Investitori» della commessa generale: fonti di finanziamento, versamenti, quote e rendiconti.
// Finché `modulo.pronto` è false la scheda non compare. Chi costruisce il modulo cambia SOLO questo
// file (più i suoi file nuovi): la pagina della generale lo trova da sé (schede.tsx).
import type { ModuloScheda } from "@/components/orders/generali/tipiScheda";

export const modulo: ModuloScheda = {
  pronto: false,
  titolo: "Investitori",
  telefono: false,
  Scheda: () => null,
};
