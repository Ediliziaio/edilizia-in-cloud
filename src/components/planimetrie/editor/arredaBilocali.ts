import { nuovaPlanimetria, type Proposta } from "../../../../shared/planimetrie/modello.ts";
import { daPlanimetria, elementoAModello } from "./adattatore";
import { arredaStanza } from "./arreda";

/** Usa il posizionamento dell’editor sui locali della variante, compreso l’angolo cottura. */
export function arredaBilocali(proposta: Proposta): { proposta: Proposta; daRivedere: string[] } {
  const documento = nuovaPlanimetria();
  const livello = documento.livelli[0];
  livello.fatto = {
    ...proposta,
    muri: proposta.muri.filter(m => m.stato !== "da_demolire").map(m => ({ ...m, stato: "esistente" })),
    aperture: proposta.aperture.filter(a => a.stato !== "da_demolire").map(a => ({ ...a, stato: "esistente" })),
  };
  let pianta = daPlanimetria(documento);
  const elementi = [...proposta.elementi];
  const daRivedere: string[] = [];
  for (const l of pianta.locali.filter(l => ["soggiorno", "camera", "bagno"].includes(l.destinazione))) {
    const programma = l.destinazione === "soggiorno" ? [
      { tipo: "cucina", larghezzaMinima: 180 }, { tipo: "frigorifero" }, { tipo: "divano" }, { tipo: "tavolo", centro: true },
    ] : undefined;
    const esito = arredaStanza(pianta, l.id, "fatto", undefined, { programma });
    pianta = esito.pianta;
    const id = new Set(esito.aggiunti);
    elementi.push(...(pianta.elementi ?? []).filter(e => id.has(e.id)).map(e => ({
      ...elementoAModello({ ...e, origine: "stimata" }, "nuovo"), localeId: l.id,
    })));
    if (esito.saltati.length) daRivedere.push(l.nome + " · " + [...new Set(esito.saltati)].join(", "));
  }
  return { proposta: { ...proposta, elementi }, daRivedere };
}
