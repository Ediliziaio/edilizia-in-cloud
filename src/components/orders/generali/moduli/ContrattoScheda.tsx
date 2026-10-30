// src/components/orders/generali/moduli/ContrattoScheda.tsx
// Modulo «Contratto e SAL» della commessa generale: contratto con il committente, atti aggiuntivi, garanzie, SAL di contratto, elenco prezzi e misure.
// Finché `modulo.pronto` è false la scheda non compare. Chi costruisce il modulo cambia SOLO questo
// file (più i suoi file nuovi): la pagina della generale lo trova da sé (schede.tsx).
// I pezzi stanno in src/components/orders/generali/contratto/; il database nella migrazione 20281031100000.
import type { ModuloScheda } from "@/components/orders/generali/tipiScheda";
import { RiquadroContratto } from "@/components/orders/generali/contratto/RiquadroContratto";
import { SchedaContratto } from "@/components/orders/generali/contratto/SchedaContratto";

export const modulo: ModuloScheda = {
  pronto: true,
  titolo: "Contratto e SAL",
  // Da telefono la generale si legge soltanto: niente SAL, elenchi o importazioni (piano §3.4).
  telefono: false,
  Scheda: SchedaContratto,
  Riquadro: RiquadroContratto,
};
