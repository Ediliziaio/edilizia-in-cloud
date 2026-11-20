/**
 * I materiali proposti da «Genera dal computo» collegati a quello che l'azienda
 * compra già (14/11/2026): articoli del catalogo, voci dei listini fornitore,
 * materiali di commesse precedenti. Regole pure: i dati li carica il popup.
 *
 * Ordine:
 *   1. lo stesso codice (codice del prezzario della voce = SKU dell'articolo o
 *      codice della voce di listino);
 *   2. lo stesso materiale già comprato in un'altra commessa (descrizione e
 *      unità uguali, con l'articolo collegato);
 *   3. le parole: la maggior parte delle radici del materiale nel nome
 *      dell'articolo, con un'unità compatibile.
 * Un articolo venduto a sacchi o secchi («Intonaco premiscelato sacco 25 kg»)
 * converte la quantità: 1.500 kg diventano 60 sacchi.
 */
import { normalizzaTesto, normalizzaUnita, type RigaDistintaCalcolata } from "./generaDistinta";
import { chiaveDescrizione } from "./prezziMateriali";

export interface ArticoloCatalogo {
  id: string;
  name: string;
  sku?: string | null;
  unit_of_measure?: string | null;
  supplier_id?: string | null;
  prezzo_acquisto_netto?: number | null;
  standard_cost?: number | null;
  marca?: string | null;
  modello?: string | null;
}

export interface VoceListino {
  id: string;
  codice?: string | null;
  descrizione: string;
  unita?: string | null;
  prezzo?: number | null;
  sconto_pct?: number | null;
  supplier_id?: string | null;
  listino?: string | null;
}

/** Un materiale già comprato in un'altra commessa, con l'articolo che aveva. */
export interface MaterialeGiaUsato {
  name: string;
  unita_misura?: string | null;
  article_template_id: string | null;
  supplier_id?: string | null;
}

export type FonteCollegamento = "scelto" | "ricordato" | "codice" | "gia_usato" | "nome";

/** Un nome di materiale abbinato a mano a un articolo (product_aliases, learned_from 'voce_computo'). */
export interface AliasMateriale { alias_text: string; article_template_id: string }

/** Una giacenza di magazzino (warehouse_stock): solo per dire che c'è, non si preleva da qui. */
export interface VoceMagazzino { id: string; name: string; internal_code?: string | null; unita_misura?: string | null; quantity_available?: number | null }

export interface DatiCatalogo {
  articoli: ArticoloCatalogo[];
  listini: VoceListino[];
  giaUsati: MaterialeGiaUsato[];
  alias?: AliasMateriale[];
  magazzino?: VoceMagazzino[];
}

/** Un abbinamento possibile, col perché: la finestra li mostra a un clic. */
export interface Candidato {
  collegamento: Collegamento;
  /** 0-1: quanto è probabile che sia lui. */
  punteggio: number;
  motivo: string;
  /** Abbastanza sicuro da collegarlo senza chiedere. */
  automatico: boolean;
}

/** La scelta fatta a mano nella finestra: un articolo, una voce di listino, o nessuno. */
export type SceltaArticolo = { tipo: "articolo" | "listino"; id: string } | { tipo: "nessuno" };

export interface Collegamento {
  tipo: "articolo" | "listino";
  id: string;
  nome: string;
  fonte: FonteCollegamento;
  /** Prezzo d'acquisto per unità dell'articolo, se c'è. */
  prezzo: number | null;
  unita: string | null;
  supplier_id: string | null;
  listino?: string | null;
}

export interface Conversione {
  /** Quantità nell'unità dell'articolo («60»), già per eccesso. */
  quantita: number;
  unita: string;
  /** Quanto materiale c'è in una confezione (25 per i sacchi da 25 kg). */
  contenuto: number;
  /** «1.500 kg = 60 sacchi da 25 kg». */
  testo: string;
  /** La confezione non viene da un articolo o un listino ma dall'uso comune (sacchi da 25 kg…). */
  comune?: boolean;
}

/**
 * Le confezioni d'uso comune dei materiali a peso o a volume (14/11/2026): senza un
 * articolo collegato, 2.520 kg di intonaco si ordinano comunque in sacchi. Il primo
 * che corrisponde vince; un articolo o un listino con un'altra confezione vincono su
 * queste.
 */
const CONFEZIONI_COMUNI: [RegExp, { quantita: number; unita: "kg" | "l"; nome: string }][] = [
  [/^(?:stucco|nastro)/, { quantita: 5, unita: "kg", nome: "sacco" }],
  [/^(?:intonac|premiscelat|malta|massetto|rasante|collante|adesivo|cemento|calce|autolivell|livellin)/, { quantita: 25, unita: "kg", nome: "sacco" }],
  [/^(?:idropittur|pittur|smalt|vernic|intonachin)/, { quantita: 14, unita: "l", nome: "secchio" }],
  [/^(?:primer|fissativ|fondo)/, { quantita: 5, unita: "l", nome: "tanica" }],
  [/^(?:impermeabilizz|guaina liquida)/, { quantita: 20, unita: "kg", nome: "secchio" }],
];

export function confezioneComune(descrizione: string, unita: string): { quantita: number; unita: "kg" | "l"; nome: string } | null {
  const m = normalizzaUnita(unita);
  if (m !== "kg" && m !== "l") return null;
  const n = normalizzaTesto(descrizione);
  const c = CONFEZIONI_COMUNI.find(([re]) => re.test(n))?.[1];
  return c && c.unita === m ? c : null;
}

export interface MaterialeCollegato extends RigaDistintaCalcolata {
  collegamento: Collegamento | null;
  conversione: Conversione | null;
  /** I migliori abbinamenti possibili (anche quello scelto), per cambiarlo a un clic. */
  candidati: Candidato[];
  /** La stessa cosa in magazzino, se c'è. */
  magazzino: { nome: string; disponibile: number; unita: string | null } | null;
}

const PAROLE_VUOTE = new Set([
  "di", "del", "della", "dello", "dei", "degli", "delle", "e", "ed", "in", "per", "con", "a", "al", "alla", "da", "su", "tipo", "o",
  "il", "la", "lo", "le", "gli", "un", "una", "uno", "the",
]);

/** Unità di confezione: il materiale si conta in kg o litri, l'articolo a confezioni. */
// «tanic»: tanica e taniche (14/11/2026, il fissativo «tanica 5 l» del listino non si collegava).
const CONFEZIONI = /^(sacc|sacch|secch|latt|tanic|confez|conf|bidon|fust|cartuc|rotol)/;

/** Le radici significative: prime 6 lettere, niente numeri da soli. */
function radici(s: string): string[] {
  return [...new Set(normalizzaTesto(s).split(" ")
    // Le parole della confezione («sacco», «secchio») non dicono che materiale è.
    .filter((p) => p.length >= 3 && !PAROLE_VUOTE.has(p) && !/^[\d.]+$/.test(p) && !CONFEZIONI.test(p))
    .map((p) => p.slice(0, 6)))];
}


/** Peso o volume di una confezione scritto nel nome dell'articolo («sacco 25 kg», «secchio 14 l»). */
export function contenutoConfezione(nome: string): { quantita: number; unita: "kg" | "l" | "m" } | null {
  const barra = /\bbarre?\s+(?:da\s+)?(\d+(?:[.,]\d+)?)\s*m\b/i.exec(nome);
  if (barra && Number(barra[1].replace(",", ".")) > 0) return { quantita: Number(barra[1].replace(",", ".")), unita: "m" };
  const m = normalizzaTesto(nome).match(/\b(\d+(?:\.\d+)?)\s?(kg|lt|l)\b/);
  if (!m) return null;
  const q = Number(m[1]);
  return q > 0 ? { quantita: q, unita: m[2] === "kg" ? "kg" : "l" } : null;
}

function unitaCompatibili(materiale: string, articolo: string | null | undefined, nomeArticolo: string): boolean {
  const a = normalizzaUnita(articolo);
  const m = normalizzaUnita(materiale);
  if (!articolo?.trim() || a === m) return true;
  if (["cad", "pz"].includes(a) && ["cad", "pz"].includes(m)) return true;
  // kg o litri contro un articolo a confezione con il contenuto scritto nel nome.
  if (["kg", "l", "m"].includes(m) && (CONFEZIONI.test(a) || /^(?:cad|pz|barra|barre)$/.test(a))) {
    return contenutoConfezione(nomeArticolo)?.unita === m;
  }
  return false;
}

/**
 * Di che cosa è fatto: le parole che nominano il materiale. Un «piatto doccia in
 * ceramica 80x120» non è il «piatto doccia in resina 80x120» del catalogo, anche se
 * le altre parole coincidono (prova su Demo Azienda 2, 14/11/2026). Il gres è una
 * ceramica, l'inox un acciaio: lì non c'è conflitto.
 */
const MATERIE: [RegExp, string[]][] = [
  [/^ceram/, ["ceramica"]], [/^gres$/, ["gres", "ceramica"]], [/^porcel/, ["gres", "ceramica"]], [/^cotto$/, ["cotto"]],
  [/^resin/, ["resina"]], [/^acril/, ["acrilico"]], [/^(?:mineralmarmo|marmorres)/, ["resina"]],
  [/^ghisa$/, ["ghisa"]], [/^acciai/, ["acciaio"]], [/^inox$/, ["acciaio"]], [/^allumin/, ["alluminio"]],
  [/^rame$/, ["rame"]], [/^ottone$/, ["ottone"]], [/^zinc/, ["zinco"]],
  [/^legn/, ["legno"]], [/^(?:pvc|polivin)/, ["pvc"]], [/^(?:polipro\w*|pp)$/, ["polipropilene"]], [/^polietil/, ["polietilene"]],
  [/^multistrat/, ["multistrato"]], [/^marm(?!orres)/, ["marmo"]], [/^granit/, ["granito"]], [/^(?:vetr|cristal)/, ["vetro"]],
  [/^laminat/, ["laminato"]], [/^parquet/, ["legno"]], [/^vinil/, ["vinile"]], [/^lamiera/, ["acciaio"]],
];

function materie(s: string): Set<string> {
  const out = new Set<string>();
  for (const p of normalizzaTesto(s).split(" ")) for (const [re, m] of MATERIE) if (re.test(p)) m.forEach((x) => out.add(x));
  return out;
}

/** Le misure scritte come «80x120» o «60 x 60», in ordine crescente: 80x120 e 120x80 sono la stessa. */
function misure(s: string): Set<string> {
  const out = new Set<string>();
  for (const m of normalizzaTesto(s).matchAll(/\b(\d+(?:[.,]\d+)?)\s?x\s?(\d+(?:[.,]\d+)?)\b/g)) {
    out.add([Number(m[1].replace(",", ".")), Number(m[2].replace(",", "."))].sort((a, b) => a - b).join("x"));
  }
  return out;
}

const disgiunti = (a: Set<string>, b: Set<string>) => a.size > 0 && b.size > 0 && ![...a].some((x) => b.has(x));

/** Le classi del calcestruzzo nominate (C28/35…): due classi diverse non sono lo stesso getto. */
function classi(s: string): Set<string> {
  return new Set([...normalizzaTesto(s).matchAll(/\bc(\d{2,3})\/(\d{2,3})\b/g)].map((m) => `${m[1]}/${m[2]}`));
}

/** Il legante di una miscela non identifica il prodotto: cemento e adesivo cementizio sono acquisti diversi. */
function famigliaProdotto(s: string): string | null {
  const n = normalizzaTesto(s).replace(/^(?:sola )?fornitura (?:e posa (?:in opera )?)?(?:di |del |della )?/, "");
  const famiglie: Array<[RegExp, string]> = [
    [/^(?:adesiv|colla\b|collant)/, "collante"], [/^(?:cemento\b|cementi\b|legante idraulic)/, "cemento"],
    [/^(?:calcestruzz|conglomerato cementizio)/, "calcestruzzo"], [/^malta\b/, "malta"],
    [/^intonac/, "intonaco"], [/^rasant/, "rasante"], [/^stucco\b/, "stucco"],
    [/^(?:fissativ|primer\b|aggrappant)/, "fissativo"], [/^(?:idropittur|pittura\b|vernice\b)/, "pittura"],
  ];
  return famiglie.find(([re]) => re.test(n))?.[1] ?? null;
}

/** Materiale e articolo dicono cose diverse: prodotto, materia, misure o classe. */
export function nomiInConflitto(materiale: string, articolo: string): boolean {
  const a = famigliaProdotto(materiale), b = famigliaProdotto(articolo);
  return !!a && !!b && a !== b || disgiunti(materie(materiale), materie(articolo)) || disgiunti(misure(materiale), misure(articolo)) || disgiunti(classi(materiale), classi(articolo));
}

/** Quanto il nome di un articolo assomiglia al materiale: radici in comune sul totale del materiale. */
export function somiglianzaNome(materiale: string, articolo: string): number {
  const rm = radici(materiale);
  const ra = new Set(radici(articolo));
  if (!rm.length || !ra.size) return 0;
  if (nomiInConflitto(materiale, articolo)) return 0;
  const comuni = rm.filter((r) => ra.has(r)).length;
  if (comuni < Math.min(2, rm.length)) return 0;
  return comuni / rm.length;
}

const SOGLIA_NOME = 0.75;

/** Il prezzo netto di una voce di listino, con lo sconto. */
function prezzoListino(v: VoceListino): number | null {
  const p = Number(v.prezzo);
  if (!(p > 0)) return null;
  const sconto = Number(v.sconto_pct ?? 0);
  return Math.round(p * (1 - (sconto > 0 && sconto < 100 ? sconto / 100 : 0)) * 10000) / 10000;
}

function daArticolo(a: ArticoloCatalogo, fonte: FonteCollegamento): Collegamento {
  const p = Number(a.prezzo_acquisto_netto) > 0 ? Number(a.prezzo_acquisto_netto) : Number(a.standard_cost) > 0 ? Number(a.standard_cost) : null;
  return { tipo: "articolo", id: a.id, nome: a.name, fonte, prezzo: p, unita: a.unit_of_measure ?? null, supplier_id: a.supplier_id ?? null };
}

function daListino(v: VoceListino, fonte: FonteCollegamento): Collegamento {
  return { tipo: "listino", id: v.id, nome: v.descrizione, fonte, prezzo: prezzoListino(v), unita: v.unita ?? null, supplier_id: v.supplier_id ?? null, listino: v.listino ?? null };
}

/** I codici della voce di computo da cui viene la riga. */
function codiciRiga(r: RigaDistintaCalcolata): string[] {
  return r.origini.flatMap((o) => (o.tipo === "computo" && o.codice ? [o.codice.trim().toUpperCase()] : []));
}

const testoArticolo = (a: ArticoloCatalogo) => [a.name, a.marca, a.modello].filter(Boolean).join(" ");

/**
 * Gli abbinamenti possibili di un materiale, dal più probabile (14/11/2026):
 *   1. lo stesso nome abbinato a mano l'ultima volta (product_aliases);
 *   2. lo stesso codice (solo per i materiali che sono la voce stessa);
 *   3. lo stesso materiale comprato in un'altra commessa;
 *   4. le parole del nome (con marca e modello dell'articolo), fra articoli e listini.
 * Materia o misure diverse escludono sempre (ceramica ≠ resina, 80x120 ≠ 80x100).
 */
export function candidatiArticolo(r: RigaDistintaCalcolata, dati: DatiCatalogo, quanti = 5): Candidato[] {
  const out = new Map<string, Candidato>();
  const metti = (c: Collegamento, punteggio: number, motivo: string, automatico: boolean) => {
    if (nomiInConflitto(`${r.descrizione} ${r.specifiche ?? ""}`, c.nome) || !unitaCompatibili(r.unita_misura, c.unita, c.nome)) return;
    const k = `${c.tipo}:${c.id}`;
    const prima = out.get(k);
    if (!prima || prima.punteggio < punteggio) out.set(k, { collegamento: c, punteggio, motivo, automatico: automatico || !!prima?.automatico });
  };
  const nome = normalizzaTesto(r.descrizione);
  // 1. Scelto a mano l'ultima volta.
  for (const al of dati.alias ?? []) {
    if (normalizzaTesto(al.alias_text) !== nome) continue;
    const a = dati.articoli.find((x) => x.id === al.article_template_id);
    if (a) metti(daArticolo(a, "ricordato"), 0.99, "Scelto da voi l'ultima volta", true);
  }
  // 2. Lo stesso codice.
  if (r.fonte === "fornitura") {
    const codici = codiciRiga(r);
    if (codici.length) {
      for (const a of dati.articoli) if (a.sku && codici.includes(a.sku.trim().toUpperCase())) metti(daArticolo(a, "codice"), 0.97, "Stesso codice", true);
      for (const l of dati.listini) if (l.codice && codici.includes(l.codice.trim().toUpperCase())) metti(daListino(l, "codice"), 0.96, "Stesso codice nel listino", true);
    }
  }
  // 3. Già comprato così in un'altra commessa (una scelta di prima va comunque controllata).
  const chiave = chiaveDescrizione(r.descrizione);
  for (const m of dati.giaUsati) {
    if (!m.article_template_id || chiaveDescrizione(m.name) !== chiave || normalizzaUnita(m.unita_misura) !== normalizzaUnita(r.unita_misura)) continue;
    const a = dati.articoli.find((x) => x.id === m.article_template_id);
    if (a && !nomiInConflitto(r.descrizione, a.name)) metti(daArticolo(a, "gia_usato"), 0.92, "Già comprato in un'altra commessa", true);
  }
  // 4. Le parole.
  const testo = `${r.descrizione} ${r.specifiche ?? ""}`;
  // Lo stesso calcestruzzo della stessa classe (C16/20, C28/35) è lui, comunque si chiami il resto.
  const stessoGetto = (nome: string) => /^calcestruzz/i.test(r.descrizione) && /calcestruzz/i.test(nome)
    && [...classi(r.descrizione)].some((c) => classi(nome).has(c)) ? 0.85 : 0;
  for (const a of dati.articoli) {
    if (!unitaCompatibili(r.unita_misura, a.unit_of_measure, a.name)) continue;
    const p = Math.max(somiglianzaNome(r.descrizione, testoArticolo(a)), somiglianzaNome(testo, testoArticolo(a)) * 0.95, nomiInConflitto(r.descrizione, a.name) ? 0 : stessoGetto(a.name));
    if (p >= 0.5) metti(daArticolo(a, "nome"), p * 0.85, `Nome simile ${Math.round(p * 100)}%`, p >= SOGLIA_NOME);
  }
  for (const l of dati.listini) {
    if (!unitaCompatibili(r.unita_misura, l.unita, l.descrizione)) continue;
    const p = Math.max(somiglianzaNome(r.descrizione, l.descrizione), somiglianzaNome(testo, l.descrizione) * 0.95, nomiInConflitto(r.descrizione, l.descrizione) ? 0 : stessoGetto(l.descrizione)) - 0.01;
    if (p >= 0.5) metti(daListino(l, "nome"), p * 0.85, `Nome simile ${Math.round(p * 100)}%${l.listino ? ` · ${l.listino}` : ""}`, p >= SOGLIA_NOME);
  }
  return [...out.values()].sort((a, b) => b.punteggio - a.punteggio).slice(0, quanti);
}

export function trovaCollegamento(r: RigaDistintaCalcolata, dati: DatiCatalogo): Collegamento | null {
  return candidatiArticolo(r, dati).find((c) => c.automatico)?.collegamento ?? null;
}

/** La stessa cosa in magazzino: stesso codice interno, o lo stesso nome con un'unità compatibile. */
export function inMagazzino(r: RigaDistintaCalcolata, magazzino: VoceMagazzino[]): MaterialeCollegato["magazzino"] {
  const codici = codiciRiga(r);
  let migliore: { v: VoceMagazzino; p: number } | null = null;
  for (const v of magazzino) {
    if (!(Number(v.quantity_available) > 0)) continue;
    const perCodice = !!v.internal_code && codici.includes(v.internal_code.trim().toUpperCase());
    const p = perCodice ? 1 : unitaCompatibili(r.unita_misura, v.unita_misura, v.name) ? somiglianzaNome(r.descrizione, v.name) : 0;
    if (p >= SOGLIA_NOME && (!migliore || p > migliore.p)) migliore = { v, p };
  }
  return migliore ? { nome: migliore.v.name, disponibile: Number(migliore.v.quantity_available), unita: migliore.v.unita_misura ?? null } : null;
}

const formato = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 2 });

/** Da kg o litri alle confezioni dell'articolo, quando il nome dice quanto ne contiene. */
export function convertiInConfezioni(quantita: number, unitaMateriale: string, c: Collegamento | null, descrizione?: string): Conversione | null {
  const m = normalizzaUnita(unitaMateriale);
  if (m !== "kg" && m !== "l" && m !== "m") return null;
  // Un articolo o un listino venduto a kg o litri: si ordina così, niente confezioni.
  if (c && normalizzaUnita(c.unita) === m) return null;
  const contenuto = c ? contenutoConfezione(c.nome) : null;
  if (!contenuto || contenuto.unita !== m) {
    // Senza una confezione scritta nell'articolo: quella d'uso comune, se il materiale ne ha una.
    const barra = !c && m === "m" && descrizione ? contenutoConfezione(descrizione) : null;
    if (barra?.unita === "m") {
      const n = Math.ceil(quantita / barra.quantita - 1e-9);
      return { quantita: n, unita: "barra", contenuto: barra.quantita, testo: `${formato(quantita)} m = ${n} barre da ${formato(barra.quantita)} m (${formato(n * barra.quantita)} m acquistati)` };
    }
    const comune = !c && descrizione && m !== "m" ? confezioneComune(descrizione, m) : null;
    if (!comune) return null;
    const n = Math.ceil(quantita / comune.quantita - 1e-9);
    return { quantita: n, unita: comune.nome, contenuto: comune.quantita, comune: true, testo: `${formato(quantita)} ${m} = ${n} ${comune.nome} da ${formato(comune.quantita)} ${m}` };
  }
  const unitaArticolo = (c!.unita ?? "").trim();
  const n = Math.ceil(quantita / contenuto.quantita - 1e-9);
  const nomeConfezione = CONFEZIONI.test(normalizzaTesto(unitaArticolo)) || /^barr/.test(unitaArticolo) ? unitaArticolo : "conf";
  return { quantita: n, unita: nomeConfezione, contenuto: contenuto.quantita, testo: `${formato(quantita)} ${m} = ${n} ${nomeConfezione} da ${formato(contenuto.quantita)} ${m}` };
}

/** Quanto alza la sicurezza un collegamento: lo stesso codice o un acquisto passato dicono molto. */
const BONUS: Record<FonteCollegamento, number> = { scelto: 0.2, ricordato: 0.15, codice: 0.1, gia_usato: 0.1, nome: 0.05 };

/** Il collegamento scelto a mano: dai candidati, o dal catalogo intero (la ricerca libera). */
function daScelta(s: SceltaArticolo, candidati: Candidato[], dati: DatiCatalogo): Collegamento | null {
  if (s.tipo === "nessuno") return null;
  const c = candidati.find((x) => x.collegamento.tipo === s.tipo && x.collegamento.id === s.id)?.collegamento;
  if (c) return { ...c, fonte: "scelto" };
  if (s.tipo === "articolo") { const a = dati.articoli.find((x) => x.id === s.id); return a ? daArticolo(a, "scelto") : null; }
  const l = dati.listini.find((x) => x.id === s.id);
  return l ? daListino(l, "scelto") : null;
}

export function collegaMateriali(
  righe: RigaDistintaCalcolata[],
  dati: DatiCatalogo,
  scelte: Record<string, SceltaArticolo> = {},
): MaterialeCollegato[] {
  return righe.map((r) => {
    const gia = r.article_template_id ? dati.articoli.find((a) => a.id === r.article_template_id) : undefined;
    const candidati = candidatiArticolo(r, dati);
    const scelta = scelte[r.chiave];
    const collegamento = scelta ? daScelta(scelta, candidati, dati)
      : gia ? daArticolo(gia, "codice") : candidati.find((c) => c.automatico)?.collegamento ?? null;
    const conversione = convertiInConfezioni(r.quantita_calcolata, r.unita_misura, collegamento, r.descrizione);
    const affidabilita = !collegamento || (gia && !scelta) ? r.affidabilita : Math.min(0.99, r.affidabilita + BONUS[collegamento.fonte]);
    return {
      ...r,
      article_template_id: collegamento?.tipo === "articolo" ? collegamento.id : scelta ? null : r.article_template_id,
      supplier_id: collegamento?.supplier_id ?? (scelta ? null : r.supplier_id) ?? null,
      affidabilita,
      collegamento,
      conversione,
      candidati,
      magazzino: dati.magazzino?.length ? inMagazzino(r, dati.magazzino) : null,
    };
  });
}

/** La quantità che si ordina davvero: nelle confezioni, se ci sono. */
export function quantitaAcquisto(m: MaterialeCollegato): { quantita: number; unita: string } {
  return m.conversione ? { quantita: m.conversione.quantita, unita: m.conversione.unita } : { quantita: m.quantita_calcolata, unita: m.unita_misura };
}

/** Prezzo d'acquisto per l'unità d'ordine e totale della riga, dal collegamento (null se non c'è un prezzo). */
export function prezzoRiga(m: MaterialeCollegato): { unitario: number; unita: string; totale: number } | null {
  const c = m.collegamento;
  if (!c?.prezzo || !(c.prezzo > 0)) return null;
  const q = quantitaAcquisto(m);
  return { unitario: c.prezzo, unita: q.unita, totale: Math.round(c.prezzo * q.quantita * 100) / 100 };
}

/**
 * Il nuovo articolo del catalogo da un materiale senza collegamento (14/11/2026):
 * nome, unità d'acquisto e fornitore. Se si compra nella confezione d'uso comune,
 * il nome la dice («… sacco 25 kg»): così la prossima volta la conversione da kg a
 * sacchi viene dall'articolo. La specifica va nella descrizione, se dice qualcosa.
 */
export function articoloDaMateriale(m: MaterialeCollegato): { name: string; unit_of_measure: string; description: string | null; supplier_id: string | null } {
  const c = m.conversione;
  const confezione = c?.comune ? ` ${c.unita} ${c.contenuto.toLocaleString("it-IT")} ${normalizzaUnita(m.unita_misura)}` : "";
  const spec = m.specifiche && !/da progetto|dalla voce/i.test(m.specifiche) ? m.specifiche : null;
  return {
    name: `${m.descrizione}${confezione}`.slice(0, 200),
    unit_of_measure: c?.comune ? c.unita : m.unita_misura,
    description: spec,
    supplier_id: m.supplier_id ?? null,
  };
}

/** Gli abbinamenti scelti a mano da ricordare: solo quelli a un articolo (product_aliases vuole un articolo). */
export function aliasDaRicordare(materiali: MaterialeCollegato[], scelte: Record<string, SceltaArticolo>): AliasMateriale[] {
  const out = new Map<string, AliasMateriale>();
  for (const m of materiali) {
    const s = scelte[m.chiave];
    if (s?.tipo !== "articolo") continue;
    out.set(`${normalizzaTesto(m.descrizione)}|${s.id}`, { alias_text: m.descrizione, article_template_id: s.id });
  }
  return [...out.values()];
}

/**
 * La riga come la vuole materiali_salva_generazione: con la conversione la quantità
 * d'acquisto è nelle confezioni dell'articolo; quella calcolata resta nelle specifiche.
 * La chiave non cambia: al secondo import la riga si riconosce e si sostituisce.
 */
export function rigaDaSalvare(m: MaterialeCollegato) {
  const { collegamento, conversione, note, fonte, affidabilita, proposta_ai: _ai, candidati: _c, magazzino: _m, ...riga } = m;
  const extra = [
    _ai ? "Proposta AI: quantità e rese stimate, da validare con le misure e le specifiche del prodotto." : null,
    conversione?.comune ? `Ipotesi di confezione da confermare: ${conversione.testo}` : conversione?.testo,
    collegamento?.tipo === "listino" ? `Listino ${collegamento.listino ?? ""}: ${collegamento.nome}`.replace(/ {2,}/g, " ") : null,
  ]
    .filter(Boolean).join(" · ");
  return {
    ...riga,
    specifiche: [riga.specifiche, extra].filter(Boolean).join(" · ") || null,
    unita_misura: conversione ? conversione.unita : riga.unita_misura,
    quantita_calcolata: conversione ? conversione.quantita : riga.quantita_calcolata,
    quantita_netta: conversione ? Math.round((riga.quantita_netta / conversione.contenuto) * 10000) / 10000 : riga.quantita_netta,
    origini: riga.origini.map((o) => ({ ...o, fonte, affidabilita, note, ...(riga.verifica_acquisto ? { verifica_acquisto: riga.verifica_acquisto } : {}) })),
    // Il prezzo del listino del fornitore (netto, per l'unità d'acquisto): l'articolo
    // dell'azienda, se c'è, vince nel database (materiali_salva_generazione).
    purchase_price: collegamento?.tipo === "listino" && collegamento.prezzo ? collegamento.prezzo : null,
    prezzo_fonte: collegamento?.tipo === "listino" && collegamento.prezzo ? ("listino" as const) : null,
  };
}
