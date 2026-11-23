import { capovolgi, daPlanimetria, elementoAModello, prossimaProposta } from "@/components/planimetrie/editor/adattatore";
import { arredaStanza } from "@/components/planimetrie/editor/arreda";
import { areaPoligono, puntoNelPoligono } from "../../../shared/planimetrie/geometria.ts";
import { scalaModelloDaVerificare, type Livello, type Planimetria, type Proposta } from "../../../shared/planimetrie/modello.ts";

const ATTREZZATURA_CUCINA = new Set(["cucina", "cucina_angolare", "lavello", "forno", "frigorifero", "lavastoviglie"]);

export function localiPerSpostareCucina(piano: Livello, varianteId?: string) {
  const p = piano.proposte.find(p => p.id === varianteId);
  const occupati = new Set([...(p?.spostamentiCucina ?? []), ...(p?.spostamentiBagno ?? [])].flatMap(s => [s.origineId,s.destinazioneId]));
  const disponibili = (p ?? piano.fatto).locali.filter(l => !occupati.has(l.id) && areaPoligono(l.contorno) > 0
    && !["balcone","terrazzo","giardino"].includes(l.destinazione));
  return {
    origini: disponibili.filter(l => l.destinazione === "cucina" && piano.fatto.locali.some(f => f.id === l.id)),
    destinazioni: disponibili.filter(l => l.destinazione !== "cucina" && l.destinazione !== "bagno"),
  };
}

/** Conserva l'identificativo della variante per riprendere le voci già lavorate nelle revisioni. */
export function spostaCucina(doc: Planimetria, richiesta: {
  livelloId: string; varianteId?: string; origineId: string; destinazioneId: string;
}) {
  const piano = doc.livelli.find(l => l.id === richiesta.livelloId);
  if (!piano) throw new Error("Seleziona il piano della cucina.");
  const { origini, destinazioni } = localiPerSpostareCucina(piano, richiesta.varianteId);
  const origine = origini.find(l => l.id === richiesta.origineId);
  const destinazione = destinazioni.find(l => l.id === richiesta.destinazioneId);
  if (!origine || !destinazione) throw new Error("Scegli la cucina attuale e il locale di destinazione.");

  const esistenti = doc.livelli.flatMap(l => l.proposte);
  const id = richiesta.varianteId ?? prossimaProposta({ proposte:esistenti });
  const nome = esistenti.find(p => p.id === id)?.nome ?? `Sposta cucina · ${piano.nome}`;
  const corrente = piano.proposte.find(p => p.id === id);
  const base = corrente ?? piano.fatto;
  const spostamento = { id:crypto.randomUUID(), origineId:origine.id, destinazioneId:destinazione.id };
  const proposta: Proposta = {
    ...base, id, nome,
    spostamentiCucina: [...(corrente?.spostamentiCucina ?? []), spostamento],
    locali: base.locali.map(l => l.id === origine.id ? { ...l, nome:"Zona pranzo", destinazione:"soggiorno" }
      : l.id === destinazione.id ? { ...l, nome:"Cucina", destinazione:"cucina" } : l),
    elementi: base.elementi.filter(e => !(ATTREZZATURA_CUCINA.has(e.tipo) && puntoNelPoligono(e.posizione, origine.contorno))),
  };
  const documento: Planimetria = { ...doc, livelli: doc.livelli.map(l => l.id === piano.id ? {
    ...l, proposte: corrente ? l.proposte.map(p => p.id === id ? proposta : p) : [...l.proposte, proposta],
  } : l) };

  if (!scalaModelloDaVerificare(piano)) {
    const pianta = daPlanimetria(documento, piano.id, id);
    const disegno = arredaStanza(pianta, destinazione.id, "progetto", "cucina", { programma:[{ tipo:"cucina", larghezzaMinima:120 }] });
    const nuovi = new Set(disegno.aggiunti);
    proposta.elementi.push(...(disegno.pianta.elementi ?? [])
      .filter(e => nuovi.has(e.id) && puntoNelPoligono(capovolgi(e.centro),destinazione.contorno))
      .map(e => ({ ...elementoAModello(e,"nuovo"), origine:"stimata" as const, localeId:destinazione.id })));
  }
  return { documento, id };
}
