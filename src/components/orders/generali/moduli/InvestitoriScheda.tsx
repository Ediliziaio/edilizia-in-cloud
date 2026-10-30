// src/components/orders/generali/moduli/InvestitoriScheda.tsx
// Modulo «Investitori» della commessa generale: fonti di finanziamento, versamenti, quote e rendiconti.
// Chi costruisce il modulo cambia SOLO questo file (più i suoi file nuovi): la pagina della
// generale lo trova da sé (schede.tsx). I componenti stanno in ../investitori/, i conti in
// src/lib/orders/generali/investitoriConti.ts.
import type { ModuloScheda } from "@/components/orders/generali/tipiScheda";
import { Investitori } from "@/components/orders/generali/investitori/Investitori";
import { RiquadroInvestitori } from "@/components/orders/generali/investitori/RiquadroInvestitori";

export const modulo: ModuloScheda = {
  pronto: true,
  titolo: "Investitori",
  // Dati sensibili e tabelle larghe: tablet e computer (piano §3.4).
  telefono: false,
  Scheda: Investitori,
  Riquadro: RiquadroInvestitori,
};
