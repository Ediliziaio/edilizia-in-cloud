/**
 * Un elemento che attraversa l'edificio (vano ascensore, vano scala, pilastro) si disegna una volta e si
 * ripete sugli altri piani nello stesso punto: sopra al piano sotto, così il 3D lo vede come un vano unico.
 * Lavora sul documento intero (più piani), non sul disegno di un piano solo.
 */
import type { Elemento, Livello, Planimetria, StatoPianta } from "../../../shared/planimetrie/modello.ts";

/** Gli elementi che hanno senso su tutti i piani. */
export const TIPI_SU_TUTTI_I_PIANI: readonly string[] = ["ascensore", "scala", "scala_u", "scala_chiocciola", "pilastro", "trave", "solaio"];

const VICINO_CM = 40;

export interface EsitoCopia {
  documento: Planimetria;
  aggiunti: number;
  /** Piani dove c'era già un elemento dello stesso tipo nello stesso punto. */
  giaPresenti: number;
}

const contenitori = (l: Livello): StatoPianta[] => [l.fatto, ...l.proposte];

export function copiaSuTuttiIPiani(doc: Planimetria, livelloId: string, elementoId: string, nuovoId: () => string): EsitoCopia | null {
  const sorgente = doc.livelli.find((l) => l.id === livelloId);
  if (!sorgente) return null;
  let origine: Elemento | undefined;
  let eraIn: "fatto" | number = "fatto";
  contenitori(sorgente).some((c, i) => {
    const e = c.elementi.find((x) => x.id === elementoId);
    if (e) { origine = e; eraIn = i === 0 ? "fatto" : i - 1; }
    return !!e;
  });
  if (!origine) return null;
  const o: Elemento = origine;
  let aggiunti = 0, giaPresenti = 0;
  const livelli = doc.livelli.map((l) => {
    if (l.id === livelloId) return l;
    const c = contenitori(l);
    const c0 = c.some((s) => s.elementi.some((x) => x.tipo === o.tipo && Math.hypot(x.posizione.x - o.posizione.x, x.posizione.y - o.posizione.y) < VICINO_CM));
    if (c0) { giaPresenti += 1; return l; }
    const copia: Elemento = { ...o, id: nuovoId() };
    aggiunti += 1;
    // dove stava l'originale: nell'«as is» oppure nella stessa proposta (se questo piano non ce l'ha, nella prima)
    if (eraIn === "fatto") return { ...l, fatto: { ...l.fatto, elementi: [...l.fatto.elementi, copia] } };
    const idProposta = sorgente.proposte[eraIn as number]?.id;
    const k = Math.max(0, l.proposte.findIndex((p) => p.id === idProposta));
    if (!l.proposte.length) return { ...l, fatto: { ...l.fatto, elementi: [...l.fatto.elementi, { ...copia, stato: copia.stato === "nuovo" ? "esistente" : copia.stato }] } };
    return { ...l, proposte: l.proposte.map((p, i) => (i === k ? { ...p, elementi: [...p.elementi, copia] } : p)) };
  });
  return { documento: { ...doc, livelli }, aggiunti, giaPresenti };
}

/** Più elementi insieme (il telaio strutturale): ognuno su tutti gli altri piani, nello stesso punto. */
export function copiaGruppoSuTuttiIPiani(doc: Planimetria, livelloId: string, elementiId: string[], nuovoId: () => string): EsitoCopia {
  let documento = doc, aggiunti = 0, giaPresenti = 0;
  for (const id of elementiId) {
    const r = copiaSuTuttiIPiani(documento, livelloId, id, nuovoId);
    if (!r) continue;
    documento = r.documento;
    aggiunti += r.aggiunti;
    giaPresenti += r.giaPresenti;
  }
  return { documento, aggiunti, giaPresenti };
}
