/**
 * Planimetrie → computo metrico di commessa (fase 4).
 *
 * «Prendi dalla pianta» su una voce: si sceglie la pianta, lo stato (di fatto o una
 * proposta), la quantità e i locali; nascono le righe di misura, una per locale, con la
 * quantità di `calcolaQuantita` e il riferimento alla pianta (`planimetria_id`,
 * `planimetria_versione`, `planimetria_chiavi`). Quando la pianta ha una versione più
 * nuova, le stesse chiavi si ricalcolano e si mostra il confronto: il computo si
 * aggiorna solo con un clic (contrattuale: perizia di variante, mai aggiornamento).
 *
 * Qui solo calcoli, senza database: li fissano i test (planimetrieComputo.test.ts).
 *
 * Regole:
 * - ogni riga si arrotonda a 2 decimali, come le righe di PriMus (`arrotondaDecimale`):
 *   le righe stampate sommano al totale della voce;
 * - nelle voci «si detrae» le righe sono negative, come quelle importate;
 * - la quantità della voce cambia di quanto cambiano le righe (Σ nuove − Σ vecchie):
 *   quello che la voce aveva già non si perde, nemmeno se non tornava con le righe.
 */
import { arrotondaDecimale, ePercentuale } from "@/lib/computo/editorNativo";
import { ambitiDi, originePeggiore, statoDelLivello, type Origine, type Planimetria } from "../../../shared/planimetrie/modello.ts";
import {
  ETICHETTE_MISURE_LOCALE, leggiChiave, type MappaQuantita, type MisuraLocale, type UnitaQuantita,
} from "../../../shared/planimetrie/quantita.ts";

// ─── Le quantità che si possono prendere ────────────────────────────────────

/** Una quantità che si sceglie nel passo «Quale quantità». */
export interface SceltaQuantita {
  /** Per i locali la misura (`pavimento_mq`); per la pianta intera il soggetto e la misura (`demolizioni.muri_mq`). */
  id: string;
  etichetta: string;
  unita: UnitaQuantita;
  /** `locale`: una riga per ogni locale scelto; `pianta`: una riga sola. */
  per: "locale" | "pianta";
}

/** Le misure dei locali, nell'ordine in cui si propongono, con parole da cantiere. */
export const QUANTITA_LOCALI: readonly SceltaQuantita[] = [
  { id: "pavimento_mq", etichetta: "Pavimento", unita: "mq", per: "locale" },
  { id: "pareti_nette_mq", etichetta: "Pareti, tolte porte e finestre grandi", unita: "mq", per: "locale" },
  { id: "pareti_lorde_mq", etichetta: "Pareti, vuoto per pieno", unita: "mq", per: "locale" },
  { id: "soffitto_mq", etichetta: "Soffitto", unita: "mq", per: "locale" },
  { id: "battiscopa_ml", etichetta: "Battiscopa, tolte le porte", unita: "ml", per: "locale" },
  { id: "rivestimento_mq", etichetta: "Rivestimento (piastrelle a parete)", unita: "mq", per: "locale" },
  { id: "perimetro_ml", etichetta: "Perimetro della stanza", unita: "ml", per: "locale" },
  { id: "volume_mc", etichetta: "Volume della stanza", unita: "mc", per: "locale" },
];

const UNITA_TESTO: Record<UnitaQuantita, string> = { mq: "mq", ml: "m", mc: "mc", n: "n." };
export const unitaLeggibile = (u: UnitaQuantita) => UNITA_TESTO[u];

/**
 * Le quantità della pianta intera per uno stato: pareti da demolire e nuove (solo nelle
 * proposte) e porte e finestre per tipo. Le etichette vengono dalla pianta stessa.
 */
export function quantitaPianta(mappa: MappaQuantita, ambito: string): SceltaQuantita[] {
  const out: SceltaQuantita[] = [];
  for (const q of Object.values(mappa)) {
    if (q.ambito !== ambito) continue;
    const k = leggiChiave(q.chiave);
    if (!k) continue;
    const intera = k.soggetto === "demolizioni" || k.soggetto === "costruzioni" || /^aperture:[a-z_]+:[a-z]+$/.test(k.soggetto);
    if (!intera) continue;
    // Nelle proposte la descrizione finisce con « (nome della proposta)»: nella scelta non serve.
    const etichetta = ambito === "fatto" ? q.descrizione : q.descrizione.replace(/ \([^()]*\)$/, "");
    out.push({ id: `${k.soggetto}.${k.misura}`, etichetta, unita: q.unita, per: "pianta" });
  }
  const peso = (s: SceltaQuantita) => (s.id.startsWith("demolizioni") ? 0 : s.id.startsWith("costruzioni") ? 1 : 2);
  return out.sort((a, b) => peso(a) - peso(b) || a.etichetta.localeCompare(b.etichetta, "it"));
}

// ─── Stati e locali di una pianta ───────────────────────────────────────────

export interface StatoScelto {
  chiave: string;
  /** Per le schermate. */
  nome: string;
  /** Nome della proposta (entra nella descrizione delle righe); null per lo stato di fatto. */
  proposta: string | null;
}

/** «Stato di fatto» e le proposte, con nomi semplici. */
export function statiDellaPianta(p: Planimetria): StatoScelto[] {
  return ambitiDi(p).map(a => ({
    chiave: a.chiave,
    nome: a.propostaId === null ? "Com'è adesso (stato di fatto)" : `Dopo i lavori — ${a.nome}`,
    proposta: a.propostaId === null ? null : a.nome,
  }));
}

export interface LocaleScelto { id: string; nome: string; livello: string }

/** I locali di uno stato, su tutti i livelli (il nome del piano serve solo se i piani sono più di uno). */
export function localiDelloStato(p: Planimetria, ambito: string): LocaleScelto[] {
  const a = ambitiDi(p).find(x => x.chiave === ambito);
  if (!a) return [];
  return p.livelli.flatMap(l => (statoDelLivello(l, a)?.locali ?? []).map(loc => ({ id: loc.id, nome: loc.nome, livello: l.nome })));
}

// ─── Dalla pianta alle righe di misura ──────────────────────────────────────

export const chiaveLocale = (ambito: string, localeId: string, misura: string) => `${ambito}:locale:${localeId}.${misura}`;
export const chiavePianta = (ambito: string, sceltaId: string) => `${ambito}:${sceltaId}`;

export interface RigaDaPianta {
  descrizione: string;
  /** Già arrotondata a 2 decimali e col segno della voce. */
  quantita: number;
  chiavi: string[];
  origine: Origine;
}

export interface EsitoRighe {
  righe: RigaDaPianta[];
  /** Locali scelti che non hanno quella quantità (es. il rivestimento in una camera). */
  saltati: string[];
}

/** Le righe di misura da creare. `negativa`: la voce «si detrae». */
export function righeDaPianta(input: {
  mappa: MappaQuantita; stato: StatoScelto; scelta: SceltaQuantita; locali: LocaleScelto[]; negativa?: boolean;
}): EsitoRighe {
  const { mappa, stato, scelta, locali, negativa = false } = input;
  const ambito = stato.chiave;
  const segno = negativa ? -1 : 1;
  const chiavi = scelta.per === "pianta"
    ? [{ chiave: chiavePianta(ambito, scelta.id), nome: scelta.etichetta }]
    : locali.map(l => ({ chiave: chiaveLocale(ambito, l.id, scelta.id), nome: l.nome }));
  const righe: RigaDaPianta[] = [];
  const saltati: string[] = [];
  for (const { chiave, nome } of chiavi) {
    const q = mappa[chiave];
    if (!q) { saltati.push(nome); continue; }
    righe.push({
      descrizione: descrizioneRiga(scelta, nome, stato.proposta),
      quantita: arrotondaDecimale(segno * q.valore),
      chiavi: [chiave],
      origine: q.origine,
    });
  }
  return { righe, saltati };
}

/** «Bagno — pavimento», «Pareti da demolire (superficie)»; con il nome della proposta se non è lo stato di fatto. */
function descrizioneRiga(scelta: SceltaQuantita, nome: string, proposta: string | null) {
  const base = scelta.per === "locale"
    ? `${nome} — ${(ETICHETTE_MISURE_LOCALE[scelta.id as MisuraLocale] ?? scelta.etichetta).toLowerCase()}`
    : nome;
  return proposta ? `${base} (${proposta})` : base;
}

// ─── Una riga salvata, riletta su una versione della pianta ─────────────────

/** Somma delle chiavi su una versione; le chiavi che non ci sono più finiscono in `mancanti`. */
export function valoreChiavi(mappa: MappaQuantita, chiavi: readonly string[], negativa = false) {
  let valore = 0;
  const origini: Origine[] = [];
  const mancanti: string[] = [];
  for (const c of chiavi) {
    const q = mappa[c];
    if (!q) { mancanti.push(c); continue; }
    valore += q.valore;
    origini.push(q.origine);
  }
  return {
    valore: arrotondaDecimale((negativa ? -1 : 1) * valore),
    origine: origini.length ? originePeggiore(...origini) : ("rilevata" as Origine),
    mancanti,
  };
}

/** Una riga di misura con il riferimento alla pianta, come esce dal database. */
export interface MisuraConPianta {
  id: string;
  voceId: string;
  descrizione: string | null;
  quantita: number | null;
  planimetriaId: string;
  versione: number;
  chiavi: string[];
}

export interface ConfrontoRiga {
  misura: MisuraConPianta;
  vecchia: number;
  nuova: number;
  differenza: number;
  /** Qualche chiave non c'è più nella versione nuova (locale cancellato o rinominato in un altro id). */
  mancanti: string[];
  origine: Origine;
}

/** Confronto vecchia → nuova quantità per ogni riga legata a una pianta che è cambiata. */
export function confrontaRighe(misure: readonly MisuraConPianta[], mappaNuova: MappaQuantita, voceNegativa: (voceId: string) => boolean): ConfrontoRiga[] {
  return misure.map(m => {
    const neg = voceNegativa(m.voceId);
    const { valore, origine, mancanti } = valoreChiavi(mappaNuova, m.chiavi, neg);
    const vecchia = Number(m.quantita ?? 0);
    return { misura: m, vecchia, nuova: valore, differenza: arrotondaDecimale(valore - vecchia), mancanti, origine };
  });
}

/** Le righe che cambiano davvero (o hanno perso la quantità): le sole da mostrare e da aggiornare. */
export const righeCambiate = (c: readonly ConfrontoRiga[]) => c.filter(r => r.differenza !== 0 || r.mancanti.length > 0);

// ─── La voce dopo le righe nuove o aggiornate ──────────────────────────────

export interface VoceDaRicalcolare {
  quantita: number | null;
  prezzo_unitario_computo: number | null;
  unita_misura: string | null;
}

/**
 * Quantità e importo della voce dopo una variazione delle sue righe. La voce cambia
 * della stessa differenza delle righe: la parte che non veniva dalle righe resta.
 */
export function voceDopo(v: VoceDaRicalcolare, differenzaRighe: number) {
  const quantita = arrotondaDecimale(Number(v.quantita ?? 0) + differenzaRighe);
  const prezzo = v.prezzo_unitario_computo;
  const importo = prezzo == null ? null : arrotondaDecimale((quantita * prezzo) / (ePercentuale(v.unita_misura ?? "") ? 100 : 1));
  return { quantita, importo };
}

// ─── Unità e misure stimate ─────────────────────────────────────────────────

/** Unità del computo nella forma della pianta, o null se non si riconosce (a corpo, kg…). */
export function unitaComputo(u: string | null | undefined): UnitaQuantita | null {
  const s = (u ?? "").toLowerCase().replace(/[\s.]/g, "").replace("²", "2").replace("³", "3");
  if (["mq", "m2", "metriquadri", "metroquadro"].includes(s)) return "mq";
  if (["mc", "m3", "metricubi", "metrocubo"].includes(s)) return "mc";
  if (["m", "ml", "metri", "metrolineare", "metrilineari"].includes(s)) return "ml";
  if (["n", "nr", "num", "cad", "cadauno", "pz", "pezzi"].includes(s)) return "n";
  return null;
}

/** Avviso se la voce è in un'unità diversa dalla quantità scelta; null se va bene o non si sa. */
export function avvisoUnita(unitaVoce: string | null | undefined, scelta: SceltaQuantita): string | null {
  const u = unitaComputo(unitaVoce);
  if (!u || u === scelta.unita) return null;
  return `La voce è in ${unitaVoce?.trim()}, la quantità scelta è in ${unitaLeggibile(scelta.unita)}: controlla che sia quella giusta.`;
}

export const ETICHETTA_ORIGINE: Record<Origine, string> = {
  rilevata: "misurata",
  da_documento: "letta dal disegno",
  stimata: "stimata",
};
