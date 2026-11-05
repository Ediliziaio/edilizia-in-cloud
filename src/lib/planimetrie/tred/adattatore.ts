import { materialiDelProgetto, statoConMateriali } from "../../../../shared/planimetrie/materialiProgetto.ts";
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
import { puntiTerreno } from "../../../../shared/planimetrie/terreno.ts";
import type { Apertura, Elemento, Livello, Planimetria, StatoLavori, StatoPianta } from "../../../../shared/planimetrie/modello.ts";
import type { PiantaPer3D, StatoOggetto } from "./tipi";
import { anteDi, eScorrevole, misureOscurante, sistemaDi, zanzarieraDi } from "../../../../shared/planimetrie/serramenti.ts";

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
      ...(a.ante !== undefined || a.sistema !== undefined ? { ante: anteDi(a), scorrevole: eScorrevole(sistemaDi(a)) } : {}),
      ...oscurante3D(a),
      ...zanzariera3D(a),
    })),
    locali: s.locali.map((l) => ({ id: l.id, nome: l.nome, destinazione: l.destinazione, contorno: l.contorno.map(giu), altezza: l.altezza, ...(l.finiture ? { finiture: l.finiture } : {}) })),
    elementi: s.elementi.map(daElemento),
    ...(s.aree?.length ? { aree: s.aree.filter((a) => a.stato !== "da_demolire").map((a) => ({ id: a.id, tipo: a.tipo, contorno: a.contorno.map(giu), recinzione: a.recinzione, quota: a.quota })) } : {}),
  };
}

function oscurante3D(a: Apertura): { oscurante?: NonNullable<import("./tipi").AperturaPer3D["oscurante"]> } {
  const o = misureOscurante(a);
  if (!o) return {};
  return { oscurante: { tipo: o.tipo, ante: o.ante, ...(o.cassonetto ? { cassonetto: { tipo: o.cassonetto.tipo, altezza: o.cassonetto.altezza, profondita: o.cassonetto.profondita } } : {}) } };
}

function zanzariera3D(a: Apertura): { zanzariera?: NonNullable<import("./tipi").AperturaPer3D["zanzariera"]> } {
  const z = zanzarieraDi(a);
  if (!z) return {};
  const o = misureOscurante(a);
  return { zanzariera: { tipo: z, altezzaPersa: o?.cassonetto?.tipo === "monoblocco" ? o.cassonetto.altezza : 0 } };
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
export function pianteDaPlanimetria(p: Planimetria, scelta: { livelloId?: string; propostaId?: string; materialiAmbito?: string } = {}): { fatto: PiantaPer3D; progetto: PiantaPer3D; livello: Livello | null } {
  const livello = (scelta.livelloId ? p.livelli.find((l) => l.id === scelta.livelloId) : undefined) ?? p.livelli[0] ?? null;
  if (!livello) {
    const vuota: PiantaPer3D = { muri: [], aperture: [], locali: [], elementi: [] };
    return { fatto: vuota, progetto: vuota, livello: null };
  }
  const materialiFatto = materialiDelProgetto(p, scelta.materialiAmbito ?? "fatto");
  const fatto = { ...daStatoPianta(statoConMateriali(livello.fatto, materialiFatto)), infissiProgetto: materialiFatto.infissi };
  const proposta = (scelta.propostaId ? livello.proposte.find((pr) => pr.id === scelta.propostaId) : undefined) ?? livello.proposte[0];
  // una proposta fatta prima delle aree esterne non le ha: valgono quelle di oggi
  const materialiProposta = proposta ? materialiDelProgetto(p, scelta.materialiAmbito ?? `progetto:${proposta.id}`) : materialiFatto;
  const statoProposta = proposta ? (proposta.aree === undefined && livello.fatto.aree ? { ...proposta, aree: livello.fatto.aree } : proposta) : livello.fatto;
  const progetto = { ...daStatoPianta(statoConMateriali(statoProposta, materialiProposta)), infissiProgetto: materialiProposta.infissi };
  // il tetto è del piano, uguale oggi e nel progetto; il terreno è di tutta la pianta
  const punti = puntiTerreno(p).map((q) => ({ x: q.x, y: -q.y, quota: q.quota }));
  const extra = { ...(livello.tetto ? { tetto: livello.tetto } : {}), ...(punti.length ? { terreno: punti } : {}) };
  return { fatto: { ...fatto, ...extra }, progetto: { ...progetto, ...extra }, livello };
}
