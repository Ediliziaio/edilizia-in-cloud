/**
 * I beni su misura nella commessa: una riga di order_items per posizione, tutte
 * con lo stesso gruppo_id, mostrate come una voce sola che si apre. Regole pure:
 * le usano il popup «Aggiungi articolo», gli elenchi e i test.
 */
import { calcolaPrezzoFamiglia, type GridPoint } from "@/hooks/useFamilyPricing";
import type { AxisSelection, FamilyWithAxes } from "@/types/articleFamily";

export type StatoMisure = "da_rilevare" | "rilevato" | "confermato";

/** I settori in cui un prodotto a metro o a griglia si ordina davvero su misura. */
const VERTICALI_SU_MISURA = new Set(["serramenti", "serramentista", "pergole", "piscine"]);
const MODALITA_SU_MISURA = new Set(["griglia", "mq", "misura_libera"]);

/**
 * Su misura è un serramento, una pergola, un liner. Non le piastrelle al mq né i
 * 166 articoli di un altro settore importati «a griglia» (una vernice, una presa
 * TV): la modalità del prezzo da sola non basta, serve anche il settore.
 */
export function prodottoSuMisura(f: { vertical?: string | null; modalita_prezzo_base?: string | null }): boolean {
  return VERTICALI_SU_MISURA.has((f.vertical ?? "").toLowerCase()) && MODALITA_SU_MISURA.has(f.modalita_prezzo_base ?? "");
}

export interface RigaConGruppo {
  gruppo_id?: string | null;
  name: string;
  quantity: number;
  purchase_price?: number | null;
  position?: number | null;
}

export type VoceElenco<T> =
  | { tipo: "riga"; riga: T; indice: number }
  | {
      tipo: "gruppo";
      gruppoId: string;
      nome: string;
      righe: { riga: T; indice: number }[];
      pezzi: number;
      costo: number;
      /** Posizioni ancora senza costo («da definire»). */
      senzaCosto: number;
    };

/**
 * Le righe come si mostrano: quelle senza gruppo restano dove sono, quelle di un
 * gruppo diventano una voce sola al posto della prima. L'indice è quello
 * nell'elenco originale, che le azioni di riga si aspettano.
 */
export function raggruppaRighe<T extends RigaConGruppo>(righe: T[]): VoceElenco<T>[] {
  const voci: VoceElenco<T>[] = [];
  const gruppi = new Map<string, Extract<VoceElenco<T>, { tipo: "gruppo" }>>();
  righe.forEach((riga, indice) => {
    if (!riga.gruppo_id) {
      voci.push({ tipo: "riga", riga, indice });
      return;
    }
    let gruppo = gruppi.get(riga.gruppo_id);
    if (!gruppo) {
      gruppo = { tipo: "gruppo", gruppoId: riga.gruppo_id, nome: riga.name, righe: [], pezzi: 0, costo: 0, senzaCosto: 0 };
      gruppi.set(riga.gruppo_id, gruppo);
      voci.push(gruppo);
    }
    gruppo.righe.push({ riga, indice });
    gruppo.pezzi += Number(riga.quantity) || 0;
    const prezzo = Number(riga.purchase_price) || 0;
    gruppo.costo += prezzo * (Number(riga.quantity) || 0);
    if (prezzo <= 0) gruppo.senzaCosto += 1;
  });
  return voci;
}

/** «1200 × 1400» dalle misure della riga, null se non ci sono. */
export function misureLeggibili(m: Record<string, number> | null | undefined): string | null {
  const l = m?.larghezza_mm;
  const h = m?.altezza_mm;
  return l && h ? `${l} × ${h}` : null;
}

export const ETICHETTA_STATO_MISURE: Record<StatoMisure, string> = {
  da_rilevare: "Da rilevare",
  rilevato: "Rilevata",
  confermato: "Confermata",
};

export interface PosizioneBozza {
  /** Chiave di riga mentre si compila. */
  chiave: string;
  /** La riga salvata, in modifica. */
  id?: string;
  riferimento: string;
  larghezza: string;
  altezza: string;
  pezzi: string;
  /** Costo scritto a mano; vuoto = quello calcolato dal listino. */
  costo: string;
  /** Già avviata (ordinata, in arrivo…): si legge, non si cambia. */
  bloccata?: boolean;
}

const numero = (t: string): number | null => {
  const n = Number(t.trim().replace(",", "."));
  return t.trim() && Number.isFinite(n) ? n : null;
};

/** Il costo scritto, con la virgola o col punto; null se vuoto o illeggibile. */
export function costoScritto(t: string): number | null {
  if (!t.trim()) return null;
  const n = Number(t.trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Una posizione mai toccata: riferimento automatico e nessuna misura. Non diventa una riga. */
export function posizioneIntatta(p: PosizioneBozza): boolean {
  return !p.id && !p.larghezza.trim() && !p.altezza.trim() && !p.costo.trim() && /^P\d+$/i.test(p.riferimento.trim());
}

/**
 * Le posizioni che diventano righe. Quelle intatte restano fuori (la riga in più dopo Invio),
 * tranne quando sono tutte intatte e le misure sono da rilevare: «P1, P2, P3» è già la risposta
 * di chi sa quante finestre sono e non le ha ancora misurate.
 */
export function posizioniDaSalvare(posizioni: PosizioneBozza[], statoMisure: StatoMisure): PosizioneBozza[] {
  const toccate = posizioni.filter((p) => !posizioneIntatta(p));
  return toccate.length === 0 && statoMisure === "da_rilevare" ? posizioni : toccate;
}

/** Che cosa manca a una posizione, in italiano; null se va bene. */
export function erroreDiPosizione(p: PosizioneBozza): string | null {
  const nome = p.riferimento.trim() || "Una posizione";
  const l = numero(p.larghezza);
  const h = numero(p.altezza);
  if ((p.larghezza.trim() && (l == null || l < 10)) || (p.altezza.trim() && (h == null || h < 10))) {
    return `${nome}: le misure vanno scritte in millimetri (1200, non 1,2).`;
  }
  if (!!p.larghezza.trim() !== !!p.altezza.trim()) return `${nome}: scrivi sia L sia H, o lasciale vuote entrambe.`;
  const pz = numero(p.pezzi);
  if (pz == null || pz <= 0 || !Number.isInteger(pz)) return `${nome}: i pezzi sono un numero intero maggiore di zero.`;
  if (p.costo.trim()) {
    const c = costoScritto(p.costo);
    if (c == null || c < 0) return `${nome}: il costo non è un numero valido.`;
  }
  return null;
}

export interface EsitoCosto {
  costo: number | null;
  fuoriListino: boolean;
  avviso: string | null;
}

/**
 * Il costo unitario di una posizione col motore del preventivo: stesso prodotto,
 * stesse scelte, stesse misure, stessa cifra. Senza listino o senza misure è
 * «da definire», mai zero travestito da prezzo.
 */
export function costoDiListino(
  family: FamilyWithAxes,
  selezioni: AxisSelection,
  griglia: GridPoint[] | undefined,
  larghezza_mm: number | null,
  altezza_mm: number | null,
): EsitoCosto {
  if (larghezza_mm == null || altezza_mm == null) return { costo: null, fuoriListino: false, avviso: null };
  const r = calcolaPrezzoFamiglia({ family, selections: selezioni, larghezza_mm, altezza_mm, quantita: 1 }, griglia);
  if (r.fuori_listino) return { costo: null, fuoriListino: true, avviso: r.warnings[0] ?? "Misura fuori listino" };
  if (r.calcolo_disponibile === false || r.unit_price_acquisto <= 0) {
    return { costo: null, fuoriListino: false, avviso: r.warnings[0] ?? null };
  }
  return { costo: r.unit_price_acquisto, fuoriListino: false, avviso: r.costo_completo === false ? "Costo parziale: un supplemento non ha il costo d'acquisto." : null };
}

/** Il pezzo di testo che arriva a chi ordina finché l'ordine non legge le misure da solo. */
export function specifichePosizione(scelte: string[]): string {
  // Solo le scelte: riferimento e misure hanno i loro campi. Scritte qui resterebbero ferme
  // alle provvisorie e arriverebbero al fornitore accanto a quelle definitive.
  return scelte.filter(Boolean).join(" · ");
}

/** Misure provvisorie della riga, con le stesse chiavi del preventivo. */
export function misureDaBozza(l: number | null, h: number | null): Record<string, number> | null {
  if (l == null || h == null) return null;
  return { larghezza_mm: l, altezza_mm: h, mq: Math.round((l / 1000) * (h / 1000) * 10000) / 10000 };
}

export { numero as numeroDaCampo };
