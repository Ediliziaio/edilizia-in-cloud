/**
 * Tante bolle insieme (05/11/2026): cosa si può caricare, cosa è un doppione e cosa va guardato
 * prima di confermare. Niente rete: la finestra legge i file, qui si decide. La regola è quella
 * degli allegati delle email: il sistema propone, la persona conferma. Una bolla smistata male
 * e non vista costa più di trenta secondi di controllo.
 */
import type { DDTRigaNuova } from "@/hooks/useDDTRicezione";
import type { LetturaDDT } from "@/lib/ddt/letturaAI";
import { abbinaFornitore, type FornitoreInRubrica } from "@/lib/ddt/abbinaFornitore";

/** Il limite di `ddt-ai-extract`. */
export const MAX_BYTE_BOLLA = 18 * 1024 * 1024;
/** Sotto questa sicurezza la lettura va guardata (la stessa soglia dell'import dei documenti). */
export const SICUREZZA_MINIMA = 0.7;
const TIPI = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const ESTENSIONI = /\.(pdf|jpe?g|png|webp|heic|heif)$/i;

export function motivoScartoFile(file: Pick<File, "name" | "type" | "size">): string | null {
  if (!TIPI.has(file.type) && !ESTENSIONI.test(file.name)) return "non è un PDF o una foto";
  if (file.size === 0) return "il file è vuoto";
  if (file.size > MAX_BYTE_BOLLA) return "pesa più di 18 MB";
  return null;
}

export interface BollaLetta {
  /** Identifica la riga nella finestra, non la bolla. */
  id: string;
  file: File;
  stato: "da_leggere" | "in_lettura" | "letta" | "non_letta";
  errore: string | null;
  numero: string;
  /** YYYY-MM-DD, vuota se sul documento non si legge. */
  data: string;
  supplierId: string | null;
  fornitoreLetto: string | null;
  abbinatoPer: string | null;
  orderId: string | null;
  destinazione: "magazzino" | "cantiere";
  righe: DDTRigaNuova[];
  confidenza: number | null;
  avvisi: string[];
  grezzo: Record<string, unknown> | null;
  trasportoACuraDi: LetturaDDT["trasportoACuraDi"];
  porto: LetturaDDT["porto"];
  corriere: string | null;
  targaMezzo: string | null;
  autistaNome: string | null;
  note: string | null;
  /** Un doppione si carica solo se la persona lo dice. */
  caricaComunque: boolean;
  esito: "salvata" | "errore" | null;
  motivoEsito: string | null;
}

export function bollaDaFile(file: File, id: string, partenza: { orderId?: string | null; destinazione: "magazzino" | "cantiere" }): BollaLetta {
  return {
    id, file, stato: "da_leggere", errore: null, numero: "", data: "", supplierId: null, fornitoreLetto: null, abbinatoPer: null,
    orderId: partenza.orderId ?? null, destinazione: partenza.destinazione, righe: [], confidenza: null, avvisi: [], grezzo: null,
    trasportoACuraDi: null, porto: null, corriere: null, targaMezzo: null, autistaNome: null, note: null,
    caricaComunque: false, esito: null, motivoEsito: null,
  };
}

/** Quello che la lettura porta: il fornitore si abbina solo se è certo, altrimenti resta da scegliere. */
export function conLettura(b: BollaLetta, letta: LetturaDDT, grezzo: unknown, rubrica: FornitoreInRubrica[]): BollaLetta {
  const trovato = abbinaFornitore(letta, rubrica);
  return {
    ...b,
    stato: "letta",
    errore: null,
    numero: letta.numero ?? "",
    data: letta.data ?? "",
    supplierId: trovato?.id ?? null,
    abbinatoPer: trovato?.motivo ?? null,
    fornitoreLetto: letta.fornitoreNome,
    righe: letta.righe,
    confidenza: letta.confidenza,
    avvisi: letta.avvisi,
    grezzo: grezzo && typeof grezzo === "object" ? (grezzo as Record<string, unknown>) : null,
    trasportoACuraDi: letta.trasportoACuraDi,
    porto: letta.porto,
    corriere: letta.corriere,
    targaMezzo: letta.targaMezzo,
    autistaNome: letta.autistaNome,
    note: letta.note,
  };
}

const numeroPulito = (n: string) => n.trim().toUpperCase().replace(/[\s./_-]/g, "");

/**
 * Stesso fornitore, stesso numero, stessa data: è la stessa bolla. Senza fornitore la chiave resta
 * quella: due bolle di fornitori ignoti con lo stesso numero e la stessa data meritano uno sguardo.
 */
export function chiaveBolla(supplierId: string | null | undefined, numero: string | null | undefined, data: string | null | undefined): string | null {
  const n = numeroPulito(numero ?? "");
  if (!n || !data) return null;
  return `${supplierId ?? "?"}|${n}|${data.slice(0, 10)}`;
}

export type MotivoDoppione = "gia_presente" | "nel_mucchio" | null;

/** Per ogni riga: è già fra le bolle dell'azienda, o è ripetuta in questo mucchio (vale la prima)? */
export function doppioni(bolle: ReadonlyArray<BollaLetta>, esistenti: ReadonlySet<string>): Map<string, MotivoDoppione> {
  const viste = new Set<string>();
  const esito = new Map<string, MotivoDoppione>();
  for (const b of bolle) {
    const k = chiaveBolla(b.supplierId, b.numero, b.data);
    if (!k) { esito.set(b.id, null); continue; }
    esito.set(b.id, esistenti.has(k) ? "gia_presente" : viste.has(k) ? "nel_mucchio" : null);
    viste.add(k);
  }
  return esito;
}

/** Cosa manca per poterla salvare: finché c'è qualcosa, la riga non parte. */
export function problemiBloccanti(b: BollaLetta): string[] {
  const p: string[] = [];
  if (!b.numero.trim()) p.push("manca il numero");
  if (!b.data) p.push("manca la data");
  if (b.destinazione === "cantiere" && !b.orderId) p.push("in cantiere serve la commessa");
  return p;
}

/**
 * Cosa va guardato, ma si può confermare lo stesso. Gli avvisi della lettura («manca il CAP del
 * destinatario») stanno fuori: ci sono su quasi ogni bolla, e se tutto è giallo non si guarda più niente.
 */
export function dubbi(b: BollaLetta): string[] {
  const d: string[] = [];
  if (!b.supplierId) d.push(b.fornitoreLetto ? `fornitore «${b.fornitoreLetto}» non riconosciuto` : "fornitore non riconosciuto");
  if (b.righe.length === 0) d.push("nessuna riga merce letta");
  if (b.confidenza != null && b.confidenza < SICUREZZA_MINIMA) d.push("lettura poco sicura");
  return d;
}

/** I problemi in cima, poi i dubbi: chi controlla comincia da lì. L'ordine dei file resta a parità. */
export function perAttenzione(bolle: ReadonlyArray<BollaLetta>, doppi: ReadonlyMap<string, MotivoDoppione>): BollaLetta[] {
  const peso = (b: BollaLetta) => {
    if (b.stato === "non_letta" || problemiBloccanti(b).length > 0) return 0;
    if (dubbi(b).length > 0) return 1;
    if (doppi.get(b.id)) return 2;
    return 3;
  };
  return bolle.map((b, i) => ({ b, i })).sort((x, y) => peso(x.b) - peso(y.b) || x.i - y.i).map((x) => x.b);
}

/** Quelle che partono alla conferma. */
export function pronte(bolle: ReadonlyArray<BollaLetta>, doppi: ReadonlyMap<string, MotivoDoppione>): BollaLetta[] {
  return bolle.filter((b) =>
    b.esito !== "salvata" && b.stato === "letta" && problemiBloccanti(b).length === 0 && (!doppi.get(b.id) || b.caricaComunque));
}

// ── Dalla riga della bolla all'articolo di magazzino ─────────────────────────────────────────

export interface ArticoloMagazzino {
  id: string;
  name: string;
  internal_code: string | null;
  barcode: string | null;
}

export interface RigaDaCaricare {
  id: string;
  codice_articolo: string | null;
  descrizione: string;
  unita_misura: string | null;
  quantita: number | null;
}

const pulito = (t: string | null | undefined) => (t ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const parole = (t: string) => new Set(pulito(t).split(/[^a-z0-9àèéìòù]+/).filter((p) => p.length >= 3));

/** Il magazzino conta a pezzi interi: solo così una riga può entrare senza chiedere. */
export function quantitaAPezzi(r: Pick<RigaDaCaricare, "quantita" | "unita_misura">): boolean {
  const q = Number(r.quantita);
  if (!Number.isInteger(q) || q <= 0) return false;
  return ["", "pz", "pz.", "n", "n.", "nr", "nr.", "pezzi", "pezzo"].includes(pulito(r.unita_misura));
}

/**
 * L'articolo certo: stesso codice o barcode, oppure stesso nome esatto, e uno solo. Una riga
 * certa ma non a pezzi interi non entra da sola: la quantità non sarebbe di pezzi.
 */
export function articoloCerto(r: RigaDaCaricare, articoli: ReadonlyArray<ArticoloMagazzino>): ArticoloMagazzino | null {
  const codice = pulito(r.codice_articolo);
  if (codice) {
    const perCodice = articoli.filter((a) => pulito(a.internal_code) === codice || pulito(a.barcode) === codice);
    if (perCodice.length === 1) return perCodice[0];
    if (perCodice.length > 1) return null;
  }
  const perNome = articoli.filter((a) => pulito(a.name) === pulito(r.descrizione));
  return perNome.length === 1 ? perNome[0] : null;
}

/** Il più simile per parole in comune, da proporre e non da applicare: decide la persona. */
export function articoloSimile(r: RigaDaCaricare, articoli: ReadonlyArray<ArticoloMagazzino>): ArticoloMagazzino | null {
  const cercate = parole(r.descrizione);
  if (cercate.size === 0) return null;
  let migliore: ArticoloMagazzino | null = null;
  let punti = 0;
  for (const a of articoli) {
    const suo = parole(a.name);
    const comuni = [...cercate].filter((p) => suo.has(p)).length;
    const p = comuni / Math.max(cercate.size, suo.size || 1);
    if (p > punti) { punti = p; migliore = a; }
  }
  return punti >= 0.5 ? migliore : null;
}

export interface SceltaCarico { riga_id: string; stock_item_id?: string; nuovo?: boolean }

/** Quello che entra subito, senza chiedere. */
export function scelteCerte(righe: ReadonlyArray<RigaDaCaricare>, articoli: ReadonlyArray<ArticoloMagazzino>): SceltaCarico[] {
  return righe.flatMap((r) => {
    const a = quantitaAPezzi(r) ? articoloCerto(r, articoli) : null;
    return a ? [{ riga_id: r.id, stock_item_id: a.id }] : [];
  });
}
