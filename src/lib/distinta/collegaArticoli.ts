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

export type FonteCollegamento = "codice" | "gia_usato" | "nome";

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
}

export interface MaterialeCollegato extends RigaDistintaCalcolata {
  collegamento: Collegamento | null;
  conversione: Conversione | null;
}

const PAROLE_VUOTE = new Set([
  "di", "del", "della", "dello", "dei", "degli", "delle", "e", "ed", "in", "per", "con", "a", "al", "alla", "da", "su", "tipo", "o",
  "il", "la", "lo", "le", "gli", "un", "una", "uno", "the",
]);

/** Unità di confezione: il materiale si conta in kg o litri, l'articolo a confezioni. */
const CONFEZIONI = /^(sacc|sacch|secch|latt|tanich|confez|conf|bidon|fust|cartuc|rotol)/;

/** Le radici significative: prime 6 lettere, niente numeri da soli. */
function radici(s: string): string[] {
  return [...new Set(normalizzaTesto(s).split(" ")
    // Le parole della confezione («sacco», «secchio») non dicono che materiale è.
    .filter((p) => p.length >= 3 && !PAROLE_VUOTE.has(p) && !/^[\d.]+$/.test(p) && !CONFEZIONI.test(p))
    .map((p) => p.slice(0, 6)))];
}


/** Peso o volume di una confezione scritto nel nome dell'articolo («sacco 25 kg», «secchio 14 l»). */
export function contenutoConfezione(nome: string): { quantita: number; unita: "kg" | "l" } | null {
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
  if ((m === "kg" || m === "l") && (CONFEZIONI.test(a) || ["cad", "pz"].includes(a))) {
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

/** Materiale e articolo dicono cose diverse: fatti di altro, o di altre misure. */
export function nomiInConflitto(materiale: string, articolo: string): boolean {
  return disgiunti(materie(materiale), materie(articolo)) || disgiunti(misure(materiale), misure(articolo));
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

export function trovaCollegamento(
  r: RigaDistintaCalcolata,
  dati: { articoli: ArticoloCatalogo[]; listini: VoceListino[]; giaUsati: MaterialeGiaUsato[] },
): Collegamento | null {
  // 1. Lo stesso codice: vale solo per i materiali che sono la voce stessa (non i componenti).
  if (r.fonte === "fornitura") {
    const codici = codiciRiga(r);
    if (codici.length) {
      const a = dati.articoli.find((x) => x.sku && codici.includes(x.sku.trim().toUpperCase()));
      if (a) return daArticolo(a, "codice");
      const l = dati.listini.find((x) => x.codice && codici.includes(x.codice.trim().toUpperCase()));
      if (l) return daListino(l, "codice");
    }
  }
  // 2. Già comprato così in un'altra commessa.
  const chiave = chiaveDescrizione(r.descrizione);
  const usato = dati.giaUsati.find((m) => m.article_template_id && chiaveDescrizione(m.name) === chiave
    && normalizzaUnita(m.unita_misura) === normalizzaUnita(r.unita_misura));
  const articoloUsato = usato && dati.articoli.find((a) => a.id === usato.article_template_id);
  // Anche una scelta di prima va controllata: un collegamento sbagliato non si propaga.
  if (articoloUsato && !nomiInConflitto(r.descrizione, articoloUsato.name)) return daArticolo(articoloUsato, "gia_usato");
  // 3. Le parole.
  let migliore: { c: Collegamento; p: number } | null = null;
  const testo = `${r.descrizione} ${r.specifiche ?? ""}`;
  for (const a of dati.articoli) {
    if (!unitaCompatibili(r.unita_misura, a.unit_of_measure, a.name)) continue;
    const p = Math.max(somiglianzaNome(r.descrizione, a.name), somiglianzaNome(testo, a.name) * 0.95);
    if (p >= SOGLIA_NOME && (!migliore || p > migliore.p)) migliore = { c: daArticolo(a, "nome"), p };
  }
  for (const l of dati.listini) {
    if (!unitaCompatibili(r.unita_misura, l.unita, l.descrizione)) continue;
    const p = Math.max(somiglianzaNome(r.descrizione, l.descrizione), somiglianzaNome(testo, l.descrizione) * 0.95) - 0.01;
    if (p >= SOGLIA_NOME && (!migliore || p > migliore.p)) migliore = { c: daListino(l, "nome"), p };
  }
  return migliore?.c ?? null;
}

const formato = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 2 });

/** Da kg o litri alle confezioni dell'articolo, quando il nome dice quanto ne contiene. */
export function convertiInConfezioni(quantita: number, unitaMateriale: string, c: Collegamento | null): Conversione | null {
  if (!c) return null;
  const m = normalizzaUnita(unitaMateriale);
  if (m !== "kg" && m !== "l") return null;
  const contenuto = contenutoConfezione(c.nome);
  if (!contenuto || contenuto.unita !== m) return null;
  const unitaArticolo = (c.unita ?? "").trim();
  if (normalizzaUnita(unitaArticolo) === m) return null;
  const n = Math.ceil(quantita / contenuto.quantita - 1e-9);
  const nomeConfezione = CONFEZIONI.test(normalizzaTesto(unitaArticolo)) ? unitaArticolo : "conf";
  return { quantita: n, unita: nomeConfezione, contenuto: contenuto.quantita, testo: `${formato(quantita)} ${m} = ${n} ${nomeConfezione} da ${formato(contenuto.quantita)} ${m}` };
}

/** Quanto alza la sicurezza un collegamento: lo stesso codice o un acquisto passato dicono molto. */
const BONUS: Record<FonteCollegamento, number> = { codice: 0.1, gia_usato: 0.1, nome: 0.05 };

export function collegaMateriali(
  righe: RigaDistintaCalcolata[],
  dati: { articoli: ArticoloCatalogo[]; listini: VoceListino[]; giaUsati: MaterialeGiaUsato[] },
): MaterialeCollegato[] {
  return righe.map((r) => {
    const gia = r.article_template_id ? dati.articoli.find((a) => a.id === r.article_template_id) : undefined;
    const collegamento = gia ? daArticolo(gia, "codice") : trovaCollegamento(r, dati);
    const conversione = convertiInConfezioni(r.quantita_calcolata, r.unita_misura, collegamento);
    return {
      ...r,
      article_template_id: collegamento?.tipo === "articolo" ? collegamento.id : r.article_template_id,
      supplier_id: r.supplier_id ?? collegamento?.supplier_id ?? null,
      affidabilita: collegamento && !gia ? Math.min(0.99, r.affidabilita + BONUS[collegamento.fonte]) : r.affidabilita,
      collegamento,
      conversione,
    };
  });
}

/**
 * La riga come la vuole materiali_salva_generazione: con la conversione la quantità
 * d'acquisto è nelle confezioni dell'articolo; quella calcolata resta nelle specifiche.
 * La chiave non cambia: al secondo import la riga si riconosce e si sostituisce.
 */
export function rigaDaSalvare(m: MaterialeCollegato) {
  const { collegamento, conversione, note, fonte, affidabilita, proposta_ai: _ai, ...riga } = m;
  const extra = [conversione?.testo, collegamento?.tipo === "listino" ? `Listino ${collegamento.listino ?? ""}: ${collegamento.nome}`.replace(/ {2,}/g, " ") : null]
    .filter(Boolean).join(" · ");
  return {
    ...riga,
    specifiche: [riga.specifiche, extra].filter(Boolean).join(" · ") || null,
    unita_misura: conversione ? conversione.unita : riga.unita_misura,
    quantita_calcolata: conversione ? conversione.quantita : riga.quantita_calcolata,
    quantita_netta: conversione ? Math.round((riga.quantita_netta / conversione.contenuto) * 10000) / 10000 : riga.quantita_netta,
    origini: riga.origini.map((o) => ({ ...o, fonte, affidabilita, note })),
  };
}
