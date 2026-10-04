/**
 * I disegni del preventivo per il PDF: per ogni riga del preventivo con un articolo che ha il disegno,
 * le due viste (dentro e fuori, con le quote) già rasterizzate. Si calcolano prima del PDF, come le foto.
 */
import { createElement } from "react";
import type { AxisSelection, FamilyWithAxes } from "@/types/articleFamily";
import { configDaFamiglia, disegnoDaConfig, haDisegno, type DisegnoConfig } from "./disegnoDaFamiglia";
import { rasterizzaDisegno, type ImmagineDisegno } from "./rasterizzaDisegno";

export interface DisegnoPdf {
  viste: Array<{ vista: "interna" | "esterna"; immagine: ImmagineDisegno }>;
  /** L'apertura scelta (vista da dentro), se l'articolo la prevede. */
  apertura?: "dx" | "sx";
}

type EtichettaAsse = { axisLabel: string; valueLabel: string };

export const chiaveDisegno = (
  familyId: string | null | undefined,
  larghezza: number | null | undefined,
  altezza: number | null | undefined,
  valoriAssi: Record<string, string> | null | undefined,
  congelato?: DisegnoConfig | null,
  scelte?: Record<string, string> | null,
  colori?: { interno?: string | null; esterno?: string | null },
): string =>
  `${familyId ?? "-"}|${larghezza ?? "-"}x${altezza ?? "-"}|${Object.entries(valoriAssi ?? {}).sort().map(([k, v]) => `${k}=${v}`).join(";")}` +
  // La voce scelta dentro il valore (il colore vero) distingue due righe con lo stesso «Colore Standard».
  (scelte && Object.keys(scelte).length > 0 ? `|${Object.entries(scelte).sort().map(([k, v]) => `${k}:${v}`).join(";")}` : "") +
  (colori && (colori.interno || colori.esterno) ? `|ci:${colori.interno ?? ""}|ce:${colori.esterno ?? ""}` : "") +
  (congelato?.v === 1 ? `|${JSON.stringify(congelato)}` : "");

/** Una famiglia «in piccolo» per l'adattatore, dalle etichette già lette per il PDF (`family|asse|valore`). */
function famigliaDaEtichette(
  familyId: string,
  disegnoTipologia: string,
  etichette: Record<string, EtichettaAsse>,
): FamilyWithAxes {
  const assi = new Map<string, Array<{ id: string; label: string }>>();
  for (const [chiave, e] of Object.entries(etichette)) {
    const [fid, codice, valueId] = chiave.split("|");
    if (fid !== familyId) continue;
    assi.set(codice, [...(assi.get(codice) ?? []), { id: valueId, label: e.valueLabel }]);
  }
  return {
    id: familyId,
    disegno_tipologia: disegnoTipologia,
    axes: [...assi.entries()].map(([codice, valori]) => ({
      codice,
      values: valori.map((v) => ({ id: v.id, label: v.label, is_default: false, attivo: true })),
    })),
  } as unknown as FamilyWithAxes;
}

export interface RigaPerDisegno {
  family_id: string | null;
  larghezza_mm: number | null;
  altezza_mm: number | null;
  valori_assi: Record<string, string> | null;
  /** Le voci scelte dentro i valori (il colore vero): servono quando il disegno non è congelato. */
  scelte_assi?: Record<string, string> | null;
  colore_interno?: string | null;
  colore_esterno?: string | null;
  /** Il disegno congelato nella riga: se c'è vince sul listino di oggi. */
  disegno_config?: DisegnoConfig | null;
}

export async function disegniDelPreventivo(
  righe: RigaPerDisegno[],
  tipologiaPerFamiglia: Record<string, string | null>,
  etichette: Record<string, EtichettaAsse>,
): Promise<Record<string, DisegnoPdf>> {
  const risultato: Record<string, DisegnoPdf> = {};
  const { DisegnoSerramentoSvg } = await import("@/components/serramenti/DisegnoSerramentoSvg");
  for (const r of righe) {
    if (!r.family_id || !r.larghezza_mm || !r.altezza_mm) continue;
    const congelato = r.disegno_config?.v === 1 ? r.disegno_config : null;
    const tipologia = tipologiaPerFamiglia[r.family_id];
    if (!congelato && !tipologia) continue;
    const chiave = chiaveDisegno(r.family_id, r.larghezza_mm, r.altezza_mm, r.valori_assi, congelato, r.scelte_assi, { interno: r.colore_interno, esterno: r.colore_esterno });
    if (risultato[chiave]) continue;
    let d: ReturnType<typeof disegnoDaConfig> = null;
    if (congelato) {
      d = disegnoDaConfig(congelato, r.larghezza_mm, r.altezza_mm);
    } else {
      const family = famigliaDaEtichette(r.family_id, tipologia as string, etichette);
      if (!haDisegno(family)) continue;
      const config = configDaFamiglia(family, (r.valori_assi ?? {}) as AxisSelection, { coloreInterno: r.colore_interno, coloreEsterno: r.colore_esterno, voci: r.scelte_assi });
      d = config ? disegnoDaConfig(config, r.larghezza_mm, r.altezza_mm) : null;
    }
    if (!d) continue;
    const viste: DisegnoPdf["viste"] = [];
    for (const v of d.viste) {
      const elemento =
        d.tipo === "persiana"
          ? createElement(DisegnoSerramentoSvg, { scena: (v as unknown as { scena: never }).scena, vista: v.vista, finituraInterna: d.finituraEsterna, finituraEsterna: d.finituraEsterna })
          : createElement(DisegnoSerramentoSvg, { disegno: (v as unknown as { disegno: never }).disegno, finituraInterna: d.finituraInterna, finituraEsterna: d.finituraEsterna, finituraTapparella: d.finituraTapparella, finituraCassonetto: d.finituraCassonetto });
      const immagine = await rasterizzaDisegno(elemento);
      if (immagine) viste.push({ vista: v.vista, immagine });
    }
    if (viste.length > 0) risultato[chiave] = { viste, apertura: d.apertura };
  }
  return risultato;
}
