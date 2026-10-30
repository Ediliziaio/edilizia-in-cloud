/**
 * Dal modello della planimetria a ciò che il 3D legge (`PiantaPer3D`).
 *
 * PROVVISORIO. Il modello vero lo scrive la fase 1 in `shared/planimetrie/`; finché
 * non c'è, qui sotto c'è un'interfaccia che segue lo schema del piano
 * (docs/superpowers/specs/2026-10-30-planimetrie-design.md, «Scelte» 1): muri con
 * asse p1→p2, aperture su un muro, locali con contorno, elementi. Quando il modello
 * della fase 1 arriva cambia solo questo file: il resto del 3D legge `PiantaPer3D`.
 */
import type { PiantaPer3D, StatoOggetto, TipoApertura } from "./tipi";

export interface PuntoCm {
  x: number;
  y: number;
}

export interface PlanimetriaProvvisoria {
  unita: "cm";
  livelli: LivelloProvvisorio[];
}

export interface LivelloProvvisorio {
  id: string;
  nome: string;
  muri: {
    id: string;
    p1: PuntoCm;
    p2: PuntoCm;
    spessore: number;
    altezza: number;
    tipo?: "portante" | "tramezzo";
    stato?: StatoOggetto;
  }[];
  aperture: {
    id: string;
    muroId: string;
    tipo: TipoApertura;
    /** Distanza del centro da p1 del muro, in cm. */
    posizione: number;
    larghezza: number;
    altezza: number;
    davanzale?: number;
    stato?: StatoOggetto;
  }[];
  locali: {
    id: string;
    nome: string;
    destinazione: string;
    contorno: PuntoCm[];
    altezza: number;
  }[];
  elementi?: {
    id: string;
    tipo: string;
    posizione: PuntoCm;
    rotazione?: number;
    larghezza?: number;
    profondita?: number;
    altezza?: number;
    localeId?: string;
  }[];
}

export function daPlanimetria(p: PlanimetriaProvvisoria, livelloId?: string): PiantaPer3D {
  const livello = (livelloId ? p.livelli.find((l) => l.id === livelloId) : undefined) ?? p.livelli[0];
  if (!livello) return { muri: [], aperture: [], locali: [], elementi: [] };
  return {
    muri: livello.muri.map((m) => ({ id: m.id, a: m.p1, b: m.p2, spessore: m.spessore, altezza: m.altezza, stato: m.stato ?? "esistente" })),
    aperture: livello.aperture.map((a) => ({
      id: a.id,
      muroId: a.muroId,
      tipo: a.tipo,
      posizione: a.posizione,
      larghezza: a.larghezza,
      altezza: a.altezza,
      davanzale: a.davanzale ?? (a.tipo === "finestra" ? 100 : 0),
      stato: a.stato ?? "esistente",
    })),
    locali: livello.locali.map((l) => ({ id: l.id, nome: l.nome, destinazione: l.destinazione, contorno: l.contorno, altezza: l.altezza })),
    elementi: (livello.elementi ?? []).map((e) => ({
      id: e.id,
      tipo: e.tipo,
      centro: e.posizione,
      rotazione: e.rotazione ?? 0,
      larghezza: e.larghezza,
      profondita: e.profondita,
      altezza: e.altezza,
      localeId: e.localeId,
    })),
  };
}
