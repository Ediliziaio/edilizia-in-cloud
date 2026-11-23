/**
 * Il prezzo proposto per una lavorazione della pianta (23/11/2026). Una voce nasce già
 * quotata, e poi si corregge: prima il listino dell'azienda, poi il prezzario pubblico
 * della regione, poi un prezzo indicativo dichiarato come tale. Il prezzo scritto a mano
 * nella variante (`prezziLavorazioni`) vince sempre: qui si riempiono solo i vuoti.
 *
 * Tutto il riconoscimento è a regole, senza AI: una voce di listino vale per una
 * lavorazione se ha l'unità giusta e le parole giuste, e non quelle sbagliate
 * («demolizione» non può quotare un tramezzo nuovo).
 */
import type { PrezzoVocePlanimetria } from "../../../shared/planimetrie/modello.ts";
import { unitaCompatibili } from "@/lib/prezzario/confronto";
import { LISTINO_IMPIANTI } from "./listinoImpianti";
import type { RigaStudio } from "./studioImmobiliare";

export type TipoLavorazione =
  | "demolizione_tramezzo" | "demolizione_muratura" | "nuovo_tramezzo" | "nuova_muratura"
  | "macerie" | "ripristino" | "intonaco" | "tinteggiatura" | "battiscopa"
  | "porta" | "finestra" | "portafinestra" | "varco" | "chiusura_vano" | "rimozione_serramento"
  | "pavimento" | "rivestimento";

interface Regola {
  /** Ogni gruppo deve comparire con almeno una delle sue radici. */
  parole: string[][];
  /** Se compare una di queste, la voce parla d'altro. */
  evita?: string[];
  /** La ricerca nel prezzario pubblico. */
  cerca: string;
  /** € per unità, fornitura e posa, 2026: ordine di grandezza quando non c'è altro. */
  indicativo: number;
}

export const REGOLE_LAVORAZIONI: Record<TipoLavorazione, Regola> = {
  demolizione_tramezzo: { parole: [["demoliz"], ["tramezz", "tavolat"]], evita: ["solai", "tett"], cerca: "demolizione tramezzi", indicativo: 28 },
  demolizione_muratura: { parole: [["demoliz"], ["muratur"]], evita: ["tramezz", "tavolat"], cerca: "demolizione muratura mattoni", indicativo: 75 },
  nuovo_tramezzo: { parole: [["tramezz", "tavolat"], ["realizz", "costruz", "laterizio", "forat", "fornitura", "muratur"]], evita: ["demoliz", "rimoz", "cartongesso", "contropar"], cerca: "tramezzi laterizio forato", indicativo: 58 },
  nuova_muratura: { parole: [["muratur"], ["mattoni", "laterizio", "blocchi"]], evita: ["demoliz", "rimoz", "tramezz"], cerca: "muratura portante blocchi laterizio", indicativo: 140 },
  macerie: { parole: [["macerie", "smaltiment", "discarica"]], evita: ["amianto"], cerca: "trasporto smaltimento macerie discarica", indicativo: 350 },
  ripristino: { parole: [["pavim"], ["ripristin", "rappezz"]], cerca: "ripristino pavimento", indicativo: 60 },
  intonaco: { parole: [["intonac"]], evita: ["demoliz", "rimoz", "spicconat", "estern", "facciat", "deumidific"], cerca: "intonaco civile interno", indicativo: 24 },
  tinteggiatura: { parole: [["tintegg", "pittur", "idropittur"]], evita: ["estern", "facciat", "rimoz", "raschiat", "ferro", "legno"], cerca: "tinteggiatura idropittura lavabile interni", indicativo: 9 },
  battiscopa: { parole: [["battiscopa", "zoccolin"]], evita: ["rimoz", "demoliz"], cerca: "battiscopa", indicativo: 14 },
  porta: { parole: [["porta ", "porte "], ["intern", "tamburat", "battente"]], evita: ["blindat", "finestr", "rimoz", "smontag", "garage", "tagliafuoco", "rei "], cerca: "porta interna tamburata battente", indicativo: 480 },
  finestra: { parole: [["finestr"]], evita: ["portafinestr", "porta finestr", "rimoz", "smontag", "davanzal", "tetto"], cerca: "finestra pvc due ante", indicativo: 900 },
  portafinestra: { parole: [["portafinestr", "porta finestr", "porta-finestr"]], evita: ["rimoz", "smontag"], cerca: "portafinestra pvc", indicativo: 1350 },
  varco: { parole: [["apertura", "varco", "vano"], ["muratur", "tramezz", "parete"]], evita: ["chiusura", "tampon"], cerca: "apertura vano porta muratura", indicativo: 320 },
  chiusura_vano: { parole: [["chiusura", "tampon"], ["vano", "vani", "apertur"]], cerca: "chiusura vano tamponamento laterizio", indicativo: 95 },
  rimozione_serramento: { parole: [["rimozione", "smontaggio"], ["serrament", "infiss", "porta", "porte", "finestr"]], cerca: "rimozione serramenti interni", indicativo: 60 },
  pavimento: { parole: [["pavim"], ["posa", "fornitura"]], evita: ["demoliz", "rimoz", "ripristin", "massetto", "sottofondo", "battiscopa"], cerca: "pavimento gres porcellanato posa", indicativo: 55 },
  rivestimento: { parole: [["rivestim"], ["ceramic", "gres", "piastrell"]], evita: ["demoliz", "rimoz"], cerca: "rivestimento pareti piastrelle ceramica", indicativo: 60 },
};

export const FONTE_INDICATIVA = "Prezzo indicativo 2026, da confermare";

/** Che lavorazione è una riga dello studio; null se non la riconosco (resta da quotare). */
export function tipoLavorazione(r: Pick<RigaStudio, "id" | "descrizione">): TipoLavorazione | null {
  const coda = /-(macerie|ripristino|intonaco|tinteggiatura|battiscopa)$/.exec(r.id)?.[1];
  if (coda) return coda as TipoLavorazione;
  const d = r.descrizione;
  if (d.startsWith("Demolizione tramezzo")) return "demolizione_tramezzo";
  if (d.startsWith("Demolizione parete")) return "demolizione_muratura";
  if (d.startsWith("Nuovo tramezzo")) return "nuovo_tramezzo";
  if (d.startsWith("Nuova muratura")) return "nuova_muratura";
  if (d.startsWith("Chiusura ")) return "chiusura_vano";
  if (d.startsWith("Rimozione ") && /porta|finestra|varco/.test(d)) return "rimozione_serramento";
  const nuova = /^Realizzazione (portafinestra|porta|finestra|varco)$/.exec(d)?.[1];
  if (nuova) return nuova as TipoLavorazione;
  if (d.startsWith("Posa pavimento")) return "pavimento";
  if (d.startsWith("Rivestimento ·")) return "rivestimento";
  return null;
}

export interface VoceDiPrezzo { codice: string | null; descrizione: string; unita: string | null; prezzo: number }
export interface FontiPrezzi {
  /** Il listino dell'azienda. */
  listino: readonly VoceDiPrezzo[];
  /** Le voci del prezzario pubblico trovate per ogni lavorazione. */
  prezzario: Partial<Record<TipoLavorazione, readonly VoceDiPrezzo[]>>;
  /** «Lombardia 2026»; null se l'azienda non ha un prezzario di zona. */
  prezzarioNome: string | null;
}
export const FONTI_VUOTE: FontiPrezzi = { listino: [], prezzario: {}, prezzarioNome: null };

const piano = (s: string) => ` ${s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ")} `;

/** Quanto una voce parla di questa lavorazione: 0 se non c'entra. */
export function attinenza(tipo: TipoLavorazione, descrizione: string): number {
  const regola = REGOLE_LAVORAZIONI[tipo], testo = piano(descrizione);
  if (regola.evita?.some((p) => testo.includes(p))) return 0;
  if (!regola.parole.every((gruppo) => gruppo.some((p) => testo.includes(p)))) return 0;
  return 1 + regola.cerca.split(" ").filter((p) => testo.includes(p.slice(0, 6))).length;
}

const adatte = (tipo: TipoLavorazione, unita: string, voci: readonly VoceDiPrezzo[]) => voci
  .filter((v) => Number.isFinite(v.prezzo) && v.prezzo > 0 && unitaCompatibili(v.unita, unita))
  .map((v) => ({ v, punti: attinenza(tipo, v.descrizione) })).filter((x) => x.punti > 0);

const impianto = (id: string) => {
  const chiave = /^impianto-[^-]+-(.+)$/.exec(id)?.[1]?.replace("elementi:nuovo:", "elementi:");
  return chiave ? LISTINO_IMPIANTI.find((v) => v.id === chiave) : undefined;
};

/** Il prezzo proposto per una riga, con la fonte; null se resta da quotare. */
export function proponiPrezzo(r: Pick<RigaStudio, "id" | "descrizione" | "unita">, fonti: FontiPrezzi = FONTI_VUOTE): PrezzoVocePlanimetria | null {
  const tipo = tipoLavorazione(r);
  if (!tipo) {
    const v = impianto(r.id);
    return v && unitaCompatibili(v.unita, r.unita) ? { importo: v.prezzo, unita: r.unita, fonte: FONTE_INDICATIVA, tariffa: "" } : null;
  }
  const delListino = adatte(tipo, r.unita, fonti.listino).sort((a, b) => b.punti - a.punti)[0];
  if (delListino) return { importo: delListino.v.prezzo, unita: r.unita, fonte: "Listino aziendale", tariffa: (delListino.v.codice ?? "").slice(0, 120) };
  const pubbliche = adatte(tipo, r.unita, fonti.prezzario[tipo] ?? []).map((x) => x.v).sort((a, b) => a.prezzo - b.prezzo);
  if (pubbliche.length && fonti.prezzarioNome) {
    // Il prezzario ha molte varianti della stessa lavorazione: si prende la voce di mezzo, non la prima.
    const v = pubbliche[Math.floor((pubbliche.length - 1) / 2)];
    return { importo: v.prezzo, unita: r.unita, tariffa: (v.codice ?? "").slice(0, 120),
      fonte: `Prezzario ${fonti.prezzarioNome}${pubbliche.length > 1 ? ` · voce mediana di ${pubbliche.length}` : ""}, da confermare`.slice(0, 300) };
  }
  // «A corpo» non ha un ordine di grandezza che valga per tutti, tranne le macerie di una parete.
  if (r.unita === "a corpo" && tipo !== "macerie") return null;
  return { importo: REGOLE_LAVORAZIONI[tipo].indicativo, unita: r.unita, fonte: FONTE_INDICATIVA, tariffa: "" };
}

/** Le righe con il prezzo proposto dove manca. Quelle già quotate non si toccano. */
export function conPrezziProposti<T extends RigaStudio>(righe: readonly T[], fonti: FontiPrezzi = FONTI_VUOTE): T[] {
  return righe.map((r) => {
    if (r.prezzo) return r;
    const prezzo = proponiPrezzo(r, fonti);
    return prezzo ? { ...r, prezzo } : r;
  });
}

/** Il prezzo viene da noi e non dall'utente: va mostrato come proposta. */
export const ePrezzoProposto = (p: Pick<PrezzoVocePlanimetria, "fonte">) =>
  p.fonte === FONTE_INDICATIVA || p.fonte === "Listino aziendale" || p.fonte.startsWith("Prezzario ");

/** Le lavorazioni da cercare nel prezzario per queste righe. */
export const tipiDaCercare = (righe: readonly Pick<RigaStudio, "id" | "descrizione" | "prezzo">[]) =>
  [...new Set(righe.flatMap((r) => (r.prezzo ? [] : [tipoLavorazione(r)])).filter((t): t is TipoLavorazione => !!t))].sort();
