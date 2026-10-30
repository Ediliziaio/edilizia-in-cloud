// src/components/orders/generali/schede.tsx
// Le schede della pagina della generale: Panoramica, poi una per ogni modulo acceso dal
// modello e già pronto. I moduli stanno ognuno nel suo file (moduli/*Scheda.tsx).
import { modulo as contratto } from "@/components/orders/generali/moduli/ContrattoScheda";
import { modulo as documenti } from "@/components/orders/generali/moduli/DocumentiScheda";
import { modulo as investitori } from "@/components/orders/generali/moduli/InvestitoriScheda";
import { modulo as piano } from "@/components/orders/generali/moduli/PianoScheda";
import { modulo as unita } from "@/components/orders/generali/moduli/UnitaScheda";
import type { ModuloScheda } from "@/components/orders/generali/tipiScheda";
import type { ModelloGenerale } from "@/lib/orders/commesseGenerali";
import { moduliDelModello, type ModuloGenerale } from "@/lib/orders/generali/moduli";

const MODULI_SCHEDA: Record<ModuloGenerale, ModuloScheda> = { contratto, piano, unita, investitori, documenti };

export interface SchedaGenerale extends ModuloScheda { id: ModuloGenerale }

/** Le schede dei moduli da mostrare, nell'ordine del modello. Da telefono solo quelle che lo dichiarano. */
export function schedeDelModello(modello: ModelloGenerale, telefono: boolean): SchedaGenerale[] {
  return moduliDelModello(modello)
    .map((id) => ({ id, ...MODULI_SCHEDA[id] }))
    .filter((s) => s.pronto && (!telefono || s.telefono));
}
