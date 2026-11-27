/**
 * Rendiconto giornaliero (27/11/2026): il foglio per il committente, un giorno alla volta, coi prezzi.
 * Il rapportino è il diario interno; questo è un documento suo. Le righe stanno in
 * `appalto_rendiconto_righe`, la testata in `rendiconti_giornalieri`. Il prezzo lo decide il database
 * (cantiere → listino committente → listino generale → a mano): qui si scrive e si rilegge.
 * Le funzioni nuove non sono ancora nei tipi generati: si chiamano con un cast stretto.
 */
import { supabase } from "@/integrations/supabase/client";

export type CategoriaRiga = "manodopera" | "mezzo" | "trasporto" | "materiale" | "voce";
export type StatoRendiconto = "bozza" | "confermato" | "annullato";
export type FonteRiga = "cantiere" | "committente" | "generale" | "manuale" | "mancante";

export const CATEGORIE: Array<{ valore: CategoriaRiga; titolo: string; unita: string }> = [
  { valore: "manodopera", titolo: "Manodopera", unita: "ora" },
  { valore: "mezzo", titolo: "Mezzi", unita: "ora" },
  { valore: "trasporto", titolo: "Trasporti", unita: "viaggio" },
  { valore: "materiale", titolo: "Materiali", unita: "cad" },
  { valore: "voce", titolo: "Altre voci", unita: "cad" },
];

export interface RendicontoGiornaliero {
  id: string;
  order_id: string;
  data: string;
  numero: number;
  stato: StatoRendiconto;
  descrizione_lavori: string | null;
  note: string | null;
  rapportino_id: string | null;
  righe: number;
  totale: number;
  senza_prezzo: number;
  sal_id: string | null;
  /** Rapportini del giorno già dentro questo rendiconto. */
  rapportini: number;
  /** Rapportini del giorno non ancora dentro (arrivati dopo, o scritti con il rendiconto già confermato). */
  rapportini_nuovi: number;
  /** Rapportini dentro un rendiconto confermato che poi sono stati rifiutati o annullati. */
  rapportini_ritirati: number;
}

export interface RigaRendiconto {
  /** Chiave locale per React: non va al database. */
  chiave: string;
  categoria: CategoriaRiga;
  descrizione: string;
  unita: string;
  quantita: number;
  prezzo_unitario: number | null;
  prezzo_a_mano: boolean;
  prezzo_fonte: FonteRiga | null;
  listino_voce_id: string | null;
  /** Voce del listino del committente usata (colonna `tariffa_id`): il prezzo viene da lì, collegata o no al generale. */
  appalto_tariffa_id: string | null;
  employee_id: string | null;
  /** Ditta (subappaltatore): senza voce scelta prende la tariffa della ditta. */
  subappaltatore_id: string | null;
  mezzo_id: string | null;
  fase_id: string | null;
  /** Maggiorazione (straordinario): importo = quantità × prezzo × (1 + %/100). */
  maggiorazione_pct: number;
  note: string | null;
  /** Solo in editor: la voce scelta ha un'unità diversa da quella del generale (non va al database). */
  avviso_unita?: string | null;
}

/** Una voce del listino del committente, come la dà `rendiconto_listino_committente`. */
export interface VoceListinoCommittente {
  appalto_tariffa_id: string;
  tariffa_id: string | null;
  codice: string | null;
  descrizione: string;
  unita: string;
  prezzo: number | null;
  fonte: FonteRiga | string;
  tipo?: string | null;
  collegata: boolean;
}

export interface DettaglioRendiconto {
  testata: RendicontoGiornaliero;
  righe: RigaRendiconto[];
}

/** `giorni` = i giorni con rapportini non ancora dentro un rendiconto; si crea un rendiconto per giorno. */
export interface EsitoDaRapportini { prova: boolean; giorni: number; da_creare: number; da_aggiornare: number; gia_fatti: number; creati: string[]; errori?: { data?: string; errore: string }[] }

/** Il rendiconto vivo di un giorno: `aggiunti` righe prese dai rapportini, `nuovi` rapportini rimasti fuori perché è confermato. */
export interface EsitoDelGiorno { id: string; numero: number; stato: StatoRendiconto; aggiunti: number; rapportini: number; nuovi: number }

type Esito<T> = PromiseLike<{ data: T | null; error: unknown }>;
interface Costruttore {
  select: (c: string) => Costruttore;
  eq: (c: string, v: string) => Costruttore;
  in: (c: string, v: string[]) => Costruttore;
  order: (c: string, o?: { ascending: boolean }) => Costruttore;
  then: Esito<unknown[]>["then"];
}
const db = supabase as unknown as {
  from: (t: string) => Costruttore;
  rpc: (f: string, a: object) => Esito<unknown>;
};

async function chiama<T>(funzione: string, args: object): Promise<T> {
  const { data, error } = await db.rpc(funzione, args);
  if (error) throw error;
  return data as T;
}

export const COLONNE_TESTATA = "id, order_id, data, numero, stato, descrizione_lavori, note, rapportino_id, righe, totale, senza_prezzo, sal_id, rapportini, rapportini_nuovi, rapportini_ritirati";
const COLONNE_RIGHE = "id, categoria, descrizione, unita_misura, quantita, prezzo_unitario, prezzo_a_mano, prezzo_fonte, listino_voce_id, tariffa_id, employee_id, subappaltatore_id, mezzo_id, fase_id, maggiorazione_pct, note, ordine";

const comeNumero = (x: unknown) => (x == null ? 0 : Number(x));

function leggiTestata(r: Record<string, unknown>): RendicontoGiornaliero {
  return {
    id: String(r.id), order_id: String(r.order_id), data: String(r.data), numero: comeNumero(r.numero),
    stato: r.stato as StatoRendiconto, descrizione_lavori: (r.descrizione_lavori as string | null) ?? null,
    note: (r.note as string | null) ?? null, rapportino_id: (r.rapportino_id as string | null) ?? null,
    righe: comeNumero(r.righe), totale: comeNumero(r.totale), senza_prezzo: comeNumero(r.senza_prezzo),
    sal_id: (r.sal_id as string | null) ?? null,
    rapportini: comeNumero(r.rapportini), rapportini_nuovi: comeNumero(r.rapportini_nuovi), rapportini_ritirati: comeNumero(r.rapportini_ritirati),
  };
}

/** Categorie delle righe dei rendiconti dati (una sola lettura per l'elenco): id rendiconto → categorie. */
export async function categorieRigheRendiconti(ids: string[]): Promise<Map<string, CategoriaRiga[]>> {
  const out = new Map<string, CategoriaRiga[]>();
  if (!ids.length) return out;
  const { data, error } = await (db.from("appalto_rendiconto_righe").select("rendiconto_giornaliero_id, categoria")
    .in("rendiconto_giornaliero_id", ids) as unknown as Esito<Array<Record<string, unknown>>>);
  if (error) throw error;
  for (const x of data ?? []) {
    const id = String(x.rendiconto_giornaliero_id);
    out.set(id, [...(out.get(id) ?? []), ((x.categoria as CategoriaRiga | null) ?? "voce")]);
  }
  return out;
}

/** «2 persone · 1 mezzo»: cosa c'è dentro un rendiconto senza descrizione. Vuoto se non ha righe. */
export function riassuntoRighe(categorie: CategoriaRiga[], tr: (k: string, v?: Record<string, unknown>) => string): string {
  if (!categorie.length) return tr("Vuoto");
  const n = (c: CategoriaRiga) => categorie.filter((x) => x === c).length;
  const parti: Array<[CategoriaRiga, string, string]> = [
    ["manodopera", "1 persona", "{n} persone"], ["mezzo", "1 mezzo", "{n} mezzi"], ["trasporto", "1 trasporto", "{n} trasporti"],
    ["materiale", "1 materiale", "{n} materiali"], ["voce", "1 voce", "{n} voci"],
  ];
  return parti.filter(([c]) => n(c) > 0).map(([c, uno, molti]) => (n(c) === 1 ? tr(uno) : tr(molti, { n: n(c) }))).join(" · ");
}

export async function elencoRendiconti(orderId: string): Promise<RendicontoGiornaliero[]> {
  const { data, error } = await (db.from("v_rendiconti_giornalieri").select(COLONNE_TESTATA).eq("order_id", orderId)
    .order("data", { ascending: false }).order("numero", { ascending: false }) as unknown as Esito<Array<Record<string, unknown>>>);
  if (error) throw error;
  return (data ?? []).map(leggiTestata);
}

let contatore = 0;
export const chiaveRiga = () => `r${++contatore}`;

export async function leggiRendiconto(id: string): Promise<DettaglioRendiconto> {
  const t = await (db.from("v_rendiconti_giornalieri").select(COLONNE_TESTATA).eq("id", id) as unknown as Esito<Array<Record<string, unknown>>>);
  if (t.error) throw t.error;
  const testata = t.data?.[0];
  if (!testata) throw new Error("Rendiconto non trovato");
  const r = await (db.from("appalto_rendiconto_righe").select(COLONNE_RIGHE).eq("rendiconto_giornaliero_id", id)
    .order("ordine", { ascending: true }) as unknown as Esito<Array<Record<string, unknown>>>);
  if (r.error) throw r.error;
  return {
    testata: leggiTestata(testata),
    righe: (r.data ?? []).map((x) => ({
      chiave: chiaveRiga(),
      categoria: (x.categoria as CategoriaRiga | null) ?? "voce",
      descrizione: String(x.descrizione ?? ""),
      unita: String(x.unita_misura ?? "cad"),
      quantita: comeNumero(x.quantita),
      prezzo_unitario: x.prezzo_unitario == null ? null : Number(x.prezzo_unitario),
      prezzo_a_mano: x.prezzo_a_mano === true,
      prezzo_fonte: (x.prezzo_fonte as FonteRiga | null) ?? null,
      listino_voce_id: (x.listino_voce_id as string | null) ?? null,
      appalto_tariffa_id: (x.tariffa_id as string | null) ?? null,
      employee_id: (x.employee_id as string | null) ?? null,
      subappaltatore_id: (x.subappaltatore_id as string | null) ?? null,
      mezzo_id: (x.mezzo_id as string | null) ?? null,
      fase_id: (x.fase_id as string | null) ?? null,
      maggiorazione_pct: comeNumero(x.maggiorazione_pct),
      note: (x.note as string | null) ?? null,
    })),
  };
}

export interface BozzaRendiconto { id?: string | null; order_id: string; data: string; descrizione_lavori: string; note: string; righe: RigaRendiconto[] }

/**
 * Il payload di `rendiconto_giornaliero_salva`. Una riga col listino e senza prezzo a mano NON manda il
 * prezzo: lo calcola il database. Chi ha toccato il prezzo (prezzo_a_mano) lo manda.
 */
export function payloadSalva(b: BozzaRendiconto) {
  return {
    ...(b.id ? { id: b.id } : {}),
    order_id: b.order_id,
    data: b.data,
    descrizione_lavori: b.descrizione_lavori,
    note: b.note,
    righe: b.righe.map((r) => ({
      categoria: r.categoria,
      descrizione: r.descrizione,
      unita: r.unita,
      quantita: r.quantita,
      // Il prezzo si manda solo se scritto a mano o se non c'è nessuna voce (generale o del committente).
      ...(r.prezzo_a_mano || (!r.listino_voce_id && !r.appalto_tariffa_id && !r.subappaltatore_id) ? { prezzo_unitario: r.prezzo_unitario ?? 0 } : {}),
      prezzo_a_mano: r.prezzo_a_mano,
      ...(r.listino_voce_id ? { listino_voce_id: r.listino_voce_id } : {}),
      // Con il prezzo a mano la voce del committente non si manda: il prezzo lo ha scritto l'utente.
      ...(r.appalto_tariffa_id && !r.prezzo_a_mano ? { appalto_tariffa_id: r.appalto_tariffa_id } : {}),
      ...(r.subappaltatore_id ? { subappaltatore_id: r.subappaltatore_id } : {}),
      ...(r.maggiorazione_pct > 0 ? { maggiorazione_pct: r.maggiorazione_pct } : {}),
      ...(r.employee_id ? { employee_id: r.employee_id } : {}),
      ...(r.mezzo_id ? { mezzo_id: r.mezzo_id } : {}),
      ...(r.fase_id ? { fase_id: r.fase_id } : {}),
      ...(r.note ? { note: r.note } : {}),
    })),
  };
}

export const salvaRendiconto = (b: BozzaRendiconto) => chiama<string>("rendiconto_giornaliero_salva", { p: payloadSalva(b) });
export const confermaRendiconto = (id: string) => chiama<unknown>("rendiconto_giornaliero_conferma", { p_id: id });
export const riapriRendiconto = (id: string) => chiama<unknown>("rendiconto_giornaliero_riapri", { p_id: id });
export const annullaRendiconto = (id: string) => chiama<unknown>("rendiconto_giornaliero_annulla", { p_id: id });
/** Il rendiconto del giorno del rapportino: lo stesso per tutti i rapportini di quel giorno. */
export const rendicontoDaRapportino = (rapportinoId: string) => chiama<string>("rendiconto_giornaliero_da_rapportino", { p_rapportino_id: rapportinoId });
export const rendicontoDelGiorno = (orderId: string, data: string) =>
  chiama<EsitoDelGiorno>("rendiconto_giornaliero_del_giorno", { p_order_id: orderId, p_data: data });
export const rendicontiDaRapportini = (orderId: string, prova: boolean, dal: string | null = null, al: string | null = null) =>
  chiama<EsitoDaRapportini>("rendiconti_giornalieri_da_rapportini", { p_order_id: orderId, p_dal: dal, p_al: al, p_prova: prova });

export const importoRiga = (r: Pick<RigaRendiconto, "quantita" | "prezzo_unitario"> & { maggiorazione_pct?: number | null }) =>
  Math.round((r.quantita || 0) * (r.prezzo_unitario ?? 0) * (1 + (r.maggiorazione_pct ?? 0) / 100) * 100) / 100;

export const rendicontoCopia = (origine: string, data: string) =>
  chiama<{ id: string; numero: number; stato: StatoRendiconto; copiate: number }>("rendiconto_giornaliero_copia", { p_origine: origine, p_data: data });

export const listinoCommittente = (orderId: string, data: string, testo: string) =>
  chiama<VoceListinoCommittente[]>("rendiconto_listino_committente", { p_order_id: orderId, p_data: data, p_testo: testo, p_limite: 20 });

export const salvaPrezzoPerCommittente = (orderId: string, listinoVoceId: string, prezzo: number, unita?: string, descrizione?: string) =>
  chiama<{ appalto_tariffa_id: string; contratto_id: string; contratto_creato: boolean }>("listino_committente_salva_prezzo", {
    p_order_id: orderId, p_listino_voce_id: listinoVoceId, p_prezzo: prezzo,
    ...(unita ? { p_unita: unita } : {}), ...(descrizione ? { p_descrizione: descrizione } : {}),
  });

/** Voci del committente prima, poi quelle del generale (senza ripetere quelle già collegate). */
export function unisciVoci<G extends { tariffa_id?: string }>(committente: VoceListinoCommittente[], generale: G[]) {
  const collegate = new Set(committente.map((v) => v.tariffa_id).filter(Boolean));
  return {
    committente,
    generale: generale.filter((v) => !v.tariffa_id || !collegate.has(v.tariffa_id)),
  };
}

/** Il rendiconto è vuoto e in bozza: si può riempire copiando un altro giorno. */
export const puoCopiare = (stato: StatoRendiconto, nRighe: number) => stato === "bozza" && nRighe === 0;

/** Unità scritta nella riga ≠ unità della voce scelta (ora ≠ giornata, mq ≠ pz): la quantità va riscritta. */
export const avvisoUnitaVoce = (unitaRiga: string, unitaVoce: string | null | undefined) =>
  !!unitaVoce && unitaRiga.trim().toLowerCase() !== unitaVoce.trim().toLowerCase();

export const ETICHETTA_FONTE: Record<FonteRiga, string> = {
  cantiere: "prezzo di cantiere",
  committente: "listino committente",
  generale: "listino generale",
  manuale: "a mano",
  mancante: "prezzo da definire",
};

/** Una riga è «senza prezzo» come la vede il database: prezzo 0 non scritto a mano. */
export const senzaPrezzo = (r: Pick<RigaRendiconto, "prezzo_unitario" | "prezzo_a_mano" | "listino_voce_id" | "prezzo_fonte"> & Partial<Pick<RigaRendiconto, "appalto_tariffa_id" | "subappaltatore_id">>) =>
  !r.prezzo_a_mano && (r.prezzo_fonte === "mancante" || (r.prezzo_unitario != null && r.prezzo_unitario === 0)
    || (r.prezzo_unitario == null && !r.listino_voce_id && !r.appalto_tariffa_id && !r.subappaltatore_id));
