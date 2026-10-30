// src/components/orders/generali/moduli/PianoScheda.tsx
// Modulo «Piano economico» della commessa generale: previsto, reale e a finire per voce, costi comuni, flusso di cassa e indicatori.
// Chi costruisce il modulo cambia SOLO questo file (più i suoi file nuovi): la pagina della
// generale lo trova da sé (schede.tsx). I componenti stanno in ../piano/, i conti in
// src/lib/orders/generali/pianoConti.ts.
import type { ModuloScheda } from "@/components/orders/generali/tipiScheda";
import { PianoEconomico } from "@/components/orders/generali/piano/PianoEconomico";
import { RiquadroPiano } from "@/components/orders/generali/piano/RiquadroPiano";

export const modulo: ModuloScheda = {
  pronto: true,
  titolo: "Piano economico",
  // Il piano è un foglio di calcolo largo: tablet e computer (piano §3.4).
  telefono: false,
  Scheda: PianoEconomico,
  Riquadro: RiquadroPiano,
};
