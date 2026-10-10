/**
 * Quanti contatti e quante opportunità hanno ogni tag (pagina Impostazioni → Tag).
 *
 * Prima la pagina scaricava `id, tags` di tutti i contatti e delle opportunità e li contava nel browser. Ma una
 * risposta di PostgREST si ferma a 1.000 righe: con più di mille contatti con tag (sei aziende il 09/10/2026, una ne
 * ha 96.251) i conteggi erano troppo bassi, un tag usato poteva sembrare «non usato» e la guardia che impedisce di
 * eliminare un tag in uso lasciava passare l'eliminazione.
 *
 * Ora:
 *  - i CONTATTI si contano dentro il database con la funzione che alimenta già i filtri dei Contatti
 *    (`marketing_valori_filtro_contatti`, in lettura, con le stesse regole di visibilità di chi chiama): ritorna
 *    ogni tag in uso con quanti contatti lo hanno, qualunque sia il numero di contatti;
 *  - le OPPORTUNITÀ si leggono a pagine da mille, fino alla fine, e si contano qui.
 *
 * Il nome di un tag si confronta senza maiuscole né spazi doppi (`normalizeTagName`), come ovunque nel CRM: «Cliente
 * caldo» e «cliente  caldo» sono lo stesso tag (l'8% dei tag dei contatti oggi non è scritto in forma normale).
 */
import { supabase } from "@/integrations/supabase/client";
import { normalizeTagName } from "@/lib/marketingTags";

/** Quante righe restituisce al massimo una risposta di PostgREST. */
export const RIGHE_PER_PAGINA = 1000;
/** Quante pagine si chiedono insieme (la prima dice quante ne servono). */
const PAGINE_IN_PARALLELO = 5;
/** La funzione dei filtri ritorna al massimo 500 tag diversi: oltre, l'elenco è incompleto. */
export const TAG_MASSIMI_DALLA_FUNZIONE = 500;

export interface UsoTag {
  contatti: number;
  opportunita: number;
}
export type UsoTagPerNome = Record<string, UsoTag>;

export interface LetturaUsoTag {
  /** Per nome normalizzato. Un tag che non compare qui non è usato da nessuno. */
  uso: UsoTagPerNome;
  /** I tag dei contatti sono più di quelli che la funzione elenca: i meno usati potrebbero mancare. */
  elencoContattiIncompleto: boolean;
}

interface RigaValoreContatti {
  valore: string | null;
  contatti: number | string | null;
}

/**
 * Somma le grafie dello stesso tag. La funzione raggruppa per testo esatto: «Cliente caldo» e «cliente caldo» arrivano
 * come due righe, qui diventano un tag solo.
 */
export function sommaGrafieContatti(righe: readonly RigaValoreContatti[]): Record<string, number> {
  const somma: Record<string, number> = {};
  for (const riga of righe) {
    const nome = normalizeTagName(riga.valore);
    if (!nome) continue;
    somma[nome] = (somma[nome] ?? 0) + (Number(riga.contatti) || 0);
  }
  return somma;
}

/** Quante opportunità hanno ogni tag (una volta sola per opportunità, anche se il tag è scritto due volte). */
export function contaOpportunitaPerTag(righe: readonly { tags: readonly (string | null)[] | null }[]): Record<string, number> {
  const conteggio: Record<string, number> = {};
  for (const riga of righe) {
    const nomi = new Set((riga.tags ?? []).map((tag) => normalizeTagName(tag)).filter(Boolean));
    nomi.forEach((nome) => {
      conteggio[nome] = (conteggio[nome] ?? 0) + 1;
    });
  }
  return conteggio;
}

interface RispostaPagina<T> {
  data: T[] | null;
  error: { message?: string } | null;
  count?: number | null;
}

/**
 * Legge TUTTE le righe di una query, a pagine. La prima risposta dice quante righe ci sono in tutto
 * (`count: "exact"`), le altre pagine si chiedono poche per volta. `leggi(da, a)` deve ordinare per una colonna
 * stabile, altrimenti due pagine potrebbero ripetere o saltare delle righe.
 *
 * Se il server restituisce meno di mille righe per pagina (tetto più basso del solito) si usa la misura che ha
 * dimostrato di avere; se il totale non arriva, si va avanti finché una pagina non è incompleta.
 */
export async function leggiTutteLeRighe<T>(leggi: (da: number, a: number) => PromiseLike<RispostaPagina<T>>): Promise<T[]> {
  const prima = await leggi(0, RIGHE_PER_PAGINA - 1);
  if (prima.error) throw prima.error;
  const righe: T[] = [...(prima.data ?? [])];
  const pagina = (n: number, misura: number) => leggi(n * misura, (n + 1) * misura - 1);

  if (prima.count == null) {
    let ultima = righe.length;
    for (let n = 1; ultima === RIGHE_PER_PAGINA; n++) {
      const risposta = await pagina(n, RIGHE_PER_PAGINA);
      if (risposta.error) throw risposta.error;
      const dati = risposta.data ?? [];
      righe.push(...dati);
      ultima = dati.length;
    }
    return righe;
  }

  const totale = prima.count;
  // Una prima pagina più corta del dovuto (con altre righe da leggere) dice qual è il tetto vero del server.
  const misura = righe.length > 0 && righe.length < Math.min(totale, RIGHE_PER_PAGINA) ? righe.length : RIGHE_PER_PAGINA;
  const pagine = Math.ceil(totale / misura);
  for (let inizio = 1; inizio < pagine; inizio += PAGINE_IN_PARALLELO) {
    const gruppo = Array.from({ length: Math.min(PAGINE_IN_PARALLELO, pagine - inizio) }, (_, i) => inizio + i);
    const risposte = await Promise.all(gruppo.map((n) => pagina(n, misura)));
    for (const risposta of risposte) {
      if (risposta.error) throw risposta.error;
      righe.push(...(risposta.data ?? []));
    }
  }
  return righe;
}

/** Contatti e opportunità che usano ogni tag, per tutta l'azienda. */
export async function leggiUsoTag(companyId: string): Promise<LetturaUsoTag> {
  const [contattiRes, opportunita] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).rpc("marketing_valori_filtro_contatti", { p_company: companyId, p_campo: "tags" }) as PromiseLike<
      RispostaPagina<RigaValoreContatti>
    >,
    leggiTutteLeRighe<{ id: string; tags: string[] | null }>(
      (da, a) =>
        supabase
          .from("marketing_opportunities")
          .select("id, tags", { count: "exact" })
          .eq("company_id", companyId)
          .not("tags", "is", null)
          .order("id")
          .range(da, a) as unknown as PromiseLike<RispostaPagina<{ id: string; tags: string[] | null }>>,
    ),
  ]);
  if (contattiRes.error) throw contattiRes.error;

  const righeContatti = contattiRes.data ?? [];
  const contatti = sommaGrafieContatti(righeContatti);
  const opp = contaOpportunitaPerTag(opportunita);

  const uso: UsoTagPerNome = {};
  for (const [nome, n] of Object.entries(contatti)) uso[nome] = { contatti: n, opportunita: 0 };
  for (const [nome, n] of Object.entries(opp)) uso[nome] = { contatti: uso[nome]?.contatti ?? 0, opportunita: n };

  return { uso, elencoContattiIncompleto: righeContatti.length >= TAG_MASSIMI_DALLA_FUNZIONE };
}

/** I tag usati da contatti o opportunità che non sono nell'elenco, dal più usato al meno usato. */
export function tagFuoriElenco(
  uso: UsoTagPerNome,
  elenco: readonly { name: string }[],
): { nome: string; contatti: number; opportunita: number }[] {
  const inElenco = new Set(elenco.map((tag) => normalizeTagName(tag.name)));
  return Object.entries(uso)
    .filter(([nome]) => !inElenco.has(nome))
    .map(([nome, u]) => ({ nome, contatti: u.contatti, opportunita: u.opportunita }))
    .sort((a, b) => b.contatti + b.opportunita - (a.contatti + a.opportunita) || a.nome.localeCompare(b.nome, "it"));
}
