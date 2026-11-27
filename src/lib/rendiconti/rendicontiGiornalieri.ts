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
  employee_id: string | null;
  mezzo_id: string | null;
  fase_id: string | null;
  note: string | null;
}

export interface DettaglioRendiconto {
  testata: RendicontoGiornaliero;
  righe: RigaRendiconto[];
}

export interface EsitoDaRapportini { prova: boolean; da_creare: number; gia_fatti: number; gia_nel_rendiconto: number; creati: string[] }

type Esito<T> = PromiseLike<{ data: T | null; error: unknown }>;
interface Costruttore {
  select: (c: string) => Costruttore;
  eq: (c: string, v: string) => Costruttore;
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

export const COLONNE_TESTATA = "id, order_id, data, numero, stato, descrizione_lavori, note, rapportino_id, righe, totale, senza_prezzo, sal_id";
const COLONNE_RIGHE = "id, categoria, descrizione, unita_misura, quantita, prezzo_unitario, prezzo_a_mano, prezzo_fonte, listino_voce_id, employee_id, mezzo_id, fase_id, note, ordine";

const comeNumero = (x: unknown) => (x == null ? 0 : Number(x));

function leggiTestata(r: Record<string, unknown>): RendicontoGiornaliero {
  return {
    id: String(r.id), order_id: String(r.order_id), data: String(r.data), numero: comeNumero(r.numero),
    stato: r.stato as StatoRendiconto, descrizione_lavori: (r.descrizione_lavori as string | null) ?? null,
    note: (r.note as string | null) ?? null, rapportino_id: (r.rapportino_id as string | null) ?? null,
    righe: comeNumero(r.righe), totale: comeNumero(r.totale), senza_prezzo: comeNumero(r.senza_prezzo),
    sal_id: (r.sal_id as string | null) ?? null,
  };
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
      employee_id: (x.employee_id as string | null) ?? null,
      mezzo_id: (x.mezzo_id as string | null) ?? null,
      fase_id: (x.fase_id as string | null) ?? null,
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
      ...(r.prezzo_a_mano || !r.listino_voce_id ? { prezzo_unitario: r.prezzo_unitario ?? 0 } : {}),
      prezzo_a_mano: r.prezzo_a_mano,
      ...(r.listino_voce_id ? { listino_voce_id: r.listino_voce_id } : {}),
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
export const rendicontoDaRapportino = (rapportinoId: string) => chiama<string>("rendiconto_giornaliero_da_rapportino", { p_rapportino_id: rapportinoId });
export const rendicontiDaRapportini = (orderId: string, prova: boolean, dal: string | null = null, al: string | null = null) =>
  chiama<EsitoDaRapportini>("rendiconti_giornalieri_da_rapportini", { p_order_id: orderId, p_dal: dal, p_al: al, p_prova: prova });

export const importoRiga = (r: Pick<RigaRendiconto, "quantita" | "prezzo_unitario">) =>
  Math.round((r.quantita || 0) * (r.prezzo_unitario ?? 0) * 100) / 100;

export const ETICHETTA_FONTE: Record<FonteRiga, string> = {
  cantiere: "prezzo di cantiere",
  committente: "listino committente",
  generale: "listino generale",
  manuale: "a mano",
  mancante: "prezzo da definire",
};

/** Una riga è «senza prezzo» come la vede il database: prezzo 0 non scritto a mano. */
export const senzaPrezzo = (r: Pick<RigaRendiconto, "prezzo_unitario" | "prezzo_a_mano" | "listino_voce_id" | "prezzo_fonte">) =>
  !r.prezzo_a_mano && (r.prezzo_fonte === "mancante" || (r.prezzo_unitario != null && r.prezzo_unitario === 0) || (r.prezzo_unitario == null && !r.listino_voce_id));
