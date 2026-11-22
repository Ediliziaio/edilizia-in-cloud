import { capovolgi, daPlanimetria, elementoAModello, prossimaProposta } from "@/components/planimetrie/editor/adattatore";
import { arredaStanza } from "@/components/planimetrie/editor/arreda";
import { areaPoligono, puntoNelPoligono } from "../../../shared/planimetrie/geometria.ts";
import {
  SANITARI_BAGNO, scalaModelloDaVerificare, type Elemento, type Livello, type Locale, type Planimetria,
  type Proposta, type SpostamentoBagno, type TipoSanitarioBagno,
} from "../../../shared/planimetrie/modello.ts";

export const NOMI_SANITARI: Record<TipoSanitarioBagno, string> = {
  wc: "WC", lavabo: "Lavabo", doccia: "Doccia", bidet: "Bidet", vasca: "Vasca",
};

const chiuso = (l: Locale) => !l.aperto && !["balcone", "terrazzo", "giardino"].includes(l.destinazione)
  && areaPoligono(l.contorno) > 0;

export function localiPerSpostamento(piano: Livello, daVariante?: string) {
  const proposta = piano.proposte.find(p => p.id === daVariante);
  const stato = proposta ?? piano.fatto;
  const occupati = new Set([...(proposta?.spostamentiBagno ?? []), ...(proposta?.spostamentiCucina ?? [])].flatMap(s => [s.origineId, s.destinazioneId]));
  const disponibili = stato.locali.filter(l => chiuso(l) && !occupati.has(l.id));
  const origini = piano.fatto.locali.filter(l => chiuso(l) && disponibili.some(d => d.id === l.id));
  return { origini, destinazioni: disponibili.filter(l => l.destinazione !== "bagno") };
}

export function sanitariNelLocale(elementi: Elemento[], locale: Locale): Elemento[] {
  return elementi.filter(e => e.stato !== "da_demolire" && (SANITARI_BAGNO as readonly string[]).includes(e.tipo)
    && puntoNelPoligono(e.posizione, locale.contorno));
}

interface RichiestaSpostamento {
  livelloId: string;
  daVariante?: string;
  origineId: string;
  destinazioneId: string;
  confermaBagno?: boolean;
  sanitari: readonly TipoSanitarioBagno[];
  altezzaRivestimentoCm?: number;
}

export function creaVarianteSpostamentoBagno(doc: Planimetria, richiesta: RichiestaSpostamento) {
  const piano = doc.livelli.find(l => l.id === richiesta.livelloId);
  if (!piano) throw new Error("Seleziona il piano del bagno.");
  const { origini, destinazioni } = localiPerSpostamento(piano, richiesta.daVariante);
  const prima = origini.find(l => l.id === richiesta.origineId);
  const nuova = destinazioni.find(l => l.id === richiesta.destinazioneId);
  if (!prima || !nuova || prima.id === nuova.id) throw new Error("Scegli due locali distinti sullo stesso piano.");
  if (prima.destinazione !== "bagno" && !richiesta.confermaBagno) throw new Error("Conferma il bagno attuale sulla tavola.");
  const sanitari = SANITARI_BAGNO.filter(t => richiesta.sanitari.includes(t));
  if (!sanitari.length) throw new Error("Scegli almeno un sanitario.");
  const altezza = richiesta.altezzaRivestimentoCm;
  if (altezza !== undefined && (!Number.isFinite(altezza) || altezza <= 0 || altezza > nuova.altezza)) {
    throw new Error("Inserisci un’altezza di rivestimento compatibile con il nuovo bagno.");
  }

  const id = prossimaProposta({ proposte: doc.livelli.flatMap(l => l.proposte) });
  const nome = `Sposta bagno · ${piano.nome}`;
  const esistente = piano.proposte.find(p => p.id === richiesta.daVariante);
  const base = esistente ?? piano.fatto;
  const intervento: SpostamentoBagno = { id: crypto.randomUUID(), origineId: prima.id, destinazioneId: nuova.id, sanitari };
  const rimossi = new Set(sanitariNelLocale(base.elementi, prima).map(e => e.id));
  const proposta: Proposta = {
    ...base, id, nome,
    spostamentiBagno: [...(esistente?.spostamentiBagno ?? []), intervento],
    locali: base.locali.map(l => {
      if (l.id === prima.id) return { ...l, nome: "Ripostiglio", destinazione: "ripostiglio" };
      if (l.id !== nuova.id) return l;
      return { ...l, nome: "Bagno", destinazione: "bagno",
        finiture: { ...l.finiture, rivestimento: altezza ? { materiale: l.finiture?.rivestimento?.materiale, altezza } : null } };
    }),
    elementi: base.elementi.filter(e => !rimossi.has(e.id)),
  };
  const originale = prima.destinazione === "bagno" ? piano.fatto : {
    ...piano.fatto, locali: piano.fatto.locali.map(l => l.id === prima.id ? { ...l, nome: "Bagno", destinazione: "bagno" as const } : l),
  };
  const documento: Planimetria = { ...doc, livelli: doc.livelli.map(l => {
    if (l.id === piano.id) return { ...l, fatto: originale, proposte: [...l.proposte, proposta] };
    const copia = l.proposte.find(p => p.id === richiesta.daVariante);
    return copia ? { ...l, proposte: [...l.proposte, { ...copia, id, nome }] } : l;
  }) };

  if (!scalaModelloDaVerificare(piano)) {
    const pianta = daPlanimetria(documento, piano.id, id);
    const disposizione = arredaStanza(pianta, nuova.id, "progetto", "bagno", {
      programma: [...sanitari].sort((a, b) => Number(b === "doccia" || b === "vasca") - Number(a === "doccia" || a === "vasca"))
        .map(tipo => ({ tipo, angolo: tipo === "doccia" || tipo === "vasca" })),
    });
    const inseriti = new Set(disposizione.aggiunti);
    proposta.elementi.push(...(disposizione.pianta.elementi ?? [])
      .filter(e => inseriti.has(e.id) && puntoNelPoligono(capovolgi(e.centro), nuova.contorno))
      .map(e => ({ ...elementoAModello(e, "nuovo"), origine: "stimata" as const, localeId: nuova.id })));
  }
  return { documento, id };
}
