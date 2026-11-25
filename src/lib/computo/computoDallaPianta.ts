import { calcolaQuantita } from "../../../shared/planimetrie/quantita.ts";
import { originePeggiore, type Apertura, type Muro, type Origine, type Planimetria, type PrezzoVocePlanimetria } from "../../../shared/planimetrie/modello.ts";
import { chiaveLavoro, lavoriDaPianta, nomeGenere, stanzaDelMuro, type Lavoro, type OggettoLavoro } from "@/lib/planimetrie/primaEDopo";
import { QUANTITA_LOCALI, chiaveLocale, unitaComputo } from "@/lib/planimetrie/computo";
import { eLavorazioneIndotta, studioVariante, type RigaStudio } from "@/lib/planimetrie/studioImmobiliare";
import { conPrezziProposti, tipiDaCercare, type FontiPrezzi, type TipoLavorazione } from "@/lib/planimetrie/prezziProposti";
import {
  arrotondaDecimale, calcolaVoce, MAX_MISURE_VOCE, misuraVuota, voceVuota,
  type BozzaComputo, type MisuraEditor, type VoceEditor,
} from "./editorNativo";

export type OrigineComputoPianta = NonNullable<BozzaComputo["piantaOrigine"]>;

/** La scheda della pianta riapre la stessa bozza per livello e proposta. */
export async function idComputoDallaPianta(origine: Pick<OrigineComputoPianta, "id" | "livelloId" | "propostaId">) {
  const nome = JSON.stringify(["computo-dalla-pianta", origine.id, origine.livelloId, origine.propostaId]);
  const byte = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(nome)));
  byte[6] = (byte[6] & 0x0f) | 0x80;
  byte[8] = (byte[8] & 0x3f) | 0x80;
  const h = Array.from(byte.slice(0, 16), n => n.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export type MisuraPropostaDallaPianta = {
  chiave: string;
  nome: string;
  riferimento: string;
  capitolo: string;
  unita: VoceEditor["unita"];
  quantita: number;
  origine: Origine;
  oggetto?: OggettoLavoro;
  calcolo?: string;
  chiavePrecedente?: string;
  soloEsistente?: boolean;
  /** Il prezzo proposto, come nello studio della variante (listino aziendale, poi prezzo indicativo). */
  prezzo?: PrezzoVocePlanimetria;
};

const UNITA_STUDIO: Record<RigaStudio["unita"], VoceEditor["unita"]> = { "m²": "mq", "m³": "mc", m: "ml", cad: "pz", "a corpo": "a corpo" };

/** Le righe dello studio che il computo prende dalla pianta: pareti, aperture e ciò che le pareti si portano dietro. */
const righeOpere = (doc: Planimetria, livelloId: string, propostaId: string) => studioVariante(doc, propostaId).righe
  .filter(r => r.livelloId === livelloId && (r.riferimento?.tipo === "muro" || r.riferimento?.tipo === "apertura"));

/** Le lavorazioni da cercare nel listino per quotare le misure di questo progetto. */
export function tipiDaQuotare(doc: Planimetria, origine: Pick<OrigineComputoPianta, "livelloId" | "propostaId">): TipoLavorazione[] {
  return origine.propostaId ? tipiDaCercare(righeOpere(doc, origine.livelloId, origine.propostaId)) : [];
}

/**
 * Le misure che la pianta propone al computo (24/11/2026). Pareti, aperture e lavorazioni indotte
 * (macerie, ripristino, intonaco, tinteggiatura, battiscopa) vengono dalle stesse righe dello studio
 * della variante, con le stesse quantità; con `fonti` arrivano già quotate come lì (`conPrezziProposti`:
 * prezzo scritto nella variante, listino aziendale, prezzo indicativo dichiarato). Senza `fonti`
 * (chi non vede gli importi) restano senza prezzo.
 *
 * Le chiavi restano quelle di prima (`opera:<tipo>:<id>:<operazione>`, più `:<lavorazione>` per le
 * indotte) e `chiavePrecedente` quella di «Prima e dopo»: le bozze già salvate si ricollegano.
 */
export function misureDalProgetto(doc: Planimetria, origine: OrigineComputoPianta, fonti: FontiPrezzi | null = null): MisuraPropostaDallaPianta[] {
  const livello = doc.livelli.find(l => l.id === origine.livelloId);
  if (!livello) throw new Error("Il piano collegato è stato rimosso dalla planimetria.");
  const proposta = livello.proposte.find(p => p.id === origine.propostaId);
  if (origine.propostaId && !proposta) throw new Error("La proposta collegata è stata rimossa dalla planimetria.");
  const misure: MisuraPropostaDallaPianta[] = [];
  if (proposta) {
    type Precedente = { stanza: string; lavoro: Lavoro; origine: Origine; calcolo?: string };
    const precedenti = new Map<string, Precedente>();
    const lavori = lavoriDaPianta(doc, livello.id, proposta.id, (stanza, lavoro, dettaglio) => {
      const { oggetto, operazione } = dettaglio;
      const chiave = `opera:${oggetto.tipo}:${oggetto.id}:${operazione}`;
      if (oggetto.tipo === "muro" || oggetto.tipo === "apertura") {
        precedenti.set(chiave, { stanza, lavoro, origine: dettaglio.origine, calcolo: dettaglio.calcolo });
        return;
      }
      if (lavoro.quantita <= 0) return;
      misure.push({
        chiave, chiavePrecedente: chiaveLavoro(stanza, lavoro),
        nome: lavoro.descrizione, riferimento: stanza, capitolo: nomeGenere(lavoro.genere),
        unita: lavoro.unita === "n" ? "pz" : lavoro.unita, quantita: lavoro.quantita,
        origine: dettaglio.origine, oggetto, calcolo: dettaglio.calcolo,
      });
    });
    const righe = righeOpere(doc, livello.id, proposta.id).map(r => fonti ? r : { ...r, prezzo: undefined });
    const opere: MisuraPropostaDallaPianta[] = [];
    for (const r of fonti ? conPrezziProposti(righe, fonti) : righe) {
      const { tipo, id } = r.riferimento!;
      const oggetto = tipo === "muro" ? proposta.muri.find(m => m.id === id) : proposta.aperture.find(a => a.id === id);
      if (!oggetto) continue;
      const base = `opera:${tipo}:${id}:${oggetto.stato}:${oggetto.tipo}`;
      const indotta = r.id !== id && eLavorazioneIndotta(r);
      const chiave = indotta ? `${base}:${r.id.slice(id.length + 1)}` : base;
      const prima = precedenti.get(base);
      const muro = tipo === "muro" ? oggetto as Muro : proposta.muri.find(m => m.id === (oggetto as Apertura).muroId);
      const stanza = prima?.stanza ?? (muro && stanzaDelMuro(muro, proposta.locali, livello.fatto.locali)) ?? "Generale";
      // Quantità sospesa nello studio (scala, struttura o funzione da riscontrare): il computo tiene
      // la misura geometrica, dichiarata stimata, invece di perdere la voce.
      const sospesa = r.quantita === null;
      if (sospesa && (indotta || !prima)) continue;
      const quantita = sospesa ? prima!.lavoro.quantita : r.quantita!;
      const unita = sospesa ? (prima!.lavoro.unita === "n" ? "pz" : prima!.lavoro.unita) : UNITA_STUDIO[r.unita];
      if (quantita <= 0) continue;
      const prezzo = r.prezzo && unitaComputo(UNITA_STUDIO[r.unita]) === unitaComputo(unita) ? r.prezzo : undefined;
      opere.push({
        chiave, nome: r.descrizione, riferimento: stanza, capitolo: r.fase, unita, quantita,
        chiavePrecedente: !indotta && prima ? chiaveLavoro(prima.stanza, prima.lavoro) : `${stanza}|${r.descrizione}|${unita}`,
        origine: sospesa || r.stimata ? "stimata" : prima?.origine ?? "rilevata",
        oggetto: { tipo, id }, calcolo: sospesa ? prima!.calcolo : r.criterio,
        ...(prezzo ? { prezzo } : {}),
      });
    }
    misure.unshift(...opere);
    // Le vecchie bozze potevano già contenere una stima dei percorsi impiantistici.
    // I nuovi computi prendono i punti disegnati e possono aggiungere i metri a mano.
    for (const stanza of lavori.stanze.filter(s => s.stanza.startsWith("Impianti, tutta la casa"))) {
      for (const lavoro of stanza.lavori) misure.push({
        chiave: chiaveLavoro(stanza.stanza, lavoro), nome: lavoro.descrizione, riferimento: stanza.stanza,
        capitolo: nomeGenere(lavoro.genere), unita: lavoro.unita, quantita: lavoro.quantita,
        origine: "stimata", soloEsistente: true,
      });
    }
  }
  const mappa = calcolaQuantita(doc);
  const ambito = proposta ? `progetto:${proposta.id}` : "fatto";
  const scelte = proposta ? QUANTITA_LOCALI.filter(q => q.id === "pavimento_mq") : QUANTITA_LOCALI;
  for (const locale of (proposta ?? livello.fatto).locali) {
    for (const scelta of scelte) {
      const misura = mappa[chiaveLocale(ambito, locale.id, scelta.id)];
      if (!misura || misura.valore <= 0) continue;
      misure.push({
        chiave: misura.chiave, nome: scelta.etichetta, riferimento: locale.nome,
        capitolo: proposta ? "Superfici" : "Misure da rilievo",
        unita: misura.unita === "n" ? "pz" : misura.unita, quantita: misura.valore, origine: misura.origine,
        oggetto: { tipo: "locale", id: locale.id, vista: proposta ? "progetto" : "fatto" },
      });
    }
  }
  return misure;
}

function decimale(n: number) {
  return n.toLocaleString("it-IT", { useGrouping: false, maximumFractionDigits: 2 });
}

export function gruppiMisureDallaPianta(proposte: readonly MisuraPropostaDallaPianta[]) {
  const gruppi = new Map<string, MisuraPropostaDallaPianta[]>();
  const inOrdine: MisuraPropostaDallaPianta[][] = [];
  for (const misura of proposte) {
    const chiave = misura.chiavePrecedente ?? misura.chiave;
    let gruppo = gruppi.get(chiave);
    if (!gruppo || gruppo.length >= MAX_MISURE_VOCE) {
      gruppo = [];
      inOrdine.push(gruppo);
      gruppi.set(chiave, gruppo);
    }
    gruppo.push(misura);
  }
  return inOrdine.map(misure => ({
    prima: misure[0], misure, quantita: arrotondaDecimale(misure.reduce((totale, m) => totale + m.quantita, 0)),
  }));
}

function misuraDallaPianta(proposta: MisuraPropostaDallaPianta, versione: number): MisuraEditor {
  return {
    ...misuraVuota(), descrizione: proposta.riferimento, formula: decimale(proposta.quantita),
    dallaPianta: { chiave: proposta.chiave, versione, origine: proposta.origine },
  };
}

export function voceDallaPianta(proposta: MisuraPropostaDallaPianta, versione: number): VoceEditor {
  const { prezzo } = proposta;
  return {
    ...voceVuota(),
    capitolo: proposta.capitolo,
    descrizione: `${proposta.nome} — ${proposta.riferimento}`,
    unita: proposta.unita,
    corpo: proposta.unita === "a corpo",
    ...(prezzo ? { prezzo: String(prezzo.importo), fonte: prezzo.fonte, tariffa: prezzo.tariffa } : {}),
    misure: [misuraDallaPianta(proposta, versione)],
  };
}

/** Quanto vale una proposta col prezzo proposto; null se il prezzo manca. */
export const importoProposto = (quantita: number, prezzo?: PrezzoVocePlanimetria) =>
  prezzo ? arrotondaDecimale(quantita * prezzo.importo) : null;

export function vociDallaPianta(proposte: readonly MisuraPropostaDallaPianta[], versione: number) {
  return gruppiMisureDallaPianta(proposte).map(({ prima, misure }) => {
    const voce = voceDallaPianta(prima, versione);
    voce.misure.push(...misure.slice(1).map(m => misuraDallaPianta(m, versione)));
    return voce;
  });
}

type ModificaPianta = { prima: VoceEditor; dopo: VoceEditor };

export function confrontaComputoConPianta(
  voci: readonly VoceEditor[],
  proposte: readonly MisuraPropostaDallaPianta[],
  versione: number,
  propostePrecedenti: readonly MisuraPropostaDallaPianta[] = proposte,
) {
  const propostePerChiave = new Map(proposte.map(p => [p.chiave, p]));
  const gruppiPrecedenti = new Map<string, string[]>();
  for (const p of propostePrecedenti) {
    if (!p.chiavePrecedente) continue;
    const gruppo = gruppiPrecedenti.get(p.chiavePrecedente) ?? [];
    gruppo.push(p.chiave);
    gruppiPrecedenti.set(p.chiavePrecedente, gruppo);
  }
  const collegate = new Set<string>();
  const variazioni: ModificaPianta[] = [];
  const misurePerVoce = new Map<string, MisuraPropostaDallaPianta[]>();
  const daVerificare: { voce: VoceEditor; misura: MisuraEditor; motivo: string }[] = [];
  const nuove = voci.map(voce => {
    const collegateAllaVoce: MisuraPropostaDallaPianta[] = [];
    let daRivedere = false;
    const misure = voce.misure.map(misura => {
      const fonte = misura.dallaPianta;
      if (!fonte) return misura;
      const componenti = fonte.componenti ?? gruppiPrecedenti.get(fonte.chiave);
      const chiavi = componenti ?? [fonte.chiave];
      const trovate: MisuraPropostaDallaPianta[] = [];
      for (const chiave of chiavi) {
        collegate.add(chiave);
        const p = propostePerChiave.get(chiave);
        if (p) trovate.push(p);
      }
      collegateAllaVoce.push(...trovate);
      const motivo = trovate.length !== chiavi.length ? "Misura assente nella nuova versione"
        : trovate.some(p => unitaComputo(p.unita) !== unitaComputo(voce.unita)) ? "Unità di misura diversa" : null;
      if (motivo) {
        daRivedere = true;
        daVerificare.push({ voce, misura, motivo });
        return misura;
      }
      if (fonte.versione > versione || (fonte.versione === versione && (!componenti || fonte.componenti))) return misura;
      const quantita = arrotondaDecimale(trovate.reduce((totale, p) => totale + p.quantita, 0));
      return {
        ...misura,
        formula: decimale(quantita),
        dallaPianta: { ...fonte, origine: originePeggiore(...trovate.map(p => p.origine)), versione, ...(componenti ? { componenti } : {}) },
      };
    });
    if (collegateAllaVoce.length) misurePerVoce.set(voce.id, collegateAllaVoce);
    if (daRivedere || misure.every((m, i) => m === voce.misure[i])) return voce;
    const dopo = { ...voce, misure };
    if (calcolaVoce(dopo).quantita !== calcolaVoce(voce).quantita) variazioni.push({ prima: voce, dopo });
    return dopo;
  });
  return {
    voci: nuove, variazioni, daVerificare,
    disponibili: proposte.filter(p => !p.soloEsistente && !collegate.has(p.chiave)),
    misurePerVoce,
    haMisureDaAggiornare: nuove.some((v, i) => v !== voci[i]),
  };
}
