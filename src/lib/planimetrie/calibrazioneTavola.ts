import { distanza } from "../../../shared/planimetrie/geometria.ts";
import { validaPlanimetria, type Planimetria, type Punto, type Ricalco, type StatoPianta } from "../../../shared/planimetrie/modello.ts";

/** Primo estremo fisso, in coordinate documento (y verso l'alto). */
export function calibraRicalco(ricalco: Ricalco, primo: Punto, secondo: Punto, distanzaCm: number, confermata: boolean): Ricalco {
  const misurata = distanza(primo, secondo);
  const larghezzaCm = ricalco.larghezzaCm * distanzaCm / misurata;
  if (!Number.isFinite(larghezzaCm) || larghezzaCm < 1) throw new Error("Scegli due punti distinti e una distanza valida.");
  const k = larghezzaCm / ricalco.larghezzaCm;
  return {
    ...ricalco, larghezzaCm, calibrata: confermata,
    x: primo.x + (ricalco.x - primo.x) * k,
    y: primo.y + (ricalco.y - primo.y) * k,
  };
}

/** Porta il disegno sulla stessa trasformazione orizzontale della sua immagine. */
export function riallineaPianoAllaTavola(documento: Planimetria, livelloId: string, prima: Ricalco, dopo: Ricalco): Planimetria {
  const livello = documento.livelli.find(l => l.id === livelloId);
  if (!livello || livello.tavolaDwg || prima.bloccata || prima.percorso !== dopo.percorso || prima.proporzione !== dopo.proporzione) {
    throw new Error("Il disegno si può ridimensionare insieme alla sua tavola sbloccata.");
  }
  const k = dopo.larghezzaCm / prima.larghezzaCm;
  const punto = ({ x, y }: Punto): Punto => ({ x: dopo.x + (x - prima.x) * k, y: dopo.y + (y - prima.y) * k });
  const scala = (s: StatoPianta): StatoPianta => ({
    muri: s.muri.map(m => ({
      ...m, p1: punto(m.p1), p2: punto(m.p2), spessore: m.spessore * k,
      origineMisure: { ...m.origineMisure, lunghezza: "stimata", spessore: "stimata" },
    })),
    aperture: s.aperture.map(a => ({
      ...a, offset: a.offset * k, larghezza: a.larghezza * k,
      origineMisure: { ...a.origineMisure, offset: "stimata", larghezza: "stimata" },
    })),
    locali: s.locali.map(l => ({ ...l, contorno: l.contorno.map(punto), origineMisure: { ...l.origineMisure, contorno: "stimata" } })),
    elementi: s.elementi.map(e => ({
      ...e, posizione: punto(e.posizione), larghezza: e.larghezza * k, profondita: e.profondita * k,
      origineMisure: { ...e.origineMisure, posizione: "stimata", larghezza: "stimata", profondita: "stimata" },
    })),
    quote: s.quote.map(q => ({ ...q, p1: punto(q.p1), p2: punto(q.p2), scostamento: q.scostamento * k, origine: "stimata" })),
    testi: s.testi.map(t => ({ ...t, posizione: punto(t.posizione) })),
    aree: s.aree?.map(a => ({ ...a, contorno: a.contorno.map(punto) })),
    tracciatiImpianti: s.tracciatiImpianti?.map(t => ({ ...t, vertici: t.vertici.map(punto) })),
    collettoreRadiante: s.collettoreRadiante && { ...s.collettoreRadiante, posizione: punto(s.collettoreRadiante.posizione) },
  });
  const nuovo: Planimetria = {
    ...documento,
    livelli: documento.livelli.map(l => l.id !== livelloId ? l : {
      ...l, ricalco: dopo, riscontroScala: { stato: "da_verificare" },
      fatto: scala(l.fatto), proposte: l.proposte.map(p => ({ ...p, ...scala(p) })),
    }),
  };
  const esito = validaPlanimetria(nuovo);
  if (esito.ok === false) throw new Error(esito.errori[0]);
  return nuovo;
}
