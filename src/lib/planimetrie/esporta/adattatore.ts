/**
 * Dal modello della pianta (fase 1, `shared/planimetrie/`, contratto in
 * docs/planimetrie/modello.md) alla vista che le esportazioni disegnano.
 *
 * È l'unico file delle esportazioni che conosce il modello: se il modello
 * cambia si tocca qui, i disegnatori leggono `VistaPianta` e non se ne accorgono.
 *
 * Cosa fa:
 * - sceglie livello e stato (fatto, progetto, confronto);
 * - gira la y (il modello ha y verso l'alto come il DXF, la vista verso il basso
 *   come lo schermo) e con lei le rotazioni: il modello gira gli arredi in senso
 *   antiorario con il retro verso il basso a 0° (negli esempi il wc contro il muro
 *   in alto ha 180°), la vista in senso orario con il retro in alto a 0°. È la
 *   stessa lettura del 3D (`tred/adattatore.ts`, `rotazione3D`);
 * - prende superfici e perimetri dalle quantità della fase 1, con la loro origine.
 */
import type {
  Apertura, Elemento, Livello, Locale, Muro, Planimetria, Punto as PuntoModello, StatoPianta,
} from "../../../../shared/planimetrie/modello.ts";
import { calcolaQuantita, type MappaQuantita } from "../../../../shared/planimetrie/quantita.ts";
import type {
  AperturaVista, ElementoVista, LocaleVista, MuroVista, OrigineMisura, Pavimento, Punto, TipoElemento, VistaPianta,
} from "./tipi";

/**
 * Cosa disegnare:
 * - `fatto`: lo stato di fatto;
 * - `progetto`: la proposta a lavori finiti (senza ciò che si demolisce, il nuovo
 *   disegnato come esistente): la pianta da far vedere al cliente;
 * - `confronto`: la proposta con i colori dei lavori, giallo ciò che si demolisce,
 *   rosso ciò che si costruisce (la tavola comparativa).
 */
export type ModoVista = "fatto" | "progetto" | "confronto";

export interface SceltaVista {
  livelloId?: string;
  /** Di serie la prima proposta del livello; senza proposte si disegna il fatto. */
  propostaId?: string;
  modo: ModoVista;
}

const NOMI_MODO: Record<ModoVista, string> = {
  fatto: "Stato di fatto",
  progetto: "Stato di progetto",
  confronto: "Stato comparativo",
};

/** y verso l'alto → y verso il basso. */
const giu = (p: PuntoModello): Punto => ({ x: p.x, y: -p.y });

/** Dal testo libero della finitura al disegno del pavimento; undefined = quello di serie per la destinazione. */
export function pavimentoDaFinitura(testo?: string): Pavimento | undefined {
  const t = (testo ?? "").toLowerCase();
  if (!t) return undefined;
  if (/parquet|legno|laminat|rovere|noce/.test(t)) return "parquet";
  if (/cotto|terracotta/.test(t)) return "cotto";
  if (/marmo|travertino|pietra/.test(t)) return "marmo";
  if (/resina|cemento|microcemento/.test(t)) return "resina";
  if (/piastrell|ceramic|mosaic|maiolic/.test(t)) return "piastrelle";
  if (/gres/.test(t)) return "gres";
  return undefined;
}

/** I nomi che l'editor e l'AI usano per gli arredi, ricondotti ai simboli che sappiamo disegnare. */
const ALIAS_ELEMENTI: Record<string, TipoElemento> = {
  cucina_lineare: "cucina", cucina_angolare: "cucina", piano_cottura: "cucina", angolo_cottura: "cucina",
  frigo: "frigorifero", piatto_doccia: "doccia", box_doccia: "doccia", vasca_bagno: "vasca",
  lavandino: "lavabo", lavello: "lavabo", water: "wc", vaso: "wc",
  letto: "letto_matrimoniale", letto_doppio: "letto_matrimoniale", letto_piazza: "letto_singolo",
  sofa: "divano", tavolo_pranzo: "tavolo", comodini: "comodino", guardaroba: "armadio",
};
const NOTI = new Set<string>([
  "wc", "bidet", "lavabo", "doccia", "vasca", "cucina", "frigorifero", "lavatrice", "caldaia",
  "letto_matrimoniale", "letto_singolo", "divano", "tavolo", "sedia", "armadio", "comodino", "scrivania",
]);

/** Il simbolo da disegnare per un tipo libero; «generico» è un riquadro con la diagonale. */
export function tipoElemento(tipo: string): TipoElemento {
  const t = tipo.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (NOTI.has(t)) return t as TipoElemento;
  return ALIAS_ELEMENTI[t] ?? "generico";
}

function muroVista(m: Muro, modo: ModoVista): MuroVista {
  return {
    id: m.id, p1: giu(m.p1), p2: giu(m.p2), spessore: m.spessore, altezza: m.altezza, tipo: m.tipo,
    stato: modo === "progetto" ? "esistente" : m.stato,
    origine: m.origine,
  };
}

function aperturaVista(a: Apertura, modo: ModoVista): AperturaVista {
  return {
    id: a.id, muroId: a.muroId, tipo: a.tipo, distanza: a.offset, larghezza: a.larghezza, altezza: a.altezza,
    davanzale: a.davanzale, manovra: a.manovra,
    cerniera: a.verso?.cardine === "p2" ? "fine" : "inizio",
    lato: a.verso?.lato ?? "sinistra",
    ante: a.tipo === "porta" || a.larghezza < 100 ? 1 : 2,
    stato: modo === "progetto" ? "esistente" : a.stato,
  };
}

function localeVista(l: Locale, q: MappaQuantita, ambito: string): LocaleVista {
  const pav = q[`${ambito}:locale:${l.id}.pavimento_mq`];
  const per = q[`${ambito}:locale:${l.id}.perimetro_ml`];
  return {
    id: l.id, nome: l.nome, destinazione: l.destinazione, contorno: l.contorno.map(giu), altezza: l.altezza,
    superficieMq: pav?.valore, perimetroM: per?.valore,
    pavimento: pavimentoDaFinitura(l.finiture?.pavimento),
    origine: pav?.origine ?? l.origine,
  };
}

/** Rotazione del modello (antioraria, retro in basso a 0°) → della vista (oraria, retro in alto a 0°). */
export const rotazioneVista = (gradi: number) => (((180 - gradi) % 360) + 360) % 360;

function elementoVista(e: Elemento, modo: ModoVista): ElementoVista {
  return {
    id: e.id, tipo: tipoElemento(e.tipo), posizione: giu(e.posizione), larghezza: e.larghezza, profondita: e.profondita,
    rotazione: rotazioneVista(e.rotazione ?? 0),
    stato: modo === "progetto" ? "esistente" : e.stato ?? "esistente",
  };
}

/** Lo stato da disegnare, già filtrato per il modo. */
function statoDaDisegnare(livello: Livello, modo: ModoVista, propostaId?: string) {
  const proposta = livello.proposte.find((x) => x.id === propostaId) ?? livello.proposte[0];
  if (modo === "fatto" || !proposta) return { stato: livello.fatto, ambito: "fatto", modo: "fatto" as ModoVista };
  const ambito = `progetto:${proposta.id}`;
  if (modo === "confronto") return { stato: proposta as StatoPianta, ambito, nomeProposta: proposta.nome, modo };
  const resta = <T extends { stato?: string }>(v: T[]) => v.filter((x) => x.stato !== "da_demolire");
  const stato: StatoPianta = { ...proposta, muri: resta(proposta.muri), aperture: resta(proposta.aperture), elementi: resta(proposta.elementi) };
  return { stato, ambito, nomeProposta: proposta.nome, modo };
}

/**
 * La vista di un livello. `quantita` si passa se si hanno già (sono in cache
 * nella versione salvata); altrimenti si calcolano qui.
 */
export function vistaDaPlanimetria(p: Planimetria, scelta: SceltaVista = { modo: "progetto" }, quantita?: MappaQuantita): VistaPianta {
  const livello = p.livelli.find((l) => l.id === scelta.livelloId) ?? p.livelli[0];
  if (!livello) throw new Error("La pianta non ha livelli da disegnare.");
  const { stato, ambito, nomeProposta, modo } = statoDaDisegnare(livello, scelta.modo, scelta.propostaId);
  const q = quantita ?? calcolaQuantita(p);
  const piuProposte = livello.proposte.length > 1 && nomeProposta ? ` — ${nomeProposta}` : "";
  return {
    titolo: p.titolo?.trim() || "Pianta",
    livello: `${livello.nome} · ${NOMI_MODO[modo]}${piuProposte}`,
    muri: stato.muri.map((m) => muroVista(m, modo)),
    aperture: stato.aperture.map((a) => aperturaVista(a, modo)),
    locali: stato.locali.map((l) => localeVista(l, q, ambito)),
    elementi: stato.elementi.map((e) => elementoVista(e, modo)),
    quote: stato.quote.map((x) => ({ p1: giu(x.p1), p2: giu(x.p2), scostamento: x.scostamento })),
    testi: stato.testi.map((t) => ({ posizione: giu(t.posizione), testo: t.testo, rotazione: -(t.rotazione ?? 0) })),
    nord: p.nord === undefined ? undefined : -p.nord,
  };
}

/** Ci sono misure stimate fra quelle disegnate? Serve al PDF per la nota sotto la tabella. */
export function haMisureStimate(v: VistaPianta): boolean {
  const stimata = (o?: OrigineMisura) => o === "stimata";
  return v.muri.some((m) => stimata(m.origine)) || v.locali.some((l) => stimata(l.origine)) || v.quote.some((q) => stimata(q.origine));
}
