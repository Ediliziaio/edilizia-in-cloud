import type { Planimetria } from "./modello.ts";
import { areaPoligono } from "./geometria.ts";

/** Le segnalazioni iniziali restano nello storico; le superfici si confrontano col disegno attuale. */
export function controlliDalDocumento(doc: Planimetria): string[] {
  if (!doc.letturaDocumento) return [];
  const { avvisiIniziali, superficiScritteMq } = doc.letturaDocumento;
  const superficie = doc.livelli.flatMap((l) => l.fatto.locali.flatMap((c) => {
    const scritta = superficiScritteMq[c.id], attuale = areaPoligono(c.contorno) / 10000;
    return scritta > 0 && Math.abs(attuale - scritta) > Math.max(0.1, scritta * 0.05)
      ? [`${c.nome}: ${scritta.toLocaleString("it-IT")} m² scritti sul documento, ${attuale.toLocaleString("it-IT", { maximumFractionDigits: 2 })} m² nel disegno attuale. Controlla misure e contorno.`] : [];
  }));
  const iniziali = avvisiIniziali.filter((s) => !s.startsWith("Alcune superfici non corrispondono ai metri quadri scritti:"));
  return [...superficie, ...iniziali.map((s) => `Alla lettura iniziale: ${s}`)];
}
