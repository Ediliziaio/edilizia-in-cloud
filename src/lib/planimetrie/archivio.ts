/**
 * Planimetrie — archivio: crea, leggi, salva una nuova versione, elenca.
 *
 * Tabelle e funzioni in supabase/migrations/20281030260000_planimetrie_base.sql.
 * Ogni salvataggio è una versione nuova (mai una modifica): il computo ricorda la
 * versione da cui ha preso le misure. Prima di scrivere il documento si valida e si
 * calcolano le quantità, che restano salvate accanto (cache).
 *
 * React Query: una chiave per forma di dato (vedi `chiaviPlanimetrie`).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { nuovaPlanimetria, validaPlanimetria, type Planimetria } from "../../../shared/planimetrie/modello.ts";
import { calcolaQuantita, type MappaQuantita } from "../../../shared/planimetrie/quantita.ts";

export type StatoPlanimetria = "bozza" | "in_uso" | "archiviata";
export type OrigineVersione = "manuale" | "ai_pdf" | "ai_foto" | "ai_schizzo" | "ai_testo" | "sopralluogo" | "importazione";

export interface CollegamentiPlanimetria {
  orderId?: string | null;
  quoteId?: string | null;
  computoUploadId?: string | null;
  surveyId?: string | null;
  contactId?: string | null;
}

/** Riga di `planimetrie`. */
export interface RigaPlanimetria {
  id: string;
  company_id: string;
  titolo: string;
  descrizione: string | null;
  stato: StatoPlanimetria;
  order_id: string | null;
  quote_id: string | null;
  computo_upload_id: string | null;
  survey_id: string | null;
  contact_id: string | null;
  versione_corrente: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Riga di `planimetrie_versioni` senza documento: per l'elenco delle versioni. */
export interface InfoVersione {
  id: string;
  planimetria_id: string;
  numero: number;
  schema_versione: number;
  origine: OrigineVersione;
  nota: string | null;
  created_by: string | null;
  created_at: string;
}

export interface VersionePlanimetria extends InfoVersione {
  documento: Planimetria;
  quantita: MappaQuantita | null;
}

export interface FiltroPlanimetrie extends CollegamentiPlanimetria {
  /** Anche le archiviate (default no). */
  archiviate?: boolean;
}

export const chiaviPlanimetrie = {
  tutte: ["planimetrie"] as const,
  elenco: (companyId: string | null | undefined, filtro: FiltroPlanimetrie = {}) => ["planimetrie", "elenco", companyId, filtro] as const,
  /** Riga + versione corrente. */
  dettaglio: (id: string | null | undefined) => ["planimetrie", "dettaglio", id] as const,
  versioni: (id: string | null | undefined) => ["planimetrie", "versioni", id] as const,
  versione: (id: string | null | undefined, numero: number | null | undefined) => ["planimetrie", "versione", id, numero] as const,
};

const COLONNE_RIGA = "id, company_id, titolo, descrizione, stato, order_id, quote_id, computo_upload_id, survey_id, contact_id, versione_corrente, created_by, created_at, updated_at, deleted_at";
const COLONNE_INFO = "id, planimetria_id, numero, schema_versione, origine, nota, created_by, created_at";

/** Messaggio per il titolare, a partire dall'errore del database. */
export function messaggioErrorePlanimetria(errore: { code?: string; message?: string } | null | undefined): string {
  switch (errore?.code) {
    case "40001": return "Qualcun altro ha salvato la pianta nel frattempo: ricarica per vedere le sue modifiche.";
    case "42501": return "Non hai il permesso di modificare le piante di questa azienda.";
    case "P0002": return "Pianta non trovata: forse è stata cancellata.";
    default: return "Pianta non salvata: riprova tra qualche secondo.";
  }
}

/** Valida il documento e lo restituisce, o lancia un errore leggibile. */
function documentoValido(documento: unknown): Planimetria {
  const esito = validaPlanimetria(documento);
  if (!esito.ok) throw new Error(`La pianta non è valida: ${esito.errori.slice(0, 3).join(" ")}`);
  return esito.planimetria;
}

function versioneLetta(riga: Record<string, unknown>): VersionePlanimetria {
  const esito = validaPlanimetria(riga.documento);
  if (!esito.ok) throw new Error(`La pianta salvata non si legge: ${esito.errori[0]}`);
  return { ...(riga as unknown as InfoVersione), documento: esito.planimetria, quantita: (riga.quantita as MappaQuantita | null) ?? null };
}

// ─── Letture ─────────────────────────────────────────────────────────────────

export async function elencaPlanimetrie(companyId: string, filtro: FiltroPlanimetrie = {}): Promise<RigaPlanimetria[]> {
  let q = supabase.from("planimetrie" as never).select(COLONNE_RIGA).eq("company_id", companyId).is("deleted_at", null);
  if (!filtro.archiviate) q = q.neq("stato", "archiviata");
  if (filtro.orderId) q = q.eq("order_id", filtro.orderId);
  if (filtro.quoteId) q = q.eq("quote_id", filtro.quoteId);
  if (filtro.computoUploadId) q = q.eq("computo_upload_id", filtro.computoUploadId);
  if (filtro.surveyId) q = q.eq("survey_id", filtro.surveyId);
  if (filtro.contactId) q = q.eq("contact_id", filtro.contactId);
  const { data, error } = await q.order("updated_at", { ascending: false });
  if (error) throw new Error("Elenco delle piante non disponibile: riprova tra qualche secondo.");
  return (data ?? []) as unknown as RigaPlanimetria[];
}

export async function caricaVersione(planimetriaId: string, numero: number): Promise<VersionePlanimetria> {
  const { data, error } = await supabase.from("planimetrie_versioni" as never)
    .select(`${COLONNE_INFO}, documento, quantita`).eq("planimetria_id", planimetriaId).eq("numero", numero).maybeSingle();
  if (error) throw new Error("Pianta non disponibile: riprova tra qualche secondo.");
  if (!data) throw new Error("Questa versione della pianta non esiste.");
  return versioneLetta(data as Record<string, unknown>);
}

/** La pianta con la sua versione corrente. */
export async function caricaPlanimetria(id: string): Promise<{ riga: RigaPlanimetria; versione: VersionePlanimetria }> {
  const { data, error } = await supabase.from("planimetrie" as never).select(COLONNE_RIGA).eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) throw new Error("Pianta non disponibile: riprova tra qualche secondo.");
  if (!data) throw new Error("Pianta non trovata: forse è stata cancellata.");
  const riga = data as unknown as RigaPlanimetria;
  return { riga, versione: await caricaVersione(id, riga.versione_corrente) };
}

export async function elencaVersioni(planimetriaId: string): Promise<InfoVersione[]> {
  const { data, error } = await supabase.from("planimetrie_versioni" as never)
    .select(COLONNE_INFO).eq("planimetria_id", planimetriaId).order("numero", { ascending: false });
  if (error) throw new Error("Versioni della pianta non disponibili: riprova tra qualche secondo.");
  return (data ?? []) as unknown as InfoVersione[];
}

// ─── Scritture ───────────────────────────────────────────────────────────────

export interface NuovaPlanimetria {
  companyId: string;
  titolo: string;
  /** Default: una pianta vuota con il piano terra. */
  documento?: Planimetria;
  origine?: OrigineVersione;
  nota?: string | null;
  collegamenti?: CollegamentiPlanimetria;
}

/** Crea la pianta con la versione 1; restituisce l'id. */
export async function creaPlanimetria(input: NuovaPlanimetria): Promise<string> {
  const titolo = input.titolo.trim();
  if (!titolo) throw new Error("Dai un nome alla pianta.");
  const documento = documentoValido(input.documento ?? nuovaPlanimetria(titolo));
  const c = input.collegamenti ?? {};
  const { data, error } = await supabase.rpc("planimetria_crea" as never, {
    p_company_id: input.companyId,
    p_titolo: titolo,
    p_documento: documento,
    p_quantita: calcolaQuantita(documento),
    p_origine: input.origine ?? "manuale",
    p_nota: input.nota ?? null,
    p_order_id: c.orderId ?? null,
    p_quote_id: c.quoteId ?? null,
    p_computo_upload_id: c.computoUploadId ?? null,
    p_survey_id: c.surveyId ?? null,
    p_contact_id: c.contactId ?? null,
  } as never);
  if (error) throw new Error(messaggioErrorePlanimetria(error));
  return data as unknown as string;
}

export interface SalvataggioVersione {
  planimetriaId: string;
  documento: Planimetria;
  /** La versione che l'editor aveva aperto: se nel frattempo ne è stata salvata un'altra, non si sovrascrive. */
  versioneAttesa?: number | null;
  origine?: OrigineVersione;
  nota?: string | null;
}

/** Salva una nuova versione e restituisce il suo numero. */
export async function salvaNuovaVersione(input: SalvataggioVersione): Promise<number> {
  const documento = documentoValido(input.documento);
  const { data, error } = await supabase.rpc("planimetria_salva_versione" as never, {
    p_planimetria_id: input.planimetriaId,
    p_documento: documento,
    p_quantita: calcolaQuantita(documento),
    p_origine: input.origine ?? "manuale",
    p_nota: input.nota ?? null,
    p_versione_attesa: input.versioneAttesa ?? null,
  } as never);
  if (error) throw new Error(messaggioErrorePlanimetria(error));
  return data as unknown as number;
}

/** Titolo, descrizione, stato e collegamenti (non il disegno: quello è una versione). */
export async function aggiornaDatiPlanimetria(
  id: string,
  dati: { titolo?: string; descrizione?: string | null; stato?: StatoPlanimetria } & CollegamentiPlanimetria,
): Promise<void> {
  const riga: Record<string, unknown> = {};
  if (dati.titolo !== undefined) {
    if (!dati.titolo.trim()) throw new Error("Dai un nome alla pianta.");
    riga.titolo = dati.titolo.trim();
  }
  if (dati.descrizione !== undefined) riga.descrizione = dati.descrizione;
  if (dati.stato !== undefined) riga.stato = dati.stato;
  if (dati.orderId !== undefined) riga.order_id = dati.orderId;
  if (dati.quoteId !== undefined) riga.quote_id = dati.quoteId;
  if (dati.computoUploadId !== undefined) riga.computo_upload_id = dati.computoUploadId;
  if (dati.surveyId !== undefined) riga.survey_id = dati.surveyId;
  if (dati.contactId !== undefined) riga.contact_id = dati.contactId;
  const { error } = await supabase.from("planimetrie" as never).update(riga as never).eq("id", id);
  if (error) throw new Error(messaggioErrorePlanimetria(error));
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useElencoPlanimetrie(companyId: string | null | undefined, filtro: FiltroPlanimetrie = {}) {
  return useQuery({
    queryKey: chiaviPlanimetrie.elenco(companyId, filtro),
    enabled: !!companyId,
    queryFn: () => elencaPlanimetrie(companyId!, filtro),
  });
}

export function usePlanimetria(id: string | null | undefined) {
  return useQuery({
    queryKey: chiaviPlanimetrie.dettaglio(id),
    enabled: !!id,
    queryFn: () => caricaPlanimetria(id!),
  });
}

export function useVersioniPlanimetria(id: string | null | undefined) {
  return useQuery({
    queryKey: chiaviPlanimetrie.versioni(id),
    enabled: !!id,
    queryFn: () => elencaVersioni(id!),
  });
}

/** Una versione precisa: non cambia mai, si tiene in memoria a lungo. */
export function useVersionePlanimetria(id: string | null | undefined, numero: number | null | undefined) {
  return useQuery({
    queryKey: chiaviPlanimetrie.versione(id, numero),
    enabled: !!id && !!numero,
    staleTime: Infinity,
    queryFn: () => caricaVersione(id!, numero!),
  });
}

export function useCreaPlanimetria() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: creaPlanimetria,
    onSuccess: (_id, input) => client.invalidateQueries({ queryKey: ["planimetrie", "elenco", input.companyId] }),
  });
}

export function useSalvaVersionePlanimetria() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: salvaNuovaVersione,
    onSuccess: (_numero, input) => Promise.all([
      client.invalidateQueries({ queryKey: chiaviPlanimetrie.dettaglio(input.planimetriaId) }),
      client.invalidateQueries({ queryKey: chiaviPlanimetrie.versioni(input.planimetriaId) }),
      client.invalidateQueries({ queryKey: ["planimetrie", "elenco"] }),
    ]),
  });
}

export function useAggiornaDatiPlanimetria() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dati }: { id: string } & Parameters<typeof aggiornaDatiPlanimetria>[1]) => aggiornaDatiPlanimetria(id, dati),
    onSuccess: (_r, input) => Promise.all([
      client.invalidateQueries({ queryKey: chiaviPlanimetrie.dettaglio(input.id) }),
      client.invalidateQueries({ queryKey: ["planimetrie", "elenco"] }),
    ]),
  });
}
