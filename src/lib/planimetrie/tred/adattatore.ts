/**
 * Dal modello della planimetria (fase 1, `shared/planimetrie/modello.ts`, spiegato in
 * docs/planimetrie/modello.md) a ciò che il 3D legge (`PiantaPer3D`).
 *
 * Conversioni:
 *  - il modello ha y verso l'alto (come il DXF), il 3D legge y verso il basso (come lo
 *    schermo): y cambia segno. In 3D il punto (x, y) del modello finisce in
 *    (x/100, 0, -y/100), così dall'alto si rivede la pianta col suo «su» in cima;
 *  - aperture: il modello dà `offset` (inizio del vano dal p1), il 3D il centro;
 *  - elementi: il modello gira in senso antiorario e a 0° ha il retro verso il basso
 *    della pianta (negli esempi il wc contro il muro in alto ha 180°, la cucina contro
 *    il muro in basso 0°); il 3D gira in senso orario con il retro verso l'alto a 0°;
 *  - stati: `da_demolire` → `demolire`; `varco` è un'apertura senza infisso.
 *
 * Il livello si disegna alla sua quota zero: un livello per volta.
 */
import type { Elemento, Livello, Planimetria, StatoLavori, StatoPianta } from "../../../../shared/planimetrie/modello.ts";
import type { PiantaPer3D, StatoOggetto } from "./tipi";

const stato = (s: StatoLavori | undefined): StatoOggetto => (s === "da_demolire" ? "demolire" : s === "nuovo" ? "nuovo" : "esistente");
const giu = (p: { x: number; y: number }) => ({ x: p.x, y: -p.y });

/** Rotazione del modello (antioraria, retro in basso a 0°) → rotazione del 3D (oraria, retro in alto a 0°). */
export const rotazione3D = (gradi: number) => (((180 - gradi) % 360) + 360) % 360;

export function daStatoPianta(s: StatoPianta): PiantaPer3D {
  return {
    muri: s.muri.map((m) => ({ id: m.id, a: giu(m.p1), b: giu(m.p2), spessore: m.spessore, altezza: m.altezza, stato: stato(m.stato) })),
    aperture: s.aperture.map((a) => ({
      id: a.id,
      muroId: a.muroId,
      tipo: a.tipo,
      posizione: a.offset + a.larghezza / 2,
      larghezza: a.larghezza,
      altezza: a.altezza,
      davanzale: a.davanzale,
      stato: stato(a.stato),
    })),
    locali: s.locali.map((l) => ({ id: l.id, nome: l.nome, destinazione: l.destinazione, contorno: l.contorno.map(giu), altezza: l.altezza })),
    elementi: s.elementi.map(daElemento),
  };
}

function daElemento(e: Elemento) {
  return {
    id: e.id,
    tipo: e.tipo,
    centro: giu(e.posizione),
    rotazione: rotazione3D(e.rotazione),
    larghezza: e.larghezza,
    profondita: e.profondita,
    altezza: e.altezza,
    localeId: e.localeId ?? undefined,
  };
}

/**
 * Le due piante che il visore mostra: lo stato di fatto e il progetto (la proposta
 * scelta, o la prima; senza proposte il progetto è il fatto).
 */
export function pianteDaPlanimetria(p: Planimetria, scelta: { livelloId?: string; propostaId?: string } = {}): { fatto: PiantaPer3D; progetto: PiantaPer3D; livello: Livello | null } {
  const livello = (scelta.livelloId ? p.livelli.find((l) => l.id === scelta.livelloId) : undefined) ?? p.livelli[0] ?? null;
  if (!livello) {
    const vuota: PiantaPer3D = { muri: [], aperture: [], locali: [], elementi: [] };
    return { fatto: vuota, progetto: vuota, livello: null };
  }
  const fatto = daStatoPianta(livello.fatto);
  const proposta = (scelta.propostaId ? livello.proposte.find((pr) => pr.id === scelta.propostaId) : undefined) ?? livello.proposte[0];
  return { fatto, progetto: proposta ? daStatoPianta(proposta) : fatto, livello };
}
