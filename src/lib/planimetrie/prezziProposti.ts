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
import { tipoCostruzione, type TipoCostruzione } from "./nuovaCostruzione";

export type TipoLavorazione =
  | "demolizione_tramezzo" | "demolizione_muratura" | "nuovo_tramezzo" | "nuova_muratura"
  | "macerie" | "ripristino" | "intonaco" | "tinteggiatura" | "battiscopa"
  | "porta" | "finestra" | "portafinestra" | "varco" | "chiusura_vano" | "rimozione_serramento"
  | "pavimento" | "rivestimento"
  | "radiante_pannelli" | "radiante_tubo" | "radiante_collettore"
  // Nuova costruzione (nuovaCostruzione.ts): scavi, strutture, solai, involucro, impianti, esterni.
  | TipoCostruzione;

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
  radiante_pannelli: { parole: [["radiant", "pavimento riscaldat"], ["pannell", "isolant", "bugnat"]], cerca: "pannello isolante bugnato pavimento radiante", indicativo: 22 },
  radiante_tubo: { parole: [["radiant", "pavimento riscaldat"], ["tubo", "tubazion", "pe x", "pex", "pe rt"]], cerca: "tubo pavimento radiante", indicativo: 2.8 },
  radiante_collettore: { parole: [["collettor"], ["radiant", "riscaldament"]], cerca: "collettore pavimento radiante", indicativo: 480 },
  // Nuova costruzione: fornitura e posa, ordini di grandezza 2026 per un edificio residenziale.
  ponteggio: { parole: [["ponteggi"]], evita: ["smontaggio solo"], cerca: "ponteggio metallico facciata nolo", indicativo: 14 },
  micropali: { parole: [["micropal", "pali trivell"]], cerca: "micropali perforazione armatura iniezione", indicativo: 95 },
  adeguamento_sismico: { parole: [["adeguament", "miglioramento", "rinforz"], ["sismic", "struttur"]], cerca: "adeguamento sismico struttura esistente", indicativo: 120 },
  rimozione_copertura: { parole: [["rimoz", "demoliz", "smontag"], ["copertur", "tetto", "manto"]], cerca: "rimozione copertura smaltimento", indicativo: 35 },
  svuotamento: { parole: [["svuotament", "strip out", "demolizioni interne"]], cerca: "demolizioni interne svuotamento", indicativo: 45 },
  scavo: { parole: [["scavo", "sbancament"]], evita: ["rinterr", "trasport", "a mano"], cerca: "scavo sbancamento mezzi meccanici", indicativo: 14 },
  rinterro: { parole: [["rinterr", "reinterr"]], cerca: "rinterro materiale scavo", indicativo: 9 },
  trasporto_terre: { parole: [["terre", "terra", "materiale di scavo"], ["trasport", "conferiment", "discarica"]], cerca: "trasporto conferimento terre scavo discarica", indicativo: 22 },
  magrone: { parole: [["magrone", "sottofondazion"]], cerca: "calcestruzzo magro sottofondazione", indicativo: 20 },
  fondazioni_ca: { parole: [["fondazion", "platea", "plint", "travi rovesc"], ["calcestruzz", "c a ", "cemento armato"]], evita: ["magro", "sottofondaz", "scavo"], cerca: "calcestruzzo fondazioni armato", indicativo: 330 },
  muri_controterra: { parole: [["controterra", "contro terra", "muri di sostegno"]], evita: ["impermeab", "drenag"], cerca: "muri controterra calcestruzzo armato", indicativo: 420 },
  impermeabilizzazione_controterra: { parole: [["impermeab", "guaina"], ["controterra", "contro terra", "fondazion"]], cerca: "impermeabilizzazione muri controterra", indicativo: 38 },
  vespaio: { parole: [["vespaio", "igloo", "iglu", "cupolex"]], cerca: "vespaio aerato igloo", indicativo: 48 },
  struttura_ca: { parole: [["pilastr", "travi", "elevazion"], ["calcestruzz", "c a ", "cemento armato"]], evita: ["fondazion", "rovesc"], cerca: "calcestruzzo strutture elevazione pilastri travi", indicativo: 620 },
  cordoli_ca: { parole: [["cordol"]], evita: ["marciapied", "fondazion"], cerca: "cordolo calcestruzzo armato", indicativo: 480 },
  struttura_legno: { parole: [["x lam", "xlam", "clt"]], cerca: "struttura legno x lam pannelli", indicativo: 1100 },
  solaio_laterocemento: { parole: [["solai"], ["laterocement", "latero cement", "travetti", "pignatt"]], evita: ["demoliz", "predall"], cerca: "solaio laterocemento", indicativo: 85 },
  solaio_predalles: { parole: [["predall", "lastre tralicciat"]], cerca: "solaio predalles", indicativo: 95 },
  solaio_legno: { parole: [["solai"], ["legno"]], evita: ["demoliz"], cerca: "solaio legno travi tavolato", indicativo: 130 },
  copertura: { parole: [["copertur", "tetto", "manto"]], evita: ["demoliz", "rimoz", "fotovolt"], cerca: "copertura tetto isolamento manto tegole", indicativo: 150 },
  terrazzo: { parole: [["terrazz", "copertura piana", "lastrico"]], evita: ["demoliz", "rimoz"], cerca: "copertura piana impermeabilizzazione terrazzo", indicativo: 120 },
  scala: { parole: [["scal"], ["calcestruzz", "c a ", "rampa"]], evita: ["ponteggi", "scala mobile"], cerca: "scala calcestruzzo armato rampa", indicativo: 4800 },
  tamponatura: { parole: [["tampon", "muratura estern", "blocchi"]], evita: ["demoliz", "vano", "vani", "chiusura"], cerca: "tamponatura blocchi laterizio termico", indicativo: 78 },
  cappotto: { parole: [["cappott"]], evita: ["rimoz", "demoliz"], cerca: "isolamento cappotto eps rasatura", indicativo: 78 },
  intonaco_esterno: { parole: [["intonac"], ["estern", "facciat"]], evita: ["demoliz", "rimoz"], cerca: "intonaco esterno facciate", indicativo: 30 },
  massetto: { parole: [["massett", "sottofond"]], evita: ["demoliz", "rimoz", "radiant"], cerca: "massetto sottofondo sabbia cemento", indicativo: 24 },
  isolamento_pavimento: { parole: [["isolament", "isolant"], ["pavim", "solaio a terra", "contro terra"]], evita: ["radiant", "acustic"], cerca: "isolamento termico pavimento", indicativo: 20 },
  impianto_elettrico: { parole: [["impianto elettric", "elettrico"]], evita: ["smontagg", "rimoz", "fotovolt"], cerca: "impianto elettrico appartamento", indicativo: 48 },
  bagno_completo: { parole: [["bagn", "idrico sanitar", "sanitar"]], evita: ["demoliz", "rimoz"], cerca: "impianto idrico sanitario bagno completo", indicativo: 4200 },
  attacchi_cucina: { parole: [["cucin"], ["attacc", "scaric", "idric"]], cerca: "attacchi idrici scarichi cucina", indicativo: 950 },
  riscaldamento_radiante: { parole: [["radiant", "pavimento riscaldat"]], evita: ["pannell", "tubo", "collettor"], cerca: "impianto pavimento radiante completo", indicativo: 58 },
  riscaldamento_radiatori: { parole: [["radiator", "termosifon"]], evita: ["rimoz", "smontag"], cerca: "impianto riscaldamento radiatori", indicativo: 48 },
  pompa_di_calore: { parole: [["pompa di calore", "pompe di calore"]], cerca: "pompa di calore aria acqua", indicativo: 9800 },
  caldaia: { parole: [["caldai"]], evita: ["rimoz", "smontag"], cerca: "caldaia condensazione", indicativo: 3400 },
  portoncino: { parole: [["portoncin", "porta blindat", "blindat"]], cerca: "portoncino blindato ingresso", indicativo: 1700 },
  marciapiede: { parole: [["marciapied"]], cerca: "marciapiede perimetrale", indicativo: 60 },
  allacciamenti: { parole: [["allacciament", "allacci"]], cerca: "allacciamento reti acqua fognatura", indicativo: 6500 },
  prato: { parole: [["prato", "tappeto erboso", "semina"]], cerca: "tappeto erboso terra vegetale", indicativo: 14 },
  pavimentazione_esterna: { parole: [["paviment"], ["estern", "esterni", "cortil"]], evita: ["intern", "demoliz"], cerca: "pavimentazione esterna gres massetto", indicativo: 75 },
  vialetto: { parole: [["vialett", "camminament", "percorso pedonal"]], cerca: "vialetto pedonale pavimentato", indicativo: 70 },
  ghiaia: { parole: [["ghiaia", "ghiaietto", "brecciolin"]], cerca: "ghiaia stesa telo", indicativo: 18 },
  parcheggio_esterno: { parole: [["parchegg", "passo carr", "autobloccant", "betonell"]], cerca: "pavimentazione drenante autobloccanti parcheggio", indicativo: 60 },
  aiuola: { parole: [["aiuol", "piantumaz"]], cerca: "aiuola terra vegetale piantumazione", indicativo: 25 },
  recinzione: { parole: [["recinzion"]], evita: ["cantiere", "provvisor"], cerca: "recinzione muretto rete", indicativo: 85 },
  piscina: { parole: [["piscin"]], evita: ["pulizia", "manutenz"], cerca: "piscina interrata vasca calcestruzzo", indicativo: 900 },
  pergola: { parole: [["pergol"]], cerca: "pergola legno alluminio", indicativo: 3500 },
  idromassaggio: { parole: [["idromassagg", "minipiscin", "spa"]], cerca: "minipiscina idromassaggio", indicativo: 8000 },
};

export const FONTE_INDICATIVA = "Prezzo indicativo 2026, da confermare";

/** Che lavorazione è una riga dello studio; null se non la riconosco (resta da quotare). */
export function tipoLavorazione(r: Pick<RigaStudio, "id" | "descrizione">): TipoLavorazione | null {
  const costruzione = tipoCostruzione(r.id);
  if (costruzione) return costruzione;
  const coda = /-(macerie|ripristino|intonaco|tinteggiatura|battiscopa)$/.exec(r.id)?.[1];
  if (coda) return coda as TipoLavorazione;
  if (/-radiante-pannelli$/.test(r.id)) return "radiante_pannelli";
  if (/-radiante-(circuito-\d+|tubo)$/.test(r.id)) return "radiante_tubo";
  if (/-radiante-collettore$/.test(r.id)) return "radiante_collettore";
  const d = r.descrizione;
  if (d.startsWith("Demolizione tramezzo")) return "demolizione_tramezzo";
  if (d.startsWith("Demolizione parete")) return "demolizione_muratura";
  if (d.startsWith("Nuovo tramezzo")) return "nuovo_tramezzo";
  if (d.startsWith("Nuova muratura")) return "nuova_muratura";
  if (d.startsWith("Tamponatura esterna")) return "tamponatura";
  if (d.startsWith("Chiusura ")) return "chiusura_vano";
  if (d.startsWith("Rimozione ") && /porta|finestra|varco/.test(d)) return "rimozione_serramento";
  const nuova = /^Realizzazione (portafinestra|porta|finestra|varco)$/.exec(d)?.[1];
  if (nuova) return nuova as TipoLavorazione;
  if (d.startsWith("Posa pavimento")) return "pavimento";
  if (d.startsWith("Rivestimento ·")) return "rivestimento";
  return null;
}

export interface VoceDiPrezzo {
  codice: string | null; descrizione: string; unita: string | null; prezzo: number;
  /** Voce a spessore del prezzario: `prezzo` vale per `daCm`, ogni cm in più costa `perCm.prezzo`. */
  perCm?: { codice: string; prezzo: number; daCm: number };
}
export interface FontiPrezzi {
  /** Il listino dell'azienda. */
  listino: readonly VoceDiPrezzo[];
  /**
   * La voce del prezzario pubblico abbinata per codice a ogni lavorazione
   * (`shared/planimetrie/abbinamentiPrezzario.ts`): già verificata, non si filtra per parole.
   */
  prezzario: Partial<Record<TipoLavorazione, VoceDiPrezzo>>;
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

/**
 * Una voce a spessore (base + ogni cm in più) per la riga che dice lo spessore («Isolamento a
 * cappotto 12 cm»): 4 cm della base + 8 cm in più. Null se la voce non è a spessore, o se la riga
 * non dice lo spessore: allora la voce non quota la riga, perché il prezzo dipende da lì.
 * Uno spessore sotto quello della base prende la base (il prezzario non scende).
 */
function conSpessore(v: VoceDiPrezzo, descrizione: string): { importo: number; codici: string } | null {
  if (!v.perCm || !(v.perCm.prezzo > 0)) return null;
  const cm = Number(/(\d+(?:[.,]\d+)?)\s*cm\b/.exec(descrizione)?.[1]?.replace(",", "."));
  if (!(cm > 0)) return null;
  const inPiu = Math.max(0, Math.ceil(cm - v.perCm.daCm - 1e-9));
  return {
    importo: Math.round((v.prezzo + inPiu * v.perCm.prezzo) * 100) / 100,
    codici: inPiu ? `${v.codice ?? ""} + ${inPiu} × ${v.perCm.codice}` : v.codice ?? "",
  };
}

/** Il prezzo proposto per una riga, con la fonte; null se resta da quotare. */
export function proponiPrezzo(r: Pick<RigaStudio, "id" | "descrizione" | "unita">, fonti: FontiPrezzi = FONTI_VUOTE): PrezzoVocePlanimetria | null {
  const tipo = tipoLavorazione(r);
  if (!tipo) {
    const v = impianto(r.id);
    return v && unitaCompatibili(v.unita, r.unita) ? { importo: v.prezzo, unita: r.unita, fonte: FONTE_INDICATIVA, tariffa: "" } : null;
  }
  const delListino = adatte(tipo, r.unita, fonti.listino).sort((a, b) => b.punti - a.punti)[0];
  if (delListino) return { importo: delListino.v.prezzo, unita: r.unita, fonte: "Listino aziendale", tariffa: (delListino.v.codice ?? "").slice(0, 120) };
  // Il prezzario: solo la voce abbinata per codice, e solo se l'unità è quella della riga.
  const v = fonti.prezzario[tipo];
  if (v && fonti.prezzarioNome && Number.isFinite(v.prezzo) && v.prezzo > 0 && unitaCompatibili(v.unita, r.unita)) {
    const spessore = conSpessore(v, r.descrizione);
    if (spessore) return { importo: spessore.importo, unita: r.unita, tariffa: spessore.codici.slice(0, 120),
      fonte: `Prezzario ${fonti.prezzarioNome} · ${spessore.codici}, da confermare`.slice(0, 300) };
    if (!v.perCm) return { importo: v.prezzo, unita: r.unita, tariffa: (v.codice ?? "").slice(0, 120),
      fonte: `Prezzario ${fonti.prezzarioNome} · ${v.codice ?? ""}, da confermare`.slice(0, 300) };
  }
  // «A corpo» non ha un ordine di grandezza che valga per tutti, tranne le macerie di una parete
  // e gli allacciamenti di una nuova costruzione.
  if (r.unita === "a corpo" && tipo !== "macerie" && tipo !== "allacciamenti") return null;
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
