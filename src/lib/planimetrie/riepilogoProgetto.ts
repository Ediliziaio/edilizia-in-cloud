/**
 * Il riepilogo che apre la scheda della planimetria (24/11/2026): in poche righe quello che
 * una tavola di progetto dice per prima, superfici per piano e unità con tipo e m², come le
 * tavole dei progettisti («INT. 04 · Bilocale · S.U. 44,00»).
 */
import { geometriaPiano } from "../../../shared/planimetrie/costruzione.ts";
import { areaPoligono } from "../../../shared/planimetrie/geometria.ts";
import { ambitiDi, eAmbienteInterno, statoDelLivello, type Planimetria, type UnitaDichiarata } from "../../../shared/planimetrie/modello.ts";

export interface PianoRiepilogo { id: string; nome: string; stanze: number; nettaMq: number; lordaMq: number }
export interface UnitaRiepilogo {
  nome: string; tipo: string; piani: string[]; stanze: number; camere: number; bagni: number; nettaMq: number;
  /** Dalla legenda della tavola, se c'è: quello che il progettista dichiara. */
  dichiarata?: UnitaDichiarata;
  /** Misurata meno dichiarata (S.U.), m²: negativo = mancano stanze o pezzi di stanza. */
  scartoMq?: number;
  /** La misura torna con la legenda (entro il 10%, o 2 m²). */
  torna?: boolean;
}

/** «Int. 04», «INT 4», «int.04» sono la stessa unità. */
export function chiaveUnita(nome: string): string {
  const numero = nome.match(/\d+/)?.[0];
  return numero ? `${nome.replace(/[\d\s.]+/g, "").toLowerCase()}:${Number(numero)}` : nome.trim().toLowerCase();
}

function confronto(dichiarata: UnitaDichiarata | undefined, nettaMq: number): Pick<UnitaRiepilogo, "dichiarata" | "scartoMq" | "torna"> {
  if (!dichiarata) return {};
  if (dichiarata.suMq === undefined) return { dichiarata };
  const scarto = arrotonda(nettaMq - dichiarata.suMq);
  return { dichiarata, scartoMq: scarto, torna: Math.abs(scarto) <= Math.max(dichiarata.suMq * 0.1, 2) };
}
export interface RiepilogoProgetto { piani: PianoRiepilogo[]; unita: UnitaRiepilogo[]; nettaMq: number; lordaMq: number; senzaUnitaMq: number }

const arrotonda = (n: number) => Math.round(n * 100) / 100;

/** Il tipo dell'alloggio dalle camere: monolocale, bilocale, trilocale, quadrilocale e oltre. */
export function tipoAlloggio(camere: number): string {
  return camere <= 0 ? "Monolocale" : camere === 1 ? "Bilocale" : camere === 2 ? "Trilocale" : camere === 3 ? "Quadrilocale" : `${camere + 1} locali`;
}

const eCamera = (l: { destinazione: string; nome: string }) => l.destinazione === "camera" || /\bletto\b|camer/i.test(l.nome);
const eBagno = (l: { destinazione: string; nome: string }) => l.destinazione === "bagno" || /bagn/i.test(l.nome);

/** `chiave` è l'ambito della pagina: «fatto» o «progetto:<variante>». */
export function riepilogoProgetto(doc: Planimetria, chiave: string): RiepilogoProgetto {
  const ambito = ambitiDi(doc).find((a) => a.chiave === chiave) ?? ambitiDi(doc)[0];
  const piani: PianoRiepilogo[] = [];
  const unita = new Map<string, UnitaRiepilogo>();
  let senzaUnita = 0;
  for (const livello of [...doc.livelli].sort((a, b) => b.quota - a.quota)) {
    const stato = statoDelLivello(livello, ambito) ?? livello.fatto;
    const interni = stato.locali.filter((l) => eAmbienteInterno(l));
    const netta = interni.reduce((s, l) => s + areaPoligono(l.contorno) / 10_000, 0);
    const lorda = stato.muri.length ? geometriaPiano(stato.muri, stato.locali).lordaMq : 0;
    piani.push({ id: livello.id, nome: livello.nome, stanze: interni.length, nettaMq: arrotonda(netta), lordaMq: arrotonda(lorda) });
    for (const l of interni) {
      const mq = areaPoligono(l.contorno) / 10_000;
      const nome = l.unita?.trim();
      if (!nome) { senzaUnita += mq; continue; }
      const u = unita.get(nome) ?? { nome, tipo: "", piani: [], stanze: 0, camere: 0, bagni: 0, nettaMq: 0 };
      u.stanze++;
      if (eCamera(l)) u.camere++;
      if (eBagno(l)) u.bagni++;
      u.nettaMq += mq;
      if (!u.piani.includes(livello.nome)) u.piani.push(livello.nome);
      unita.set(nome, u);
    }
  }
  // Un alloggio senza bagno è disegnato a metà: dargli un tipo direbbe una cosa falsa.
  const legenda = new Map((doc.unitaDichiarate ?? []).map((u) => [chiaveUnita(u.nome), u]));
  const elenco: UnitaRiepilogo[] = [...unita.values()].map((u) => {
    const dichiarata = legenda.get(chiaveUnita(u.nome));
    legenda.delete(chiaveUnita(u.nome));
    return { ...u, tipo: u.bagni ? tipoAlloggio(u.camere) : "Da completare", nettaMq: arrotonda(u.nettaMq), ...confronto(dichiarata, u.nettaMq) };
  });
  // Le unità della legenda che la pianta non ha trovato: si vedono, a zero, invece di sparire.
  for (const d of legenda.values()) {
    elenco.push({ nome: d.nome, tipo: "Da completare", piani: [], stanze: 0, camere: 0, bagni: 0, nettaMq: 0, ...confronto(d, 0) });
  }
  elenco.sort((a, b) => a.nome.localeCompare(b.nome, "it", { numeric: true }));
  return {
    piani, unita: elenco,
    nettaMq: arrotonda(piani.reduce((s, p) => s + p.nettaMq, 0)),
    lordaMq: arrotonda(piani.reduce((s, p) => s + p.lordaMq, 0)),
    senzaUnitaMq: arrotonda(senzaUnita),
  };
}
