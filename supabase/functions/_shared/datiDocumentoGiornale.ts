/**
 * Legge col service role tutto quel che finisce nel documento del giornale. Chi
 * chiama ha già controllato l'accesso: qui si filtra solo per azienda.
 */
import { BUCKET_FOTO_GIORNALE, indirizziFotoGiornale } from "./fotoGiornale.ts";
import { STATI_RAPPORTINO_BOZZA } from "./bozzaGiornale.ts";
import { personeDelGiorno, type RapportinoPresenze } from "./presenzeGiornale.ts";
import type { EventoGiornale } from "./eventiGiornale.ts";
import type { AnnotazioneDocumento, GiornataDocumento } from "./documentoGiornale.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

/** Le foto del giornale stanno in un bucket privato: link firmati validi un giorno, per stampare con calma. */
const SCADENZA_FOTO_SECONDI = 24 * 60 * 60;
const COLONNE = "id, order_id, data_lavori, stato, condizioni_meteo, lavorazioni_eseguite, materiali_utilizzati, personale_presente, note, avanzamento_percentuale, temperatura, firmato_da, firmato_il, pm_signed_at, pm_signed_by, pm_signature_hash, giornale_foto(id, url, storage_path)";
/** Oltre questi id in un `in(...)` l'indirizzo della richiesta diventa troppo lungo. */
const LOTTO_ID = 150;
const MAX_RAPPORTINI = 5000;

function aLotti<T>(v: T[]): T[][] {
  const lotti: T[][] = [];
  for (let i = 0; i < v.length; i += LOTTO_ID) lotti.push(v.slice(i, i + LOTTO_ID));
  return lotti;
}

async function perIds<T>(ids: string[], leggi: (lotto: string[]) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (const lotto of aLotti(ids)) {
    const { data, error } = await leggi(lotto);
    if (error) throw new Error("Errore nel caricamento dei dati del giornale");
    out.push(...((data ?? []) as T[]));
  }
  return out;
}

const nomeProfilo = (p: { first_name?: string | null; last_name?: string | null }) => [p.first_name, p.last_name].filter(Boolean).join(" ").trim();

export type RigaGiornata = GiornataDocumento & {
  order_id: string;
  pm_signed_by?: string | null;
  giornale_foto?: { id: string; url: string; storage_path?: string | null }[];
};

export async function leggiGiornateDocumento(
  supabase: Db,
  filtro: { companyId: string; orderId?: string | null; giornaleId?: string | null },
): Promise<RigaGiornata[]> {
  let q = supabase.from("giornale_lavori").select(COLONNE).eq("company_id", filtro.companyId).order("data_lavori", { ascending: false });
  if (filtro.orderId) q = q.eq("order_id", filtro.orderId);
  if (filtro.giornaleId) q = q.eq("id", filtro.giornaleId);
  const { data, error } = await q;
  if (error) throw new Error("Errore nel caricamento dei dati del giornale");
  const giornate = ((data ?? []) as RigaGiornata[]).map((g) => ({ ...g, giornale_foto: Array.isArray(g.giornale_foto) ? g.giornale_foto : [] }));
  if (!giornate.length) return [];

  const ids = giornate.map((g) => g.id);
  const [eventi, annotazioni, rapportini] = await Promise.all([
    perIds<EventoGiornale & { giornale_id: string }>(ids, (lotto) =>
      supabase.from("giornale_eventi").select("id, giornale_id, tipo, testo, ora, stato, chiuso_il, nota_chiusura, created_at").in("giornale_id", lotto)),
    perIds<{ giornale_id: string; testo: string; autore_id: string | null; created_at: string }>(ids, (lotto) =>
      supabase.from("giornale_annotazioni").select("giornale_id, testo, autore_id, created_at").in("giornale_id", lotto).order("created_at", { ascending: true })),
    leggiRapportini(supabase, filtro.companyId, giornate),
  ]);

  const idsNomi = [...new Set([
    ...giornate.map((g) => g.pm_signed_by),
    // La firma automatica scrive in firmato_da l'id dell'utente, non il nome.
    ...giornate.map((g) => (g.firmato_da && UUID.test(g.firmato_da.trim()) ? g.firmato_da.trim() : null)),
    ...annotazioni.map((a) => a.autore_id),
    ...rapportini.map((r) => r.user_id),
  ].filter((x): x is string => !!x))];
  const profili = await perIds<{ id: string; first_name: string | null; last_name: string | null }>(idsNomi, (lotto) =>
    supabase.from("profiles").select("id, first_name, last_name").in("id", lotto));
  const nomi: Record<string, string> = {};
  for (const p of profili) {
    const n = nomeProfilo(p);
    if (n) nomi[p.id] = n;
  }

  const tutteLeFoto = giornate.flatMap((g) => g.giornale_foto ?? []);
  const link = await indirizziFotoGiornale(tutteLeFoto, async (paths) => {
    const { data: firmati, error: errFirma } = await supabase.storage.from(BUCKET_FOTO_GIORNALE).createSignedUrls(paths, SCADENZA_FOTO_SECONDI);
    if (errFirma || !firmati) return paths.map((): null => null);
    return paths.map((_, i) => (firmati[i]?.signedUrl as string | undefined) ?? null);
  });

  const ruoli = await ruoliFirmatari(supabase, filtro.companyId);

  let k = 0;
  return giornate.map((g) => {
    const firmaUtente = g.firmato_da && UUID.test(g.firmato_da.trim()) ? g.firmato_da.trim() : null;
    const firmatoDa = firmaUtente ? nomi[firmaUtente] ?? null : g.firmato_da;
    const delGiorno = rapportini.filter((r) => r.order_id === g.order_id && r.data_lavoro === g.data_lavori);
    const note: AnnotazioneDocumento[] = annotazioni.filter((a) => a.giornale_id === g.id)
      .map((a) => ({ testo: a.testo, created_at: a.created_at, autore: (a.autore_id && nomi[a.autore_id]) || "" }));
    return {
      ...g,
      firmatario: (g.pm_signed_by && nomi[g.pm_signed_by]) || undefined,
      firmato_da: firmatoDa,
      firmato_da_ruolo: ruoloFirmatario(ruoli, { userId: firmaUtente, nome: firmatoDa }),
      foto_link: (g.giornale_foto ?? []).map(() => link[k++] ?? ""),
      eventi: eventi.filter((e) => e.giornale_id === g.id),
      annotazioni: note,
      persone: personeDelGiorno(delGiorno, nomi).map((p) => ({ nome: p.nome, ore: p.ore })),
    };
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RuoloDipendente { user_id: string | null; first_name: string | null; last_name: string | null; qualifica: string | null; role_type: string | null }

/** Le categorie di `role_type` non sono un ruolo da scrivere sotto una firma; i nomi di mestiere sì («Capoposa»). */
const CATEGORIE_GENERICHE = new Set(["operaio", "staff_interno", "impiegato", "subappaltatore", "worker", "staff"]);
const normaNome = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Il ruolo di chi firma la giornata, dalla sua scheda dipendente: per utente, se la firma l'ha messa l'app, o per nome
 * e cognome scritti a mano (in un ordine o nell'altro). La qualifica, o il mestiere di role_type; altrimenti null e il
 * documento scrive «Firma». Mai un ruolo indovinato: due schede con lo stesso nome e ruoli diversi = null.
 */
export function ruoloFirmatario(dipendenti: RuoloDipendente[], chi: { userId?: string | null; nome?: string | null }): string | null {
  const ruoloDi = (d: RuoloDipendente) => {
    const q = d.qualifica?.trim();
    if (q && !/da confermare/i.test(q)) return q;
    const t = d.role_type?.trim();
    return t && !CATEGORIE_GENERICHE.has(t.toLowerCase()) ? t : null;
  };
  const unico = (lista: RuoloDipendente[]) => {
    const r = [...new Set(lista.map(ruoloDi).filter((x): x is string => !!x))];
    return r.length === 1 ? r[0] : null;
  };
  if (chi.userId) {
    const r = unico(dipendenti.filter((d) => d.user_id === chi.userId));
    if (r) return r;
  }
  const nome = normaNome(chi.nome);
  if (!nome) return null;
  return unico(dipendenti.filter((d) => {
    const n = normaNome(d.first_name), c = normaNome(d.last_name);
    return !!(n || c) && (nome === `${n} ${c}`.trim() || nome === `${c} ${n}`.trim());
  }));
}

/** Le schede dipendente dell'azienda, per i ruoli di chi firma. Se non si leggono, il documento scrive «Firma». */
async function ruoliFirmatari(supabase: Db, companyId: string): Promise<RuoloDipendente[]> {
  const { data, error } = await supabase.from("employees")
    .select("user_id, first_name, last_name, qualifica, role_type").eq("company_id", companyId).limit(2000);
  if (error) {
    console.error("[datiDocumentoGiornale] ruoli dei firmatari non letti:", error.message);
    return [];
  }
  return (data ?? []) as RuoloDipendente[];
}

type RapportinoDoc = RapportinoPresenze & { order_id: string; data_lavoro: string };

/** Solo i rapportini arrivati, delle commesse e nel periodo delle giornate. Il tetto vale per le esportazioni di tutta l'azienda. */
async function leggiRapportini(supabase: Db, companyId: string, giornate: RigaGiornata[]): Promise<RapportinoDoc[]> {
  const ordini = [...new Set(giornate.map((g) => g.order_id).filter(Boolean))];
  const date = giornate.map((g) => g.data_lavori).sort();
  const out: RapportinoDoc[] = [];
  for (const lotto of aLotti(ordini)) {
    for (let da = 0; da < MAX_RAPPORTINI; da += 1000) {
      const { data, error } = await supabase.from("campo_rapportini")
        .select("id, order_id, data_lavoro, user_id, stato, ore_lavorate, ore_straordinario, presenze")
        .eq("company_id", companyId).in("order_id", lotto).in("stato", [...STATI_RAPPORTINO_BOZZA])
        .gte("data_lavoro", date[0]).lte("data_lavoro", date[date.length - 1])
        .order("id", { ascending: true }).range(da, da + 999);
      if (error) throw new Error("Errore nel caricamento dei dati del giornale");
      const righe = (data ?? []) as RapportinoDoc[];
      out.push(...righe);
      if (righe.length < 1000) break;
    }
  }
  return out;
}
