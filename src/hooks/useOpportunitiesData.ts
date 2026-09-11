import { useQuery, useInfiniteQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { userErrorMessage } from "@/lib/userErrorMessage";
import { queryKeys } from "@/lib/queryKeys";
import { useEffect, useMemo } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
import { withClientTimeout, retryListQuery } from "@/lib/query-timeout";
import { subscribeChannel } from "@/lib/realtime/subscribeChannel";
import type { FiltriServerOpportunita } from "@/lib/marketingOpportunities";

export function usePipelines() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  return useQuery({
    queryKey: queryKeys.pipelines.list(companyId),
    queryFn: async () => {
      const { data, error } = await withClientTimeout(
        supabase
          .from("marketing_pipelines")
          .select("*, marketing_pipeline_stages(id, name, position, auto_status, stalled_threshold_days)")
          .eq("company_id", companyId!)
          .order("position"),
        "Caricamento pipeline opportunità",
      );
      if (error) throw error;
      return data.map((p: any) => ({
        ...p,
        marketing_pipeline_stages: (p.marketing_pipeline_stages || []).sort((a: any, b: any) => a.position - b.position),
      }));
    },
    enabled: !!companyId,
    // Timeout transitorio al primo load → 1 retry (era retry:false: il
    // kanban restava in errore al primo colpo freddo).
    retry: retryListQuery,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

function canEditOpportunities(permissions: ReturnType<typeof usePermissions>) {
  return permissions.canEditMarketingOpportunities || permissions.canEditMarketing;
}

function validateOpportunityPayload(data: Record<string, any>) {
  if ("contact_id" in data && !data.contact_id) throw new Error("Seleziona un contatto");
  if ("pipeline_id" in data && !data.pipeline_id) throw new Error("Seleziona una pipeline");
  if ("stage_id" in data && !data.stage_id) throw new Error("Seleziona una fase");
  if ("name" in data && !String(data.name || "").trim()) throw new Error("Inserisci il nome dell'opportunità");
  if ("value" in data && data.value !== null && data.value !== undefined && data.value !== "") {
    const numericValue = Number(data.value);
    if (!Number.isFinite(numericValue) || numericValue < 0) throw new Error("Il valore economico deve essere un numero positivo");
  }
  if ("status" in data && data.status === "lost" && !data.lost_reason_category && !data.lost_reason && !data.loss_reason) {
    throw new Error("Indica il motivo prima di segnare l'opportunità come persa");
  }
}

/**
 * Tabelle che rendono un'opportunita' da ARCHIVIARE invece che da eliminare:
 * contengono lavoro che vive dentro il filo dell'opportunita' e che una
 * cancellazione scollegherebbe in silenzio (il vincolo e' ON DELETE SET NULL,
 * quindi la delete riesce e il collegamento sparisce senza dare errore).
 *
 * L'elenco era scritto a mano e ne aveva perse cinque - commesse,
 * appuntamenti, passaggi di chiamata, simulazioni ROI, clienti servizi: una
 * commessa nata da un'opportunita' restava orfana senza che nessuno lo sapesse.
 */
const OPPORTUNITY_LINK_TABLES = [
  "aedix_service_clients",
  "appointments",
  "crm_roi_simulations",
  "marketing_contact_notes",
  "marketing_documents",
  "marketing_opportunity_notes",
  "orders",
  "passaggi_chiamata",
  "quotes",
  "render_bagno_sessions",
  "render_facciata_sessions",
  "render_pavimento_sessions",
  "render_pergole_sessions",
  "render_persiane_sessions",
  "render_piscine_sessions",
  "render_sessions",
  "render_stanza_sessions",
  "render_technical_sessions",
  "render_tetto_sessions",
  "tasks",
] as const;

interface OpportunityLinks {
  /** Opportunita' con lavoro collegato: si archiviano, non si eliminano. */
  daArchiviare: Set<string>;
  /** Preventivi fotovoltaici collegati: si eliminano lo stesso, ma va detto. */
  progettiFv: number;
}

/**
 * Conta i collegamenti di PIU' opportunita' in una volta sola.
 *
 * Prima si contava un'opportunita' alla volta, quindici richieste ciascuna:
 * su una selezione da cento partivano millecinquecento chiamate insieme. Ora
 * e' una query per tabella, qualunque sia il numero di opportunita'.
 */
/**
 * Quanti id per richiesta. Il filtro `in` finisce nell'URL: con cinquecento
 * uuid in una volta sola l'indirizzo supera i limiti del server e la richiesta
 * torna 414. A cento la lunghezza resta ampiamente sotto.
 */
const LINK_CHUNK = 100;

function aBlocchi<T>(elementi: readonly T[], dimensione: number): T[][] {
  const blocchi: T[][] = [];
  for (let i = 0; i < elementi.length; i += dimensione) blocchi.push(elementi.slice(i, i + dimensione));
  return blocchi;
}

async function countOpportunityLinks(ids: string[], companyId: string): Promise<OpportunityLinks> {
  const daArchiviare = new Set<string>();
  if (ids.length === 0) return { daArchiviare, progettiFv: 0 };

  const blocchi = aBlocchi(ids, LINK_CHUNK);

  await Promise.all(
    OPPORTUNITY_LINK_TABLES.flatMap((table) =>
      blocchi.map(async (blocco) => {
        const { data, error, count } = await supabase
          .from(table as any)
          .select("opportunity_id", { count: "exact" })
          .eq("company_id", companyId)
          .in("opportunity_id", blocco);
        if (error) throw error;
        // Risposta troncata: non so QUALI id siano collegati, quindi archivio
        // tutto il blocco. In dubbio si sceglie l'opzione che non perde dati.
        if (count !== null && (data?.length ?? 0) < count) {
          blocco.forEach((id) => daArchiviare.add(id));
          return;
        }
        (data || []).forEach((row: any) => {
          if (row?.opportunity_id) daArchiviare.add(row.opportunity_id);
        });
      })
    )
  );

  // Il preventivo fotovoltaico NON impedisce di eliminare: vive nella sua area
  // e sta in piedi da solo (il vincolo e' ON DELETE SET NULL, migrazione
  // 20280911100007). Lo conto solo per dirlo, invece di scollegarlo di nascosto.
  const conteggiFv = await Promise.all(
    blocchi.map(async (blocco) => {
      const { count, error } = await supabase
        .from("fv_progetti")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .in("opportunita_crm_id", blocco);
      if (error) throw error;
      return count || 0;
    })
  );

  return { daArchiviare, progettiFv: conteggiFv.reduce((a, b) => a + b, 0) };
}

/** "1 preventivo fotovoltaico resta..." / "3 preventivi fotovoltaici restano..." */
function notaProgettiFv(quanti: number): string | undefined {
  if (quanti < 1) return undefined;
  return quanti === 1
    ? "1 preventivo fotovoltaico resta nell'area Fotovoltaico, senza piu' il collegamento all'opportunita'."
    : `${quanti} preventivi fotovoltaici restano nell'area Fotovoltaico, senza piu' il collegamento all'opportunita'.`;
}

/**
 * Filtro «vede solo i propri» per le opportunità: un'opportunità è mia se ne
 * sono venditore, call center o follower — lo stesso criterio delle regole del
 * database (migrazione 20280914000010).
 *
 * Prima si guardava solo `assigned_to`: un operatore di call center assegnato
 * come call center non vedeva nulla (Venusia, BeMade, 11/09/2026).
 */
export function filtroSoloMiei(userId: string): string {
  return `assigned_to.eq.${userId},call_center_id.eq.${userId},follower_id.eq.${userId}`;
}

export async function enrichPage(data: any[], companyId: string) {
  // Profili di venditore e call center (nome, iniziali, foto per l'avatar).
  const assignedIds = [...new Set(
    data.flatMap((o) => [o.assigned_to, o.call_center_id]).filter(Boolean),
  )];
  const profilesMap: Record<string, { first_name: string; last_name: string; avatar_url?: string | null }> = {};
  if (assignedIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, avatar_url")
      .in("id", assignedIds);
    if (profiles) {
      profiles.forEach((p: any) => { profilesMap[p.id] = p; });
    }
  }

  const oppIds = data.map((o) => o.id);
  const contactIds = [...new Set(data.filter((o) => o.contact_id).map((o) => o.contact_id))];
  const notesCountMap: Record<string, number> = {};
  const docsCountMap: Record<string, number> = {};
  const appointmentMap: Record<string, { date: string; time: string | null }> = {};
  // Giorno ITALIANO, non UTC (convenzione anti UTC-drift del progetto).
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });

  if (oppIds.length > 0) {
    // Chunk da 100 id: PostgREST tronca comunque a max_rows (1000) per
    // chiamata — con 500 opportunità in un colpo solo i badge note/documenti
    // si azzeravano in silenzio oltre le 1000 righe totali.
    const chunk = <T,>(arr: T[], size: number): T[][] => {
      const out: T[][] = [];
      for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
      return out;
    };
    const oppChunks = chunk(oppIds, 100);
    const contactChunks = chunk(contactIds, 100);

    const [notesResults, docsResults, apptResults] = await Promise.all([
      Promise.all(oppChunks.map((ids) =>
        supabase.from("marketing_contact_notes").select("opportunity_id").eq("company_id", companyId).in("opportunity_id", ids).limit(1000),
      )),
      Promise.all(oppChunks.map((ids) =>
        supabase.from("marketing_documents").select("opportunity_id").eq("company_id", companyId).in("opportunity_id", ids).limit(1000),
      )),
      Promise.all(contactChunks.map((ids) =>
        supabase
          .from("appointments")
          .select("contact_id, appointment_date, appointment_time")
          .eq("company_id", companyId)
          .in("contact_id", ids)
          .gte("appointment_date", today)
          .neq("status", "annullato")
          .order("appointment_date", { ascending: true })
          .order("appointment_time", { ascending: true, nullsFirst: false })
          .limit(1000),
      )),
    ]);

    for (const res of notesResults) {
      res?.data?.forEach((n: any) => {
        if (n.opportunity_id) notesCountMap[n.opportunity_id] = (notesCountMap[n.opportunity_id] || 0) + 1;
      });
    }
    for (const res of docsResults) {
      res?.data?.forEach((d: any) => {
        if (d.opportunity_id) docsCountMap[d.opportunity_id] = (docsCountMap[d.opportunity_id] || 0) + 1;
      });
    }
    for (const res of apptResults) {
      res?.data?.forEach((a: any) => {
        if (a.contact_id && !appointmentMap[a.contact_id]) {
          appointmentMap[a.contact_id] = { date: a.appointment_date, time: a.appointment_time };
        }
      });
    }
  }

  return data.map((o) => ({
    ...o,
    assigned_profile: o.assigned_to ? profilesMap[o.assigned_to] || null : null,
    call_center_profile: o.call_center_id ? profilesMap[o.call_center_id] || null : null,
    notes_count: notesCountMap[o.id] || 0,
    documents_count: docsCountMap[o.id] || 0,
    next_appointment: o.contact_id ? appointmentMap[o.contact_id] || null : null,
  }));
}

/*
 * Opportunità contate e caricate dal database (migrazione 20280914000013).
 *
 * Prima la pagina scaricava le opportunità 500 alla volta e si fermava a
 * 1.500: con le 17.879 del «Nuovo» di BeMade le colonne ne mostravano una
 * piccola parte e i numeri in alto erano calcolati solo su quelle. Ora:
 *   · il riepilogo (striscia + conteggio di ogni colonna) viene dal database,
 *     esatto su tutte;
 *   · ogni colonna carica le sue schede a pagine, mentre la si scorre;
 *   · filtri, ricerca e ordinamento li applica il database, sulle 17.879.
 */

/** Schede per pagina in una colonna: se ne vedono quattro o cinque alla volta. */
export const SCHEDE_PER_PAGINA_FASE = 30;
/** Righe per pagina nella vista lista. */
export const RIGHE_PER_PAGINA_LISTA = 100;

export interface RiepilogoOpportunita {
  totale: number;
  per_fase: Record<string, { n: number; valore: number }>;
  aperte: number;
  vinte: number;
  perse: number;
  abbandonate: number;
  valore_pipeline: number;
  valore_ponderato: number;
  senza_stima: number;
  valore_vinto: number;
  in_stallo: number;
  azioni_scadute: number;
}

function numero(valore: unknown): number {
  const n = Number(valore);
  return Number.isFinite(n) ? n : 0;
}

export function normalizzaRiepilogo(grezzo: any): RiepilogoOpportunita {
  const perFase: RiepilogoOpportunita["per_fase"] = {};
  for (const [faseId, v] of Object.entries(grezzo?.per_fase ?? {})) {
    perFase[faseId] = { n: numero((v as any)?.n), valore: numero((v as any)?.valore) };
  }
  return {
    totale: numero(grezzo?.totale),
    per_fase: perFase,
    aperte: numero(grezzo?.aperte),
    vinte: numero(grezzo?.vinte),
    perse: numero(grezzo?.perse),
    abbandonate: numero(grezzo?.abbandonate),
    valore_pipeline: numero(grezzo?.valore_pipeline),
    valore_ponderato: numero(grezzo?.valore_ponderato),
    senza_stima: numero(grezzo?.senza_stima),
    valore_vinto: numero(grezzo?.valore_vinto),
    in_stallo: numero(grezzo?.in_stallo),
    azioni_scadute: numero(grezzo?.azioni_scadute),
  };
}

/** Numeri della striscia e conteggio di ogni colonna, esatti su tutte le opportunità. */
export function useOpportunitySummary(pipelineId: string | null, filtri: FiltriServerOpportunita) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  return useQuery({
    queryKey: queryKeys.opportunities.riepilogo(companyId, pipelineId, filtri),
    queryFn: async () => {
      const { data, error } = await withClientTimeout(
        (supabase as any).rpc("opportunita_riepilogo", { p_pipeline: pipelineId, p_filtri: filtri }),
        "Conteggio opportunità",
        20_000,
      ) as { data: unknown; error: unknown };
      if (error) throw error;
      return normalizzaRiepilogo(data);
    },
    enabled: !!companyId && !!pipelineId,
    // Mentre si scrive nella ricerca i numeri restano quelli di prima invece
    // di tornare a zero; cambiando pipeline no, sarebbero di un'altra.
    placeholderData: (precedente, queryPrecedente) =>
      queryPrecedente?.queryKey[3] === pipelineId ? precedente : undefined,
    retry: retryListQuery,
    staleTime: 30_000,
    gcTime: 10 * 60 * 1000,
  });
}

async function paginaOpportunita(args: {
  pipelineId: string;
  filtri: FiltriServerOpportunita;
  stageId: string | null;
  sortField: string;
  sortDir: string;
  da: number;
  quante: number;
}): Promise<any[]> {
  const { data, error } = await withClientTimeout(
    (supabase as any).rpc("opportunita_pagina", {
      p_pipeline: args.pipelineId,
      p_filtri: args.filtri,
      p_fase: args.stageId,
      p_ordine: args.sortField,
      p_direzione: args.sortDir,
      p_da: args.da,
      p_quante: args.quante,
    }),
    "Caricamento opportunità",
    20_000,
  ) as { data: unknown; error: unknown };
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

/*
 * Prima pagina delle colonne in UNA chiamata (opportunita_kanban, migrazione
 * 20280914000014). All'apertura, e dopo ogni spostamento, le colonne visibili
 * chiedono la prima pagina nello stesso istante: sei o sette chiamate insieme
 * che sul database si mettevano in fila. Qui le richieste arrivate entro pochi
 * millisecondi, con gli stessi filtri e lo stesso ordinamento, partono insieme
 * e ognuna riceve la sua colonna.
 */
type AttesaColonna = { resolve: (righe: any[]) => void; reject: (errore: unknown) => void };
const primePagineInAttesa = new Map<string, {
  args: { pipelineId: string; filtri: FiltriServerOpportunita; sortField: string; sortDir: string };
  colonne: Map<string, AttesaColonna[]>;
}>();

async function inviaPrimePagine(chiave: string) {
  const gruppo = primePagineInAttesa.get(chiave);
  primePagineInAttesa.delete(chiave);
  if (!gruppo) return;
  const fasi = [...gruppo.colonne.keys()];
  try {
    const { data, error } = await withClientTimeout(
      (supabase as any).rpc("opportunita_kanban", {
        p_pipeline: gruppo.args.pipelineId,
        p_filtri: gruppo.args.filtri,
        p_fasi: fasi,
        p_ordine: gruppo.args.sortField,
        p_direzione: gruppo.args.sortDir,
        p_quante: SCHEDE_PER_PAGINA_FASE,
      }),
      "Caricamento opportunità",
      20_000,
    ) as { data: unknown; error: unknown };
    if (error) throw error;
    const perFase = (data && typeof data === "object" ? data : {}) as Record<string, any[]>;
    for (const [fase, attese] of gruppo.colonne) {
      const righe = Array.isArray(perFase[fase]) ? perFase[fase] : [];
      attese.forEach((a) => a.resolve(righe));
    }
  } catch (errore) {
    for (const attese of gruppo.colonne.values()) attese.forEach((a) => a.reject(errore));
  }
}

function primaPaginaColonna(args: {
  pipelineId: string;
  filtri: FiltriServerOpportunita;
  sortField: string;
  sortDir: string;
  stageId: string;
}): Promise<any[]> {
  const chiave = JSON.stringify([args.pipelineId, args.filtri, args.sortField, args.sortDir]);
  let gruppo = primePagineInAttesa.get(chiave);
  if (!gruppo) {
    gruppo = { args, colonne: new Map() };
    primePagineInAttesa.set(chiave, gruppo);
    // 15 ms: abbastanza per raccogliere le colonne che si accendono insieme,
    // troppo poco per accorgersene.
    setTimeout(() => { void inviaPrimePagine(chiave); }, 15);
  }
  const attese = gruppo.colonne.get(args.stageId) ?? [];
  gruppo.colonne.set(args.stageId, attese);
  return new Promise((resolve, reject) => attese.push({ resolve, reject }));
}

/** Le pagine si caricano con un «salta N»: se nel frattempo una scheda cambia
 *  colonna, la stessa può ricomparire nella pagina dopo. Si tiene la prima. */
function senzaDoppioni(righe: any[]): any[] {
  const viste = new Set<string>();
  return righe.filter((r) => {
    if (!r?.id || viste.has(r.id)) return false;
    viste.add(r.id);
    return true;
  });
}

interface PagineOpportunitaArgs {
  pipelineId: string | null;
  stageId: string | null;
  filtri: FiltriServerOpportunita;
  sortField: string;
  sortDir: string;
  enabled?: boolean;
}

/** Le schede di UNA colonna del kanban, a pagine da SCHEDE_PER_PAGINA_FASE. */
export function useStageOpportunities({ pipelineId, stageId, filtri, sortField, sortDir, enabled = true }: PagineOpportunitaArgs & { stageId: string }) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const query = useInfiniteQuery({
    queryKey: queryKeys.opportunities.fase(companyId, pipelineId, stageId, filtri, `${sortField}:${sortDir}`),
    // La prima pagina viaggia insieme a quelle delle altre colonne; le
    // successive (scorrendo) una per volta.
    queryFn: ({ pageParam }) => pageParam === 0
      ? primaPaginaColonna({ pipelineId: pipelineId!, filtri, sortField, sortDir, stageId })
      : paginaOpportunita({
        pipelineId: pipelineId!, filtri, stageId, sortField, sortDir, da: pageParam, quante: SCHEDE_PER_PAGINA_FASE,
      }),
    initialPageParam: 0,
    getNextPageParam: (ultima, _tutte, ultimoDa) =>
      ultima.length === SCHEDE_PER_PAGINA_FASE ? ultimoDa + SCHEDE_PER_PAGINA_FASE : undefined,
    enabled: enabled && !!companyId && !!pipelineId,
    placeholderData: keepPreviousData,
    retry: retryListQuery,
    staleTime: 60_000,
    gcTime: 10 * 60 * 1000,
  });

  const opportunita = useMemo(() => senzaDoppioni(query.data?.pages.flat() ?? []), [query.data?.pages]);
  return { ...query, opportunita };
}

/** Le righe della vista lista (tutte le fasi, o una sola su mobile). */
export function useOpportunityList({ pipelineId, stageId, filtri, sortField, sortDir, enabled = true }: PagineOpportunitaArgs) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const query = useInfiniteQuery({
    queryKey: queryKeys.opportunities.lista(companyId, pipelineId, stageId, filtri, `${sortField}:${sortDir}`),
    queryFn: ({ pageParam }) => paginaOpportunita({
      pipelineId: pipelineId!, filtri, stageId, sortField, sortDir, da: pageParam, quante: RIGHE_PER_PAGINA_LISTA,
    }),
    initialPageParam: 0,
    getNextPageParam: (ultima, _tutte, ultimoDa) =>
      ultima.length === RIGHE_PER_PAGINA_LISTA ? ultimoDa + RIGHE_PER_PAGINA_LISTA : undefined,
    enabled: enabled && !!companyId && !!pipelineId,
    placeholderData: keepPreviousData,
    retry: retryListQuery,
    staleTime: 60_000,
    gcTime: 10 * 60 * 1000,
  });

  const opportunita = useMemo(() => senzaDoppioni(query.data?.pages.flat() ?? []), [query.data?.pages]);
  return { ...query, opportunita };
}

/** Gli id di tutte le opportunità filtrate (o di una colonna): «Seleziona tutti». */
export async function idsOpportunita(pipelineId: string, filtri: FiltriServerOpportunita, stageId: string | null = null): Promise<string[]> {
  const { data, error } = await withClientTimeout(
    (supabase as any).rpc("opportunita_ids", { p_pipeline: pipelineId, p_filtri: filtri, p_fase: stageId }),
    "Selezione opportunità",
    20_000,
  ) as { data: unknown; error: unknown };
  if (error) throw error;
  return Array.isArray(data) ? (data as string[]) : [];
}

/** Le etichette usate nella pipeline, per il pannello Filtri (solo quando serve). */
export function useOpportunityTags(pipelineId: string | null, enabled: boolean) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  return useQuery({
    queryKey: queryKeys.opportunities.etichette(companyId, pipelineId),
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("opportunita_etichette", { p_pipeline: pipelineId });
      if (error) throw error;
      return Array.isArray(data) ? (data as string[]) : [];
    },
    enabled: enabled && !!companyId && !!pipelineId,
    staleTime: 5 * 60 * 1000,
  });
}

/*
 * Tempo reale. Un lead che arriva da Meta o dal modulo, un collega che sposta
 * una scheda o se la assegna: la pipeline aperta si aggiorna da sola in un
 * paio di secondi, senza ricaricare la pagina.
 *
 * La riga arrivata non si incolla nella cache: colonne, ordine e conteggi li
 * decide il database (opportunita_kanban, opportunita_riepilogo) con i filtri
 * della pagina, e l'unico modo di non sbagliarli è richiederli. Costa poco
 * (misurato sul «Nuovo» di BeMade, 17.882 opportunità: circa 0,2 s tra
 * riepilogo e prime pagine), e le modifiche che arrivano insieme — il contatto,
 * l'opportunità e le automazioni di un lead, un'importazione, uno spostamento
 * in blocco — diventano una ricarica sola, mai più di una ogni 3 secondi.
 */
const TEMPO_REALE_ATTESA_MS = 1000;
const TEMPO_REALE_OGNI_MS = 3000;

/** La scheda è tra quelle caricate per questa pipeline (a schermo o in cache)? */
function schedaCaricata(queryClient: ReturnType<typeof useQueryClient>, pipelineId: string, id: unknown): boolean {
  if (typeof id !== "string") return false;
  return queryClient.getQueriesData({ queryKey: queryKeys.opportunities.all }).some(([chiave, dati]) => {
    if (chiave[3] !== pipelineId || !dati) return false;
    const righe: any[] = (dati as any).pages ? (dati as any).pages.flat() : Array.isArray(dati) ? dati : [];
    return righe.some((r) => r?.id === id);
  });
}

export function useOpportunitiesLive(pipelineId: string | null) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!companyId || !pipelineId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ultimaRicarica = 0;
    let arretrata = false;
    let giaAgganciato = false;

    const ricarica = () => {
      timer = undefined;
      // Scheda del browser nascosta: nessuna richiesta, si ricarica al ritorno.
      if (document.hidden) { arretrata = true; return; }
      // Uno spostamento sta ancora salvando: ricaricare adesso riporterebbe la
      // scheda indietro per un attimo. Si riprova tra poco.
      if (queryClient.isMutating() > 0) { programma(); return; }
      ultimaRicarica = Date.now();
      void queryClient.invalidateQueries({
        queryKey: queryKeys.opportunities.all,
        predicate: (q) => q.queryKey[3] === pipelineId
          && ["riepilogo", "fase", "lista", "list"].includes(q.queryKey[1] as string),
      });
    };
    const programma = () => {
      if (timer) return; // la ricarica già in coda vedrà anche questa modifica
      timer = setTimeout(ricarica, Math.max(TEMPO_REALE_ATTESA_MS, TEMPO_REALE_OGNI_MS - (Date.now() - ultimaRicarica)));
    };
    // Arriva tutta l'azienda (il tempo reale accetta un solo filtro): conta la
    // pipeline aperta, o una scheda a schermo che se ne va in un'altra pipeline.
    const rigaNuovaOCambiata = (riga: { id?: string; pipeline_id?: string } | undefined) => {
      if (riga?.pipeline_id === pipelineId || schedaCaricata(queryClient, pipelineId, riga?.id)) programma();
    };
    // Di una riga cancellata arriva solo l'id, e le cancellazioni non si possono
    // filtrare: conta solo se la scheda è tra quelle caricate.
    const rigaCancellata = (id: unknown) => {
      if (schedaCaricata(queryClient, pipelineId, id)) programma();
    };
    const alRitorno = () => {
      if (!document.hidden && arretrata) { arretrata = false; programma(); }
    };

    const tabella = { schema: "public", table: "marketing_opportunities" } as const;
    const canale = supabase
      .channel(`opportunita-live:${pipelineId}:${Math.random().toString(36).slice(2, 9)}`)
      .on("postgres_changes", { event: "INSERT", ...tabella, filter: `company_id=eq.${companyId}` },
        (p) => rigaNuovaOCambiata(p.new as { id?: string; pipeline_id?: string }))
      .on("postgres_changes", { event: "UPDATE", ...tabella, filter: `company_id=eq.${companyId}` },
        (p) => rigaNuovaOCambiata(p.new as { id?: string; pipeline_id?: string }))
      .on("postgres_changes", { event: "DELETE", ...tabella },
        (p) => rigaCancellata((p.old as { id?: string } | undefined)?.id));
    subscribeChannel(canale, "opportunita-live", {
      // Al primo aggancio i dati sono freschi; dopo una riconnessione no: quello
      // che è cambiato mentre la connessione era giù non ce l'ha mandato nessuno.
      onSubscribed: () => {
        if (giaAgganciato) programma();
        giaAgganciato = true;
      },
    });
    document.addEventListener("visibilitychange", alRitorno);

    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", alRitorno);
      void supabase.removeChannel(canale);
    };
  }, [companyId, pipelineId, queryClient]);
}

/**
 * Sposta una scheda tra le colonne nella cache, prima che il database
 * risponda: esce dalla pagina della colonna vecchia, entra in cima alla nuova,
 * e i due conteggi del riepilogo si aggiornano. Le altre cache (lista,
 * dettaglio, scheda contatto) cambiano solo la fase.
 */
function spostaSchedaNeiCache(
  queryClient: ReturnType<typeof useQueryClient>,
  id: string,
  aggiornamento: Record<string, unknown>,
) {
  const tutte = queryClient.getQueriesData({ queryKey: queryKeys.opportunities.all });
  let scheda: any = null;
  for (const [, dati] of tutte) {
    const righe: any[] = (dati as any)?.pages ? (dati as any).pages.flat() : Array.isArray(dati) ? dati : [];
    scheda = righe.find((r) => r?.id === id) ?? null;
    if (scheda) break;
  }
  const faseVecchia: string | undefined = scheda?.stage_id;
  const faseNuova = aggiornamento.stage_id as string | undefined;
  const aggiornata = scheda ? { ...scheda, ...aggiornamento } : null;
  const valore = Number(scheda?.value || 0);

  for (const [chiave, dati] of tutte) {
    if (!dati) continue;
    const tipo = chiave[1];

    if (tipo === "fase" && (dati as any).pages) {
      const faseDellaColonna = chiave[4];
      const pagine: any[][] = (dati as any).pages.map((p: any[]) => p.filter((r) => r?.id !== id));
      if (aggiornata && faseDellaColonna === faseNuova) {
        pagine[0] = [aggiornata, ...(pagine[0] ?? [])];
      }
      queryClient.setQueryData(chiave, { ...(dati as any), pages: pagine });
      continue;
    }

    if (tipo === "riepilogo") {
      if (!scheda || !faseVecchia || !faseNuova || faseVecchia === faseNuova) continue;
      const r = dati as RiepilogoOpportunita;
      const perFase = { ...r.per_fase };
      const da = perFase[faseVecchia] ?? { n: 0, valore: 0 };
      const a = perFase[faseNuova] ?? { n: 0, valore: 0 };
      perFase[faseVecchia] = { n: Math.max(0, da.n - 1), valore: da.valore - valore };
      perFase[faseNuova] = { n: a.n + 1, valore: a.valore + valore };
      queryClient.setQueryData(chiave, { ...r, per_fase: perFase });
      continue;
    }

    if ((dati as any).pages && Array.isArray((dati as any).pages)) {
      queryClient.setQueryData(chiave, {
        ...(dati as any),
        pages: (dati as any).pages.map((p: any[]) => p.map((r) => (r?.id === id ? { ...r, ...aggiornamento } : r))),
      });
    } else if (Array.isArray(dati)) {
      queryClient.setQueryData(chiave, dati.map((r: any) => (r?.id === id ? { ...r, ...aggiornamento } : r)));
    }
  }
}

/** Un filtro `in` finisce nell'URL: oltre qualche centinaio di id la
 *  richiesta viene rifiutata (414). Le modifiche in blocco vanno a blocchi. */
const BLOCCO_MODIFICHE = 200;
export const MASSIMO_ELIMINAZIONE = 1000;

export function useCreateOpportunity() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const permissions = usePermissions();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      contact_id: string;
      pipeline_id: string;
      stage_id: string;
      name: string;
      value?: number;
      status?: string;
      source?: string;
      assigned_to?: string;
      follower_id?: string;
      call_center_id?: string;
      company_name?: string;
      notes?: string;
    }) => {
      if (!companyId) throw new Error("Azienda non selezionata");
      if (!canEditOpportunities(permissions)) throw new Error("Non hai i permessi per creare opportunità");
      validateOpportunityPayload(data);
      const { data: result, error } = await supabase.from("marketing_opportunities").insert({
        ...data,
        name: data.name.trim(),
        company_id: companyId,
        value: Number(data.value || 0),
        status: data.status || "open",
      }).select("id").single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.marketingContacts.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.marketing.all });
      toast.success("Opportunità creata");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateOpportunity() {
  const queryClient = useQueryClient();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const permissions = usePermissions();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; [key: string]: any }) => {
      if (!companyId) throw new Error("Azienda non selezionata");
      if (!canEditOpportunities(permissions)) throw new Error("Non hai i permessi per modificare opportunità");
      validateOpportunityPayload(data);
      const { error } = await supabase
        .from("marketing_opportunities")
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.marketingContacts.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.marketing.all });
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateOpportunityStage() {
  const queryClient = useQueryClient();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const permissions = usePermissions();

  return useMutation({
    mutationFn: async ({ id, stage_id, auto_status, perdita }: {
      id: string; stage_id: string; auto_status?: string;
      /** Compilato quando il drag finisce su una fase persa: il motivo
       *  viaggia nella stessa update dello spostamento. */
      perdita?: { categoria: string; dettaglio: string | null; concorrente: string | null };
    }) => {
      if (!companyId) throw new Error("Azienda non selezionata");
      if (!canEditOpportunities(permissions)) throw new Error("Non hai i permessi per spostare opportunità");
      validateOpportunityPayload({ stage_id });
      const updateData: any = { stage_id };
      if (auto_status) {
        updateData.status = auto_status;
      }
      if (perdita) {
        updateData.lost_reason_category = perdita.categoria;
        updateData.lost_reason = perdita.dettaglio;
        // Colonna legacy: automazioni e report vecchi leggono questa.
        updateData.loss_reason = perdita.dettaglio;
        updateData.competitor_won = perdita.concorrente;
      }

      const { error } = await supabase
        .from("marketing_opportunities")
        .update({ ...updateData, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) throw error;
    },
    onMutate: async ({ id, stage_id, auto_status }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.opportunities.all });

      const previousData = queryClient.getQueriesData({ queryKey: queryKeys.opportunities.all });
      const now = new Date().toISOString();

      // La scheda passa subito nella colonna nuova (e i conteggi con lei):
      // ogni colonna ha la sua cache, cambiare solo stage_id non bastava più.
      spostaSchedaNeiCache(queryClient, id, {
        stage_id,
        stage_changed_at: now,
        updated_at: now,
        ...(auto_status ? { status: auto_status } : {}),
      });

      return { previousData };
    },
    onError: (e: any, _vars, context) => {
      if (context?.previousData) {
        context.previousData.forEach(([queryKey, data]: any) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      toast.error(e.message);
    },
    onSuccess: (_data, vars) => {
      // Il drag verso una fase "persa" imposta lo status senza chiedere il
      // motivo (gli altri percorsi lo esigono): non inventiamo dati, ma
      // ricordiamo all'utente di completarlo — i report motivi-perdita
      // dipendono da lost_reason_category.
      if (vars.auto_status === "lost" && !vars.perdita) {
        toast.info("Opportunità segnata come persa: aggiungi il motivo dal dettaglio", { duration: 6000 });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.marketingContacts.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.marketing.all });
    },
  });
}

export function useDeleteOpportunity() {
  const queryClient = useQueryClient();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const permissions = usePermissions();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("Azienda non selezionata");
      if (!canEditOpportunities(permissions)) throw new Error("Non hai i permessi per eliminare opportunità");
      const { daArchiviare, progettiFv } = await countOpportunityLinks([id], companyId);
      if (daArchiviare.has(id)) {
        const { error } = await supabase
          .from("marketing_opportunities")
          .update({ status: "abandoned", updated_at: new Date().toISOString() })
          .eq("id", id)
          .eq("company_id", companyId);
        if (error) throw error;
        return { archived: true, progettiFv };
      }

      const { error } = await supabase
        .from("marketing_opportunities")
        .delete()
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) throw error;
      return { archived: false, progettiFv };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.marketingContacts.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.marketing.all });
      queryClient.invalidateQueries({ queryKey: ["fv_progetti"] });
      toast.success(result?.archived ? "Opportunità archiviata: aveva dati collegati" : "Opportunità eliminata", {
        description: notaProgettiFv(result?.progettiFv || 0),
      });
    },
    // Un vincolo del database non va mostrato com'e': l'utente si e' visto
    // arrivare a schermo "violates foreign key constraint fv_progetti_...".
    // Il fallback tiene i messaggi scritti qui sopra, gia' in italiano.
    onError: (e: any) => toast.error(userErrorMessage(e, e?.message)),
  });
}

export function useCompanyStaff() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const staffQuery = useCompanyStaffUsers(companyId, "all");

  const data = useMemo(
    () => (staffQuery.data || []).map((p) => ({
      id: p.id,
      name: `${p.first_name || ""} ${p.last_name || ""}`.trim(),
      roles: p.roles || [],
    })),
    [staffQuery.data]
  );

  return { ...staffQuery, data };
}

/**
 * Returns i VENDITORI assegnabili alle opportunità (campo "Venditore").
 * Sono i ruoli commerciali — super_admin / company_admin / salesperson — così
 * che anche un titolare/admin che vende (tipico nelle PMI) sia assegnabile e
 * finisca nelle statistiche venditori (la RPC raggruppa per assigned_to).
 * ESCLUDE chi è SOLO call center: il CC resta selezionabile nel suo campo
 * dedicato (useCompanyCallCenterUsers), ma non è un "venditore che chiude".
 */
export function useCompanySalespeople() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const staffQuery = useCompanyStaffUsers(companyId, "sales");

  const data = useMemo(
    () =>
      (staffQuery.data || [])
        // tieni admin/titolari e venditori; escludi chi ha SOLO il ruolo call_center
        .filter((p) => {
          const roles = p.roles ?? [];
          return roles.length === 0 || roles.some((r) => r !== "call_center");
        })
        .map((p) => ({
          id: p.id,
          name: `${p.first_name || ""} ${p.last_name || ""}`.trim(),
          source: p.roles?.includes("salesperson") ? "role" : "area",
        })),
    [staffQuery.data]
  );

  return { ...staffQuery, data };
}

/**
 * Returns call center users for the company.
 * Same cascade strategy as salespeople but for role='call_center'.
 */
export function useCompanyCallCenterUsers() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const staffQuery = useCompanyStaffUsers(companyId, "sales");

  const data = useMemo(
    () => (staffQuery.data || [])
      .filter((p) => !p.roles?.length || p.roles.includes("call_center") || p.roles.includes("company_admin") || p.roles.includes("super_admin"))
      .map((p) => ({
        id: p.id,
        name: `${p.first_name || ""} ${p.last_name || ""}`.trim(),
        source: p.roles?.includes("call_center") ? "role" : "area",
      })),
    [staffQuery.data]
  );

  return { ...staffQuery, data };
}

/** Returns company staff filtered by area (cantiere, commerciale, amministrazione, tecnico) */
export function useCompanyStaffByArea(area?: string | string[]) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const areas = area ? (Array.isArray(area) ? area : [area]) : null;

  return useQuery({
    queryKey: ["company-staff-by-area", companyId, areas],
    queryFn: async () => {
      if (!companyId) return [];
      let query = supabase
        .from("employees")
        .select("id, first_name, last_name, role_type, area")
        .eq("company_id", companyId)
        .eq("is_active", true);

      if (areas && areas.length > 0) {
        query = query.in("area", areas);
      }

      const { data, error } = await query.order("last_name");
      if (error) {
        // Fallback if area column doesn't exist yet
        const { data: fallback } = await supabase
          .from("employees")
          .select("id, first_name, last_name, role_type")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .order("last_name");
        return (fallback || []).map((e: any) => ({
          id: e.id,
          firstName: e.first_name,
          lastName: e.last_name,
          name: `${e.first_name || ""} ${e.last_name || ""}`.trim(),
          area: e.role_type === "staff_interno" ? "amministrazione" : "cantiere",
          roleType: e.role_type,
        }));
      }

      return (data || []).map((e: any) => ({
        id: e.id,
        firstName: e.first_name,
        lastName: e.last_name,
        name: `${e.first_name || ""} ${e.last_name || ""}`.trim(),
        area: e.area || (e.role_type === "staff_interno" ? "amministrazione" : "cantiere"),
        roleType: e.role_type,
      }));
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}

export function useOpportunityNotes(opportunityId: string | null, contactId?: string | null) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  return useQuery({
    queryKey: queryKeys.marketingContacts.notes(contactId, opportunityId),
    queryFn: async () => {
      if (!contactId) {
        // Fallback: only notes linked to this opportunity
        const { data, error } = await supabase
          .from("marketing_contact_notes")
          .select("*")
          .eq("company_id", companyId!)
          .eq("opportunity_id", opportunityId!)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return data;
      }
      // Get all notes for the contact (both generic and opportunity-specific)
      const { data, error } = await supabase
        .from("marketing_contact_notes")
        .select("*")
        .eq("company_id", companyId!)
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!opportunityId && !!companyId,
  });
}

export function useAddOpportunityNote() {
  const queryClient = useQueryClient();
  const { effectiveCompany, user } = useAuth();

  return useMutation({
    mutationFn: async ({ opportunityId, contactId, content }: { opportunityId: string; contactId: string; content: string }) => {
      const { error } = await supabase.from("marketing_contact_notes").insert({
        contact_id: contactId,
        opportunity_id: opportunityId,
        company_id: effectiveCompany!.id,
        content,
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.marketingContacts.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.all });
      toast.success("Nota aggiunta");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useBulkUpdateOpportunities() {
  const queryClient = useQueryClient();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const permissions = usePermissions();

  return useMutation({
    mutationFn: async ({ ids, data }: { ids: string[]; data: Record<string, any> }) => {
      if (!companyId) throw new Error("Azienda non selezionata");
      if (!canEditOpportunities(permissions)) throw new Error("Non hai i permessi per modificare opportunità");
      if (ids.length === 0) return;
      validateOpportunityPayload(data);
      // A blocchi: con «Seleziona tutti» gli id possono essere migliaia, e in
      // un'unica richiesta l'indirizzo diventava troppo lungo.
      const aggiornamento = { ...data, updated_at: new Date().toISOString() };
      for (const blocco of aBlocchi(ids, BLOCCO_MODIFICHE)) {
        const { error } = await supabase
          .from("marketing_opportunities")
          .update(aggiornamento)
          .eq("company_id", companyId)
          .in("id", blocco);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.marketingContacts.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.marketing.all });
      toast.success("Opportunità aggiornate");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

/** Aggiunge o rimuove etichette in blocco senza sovrascrivere quelle esistenti
 *  (append/remove atomico lato DB via RPC company-scoped). */
export function useBulkTagOpportunities() {
  const queryClient = useQueryClient();
  const permissions = usePermissions();

  return useMutation({
    mutationFn: async ({ ids, tags, mode }: { ids: string[]; tags: string[]; mode: "add" | "remove" }) => {
      if (!canEditOpportunities(permissions)) throw new Error("Non hai i permessi per modificare opportunità");
      if (ids.length === 0 || tags.length === 0) return;
      const { error } = await (supabase as any).rpc("bulk_tag_opportunities", {
        p_ids: ids,
        p_tags: tags,
        p_mode: mode,
      });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.marketingContacts.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.marketing.all });
      toast.success(vars.mode === "add" ? "Etichette aggiunte" : "Etichette rimosse");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useBulkDeleteOpportunities() {
  const queryClient = useQueryClient();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const permissions = usePermissions();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (!companyId) throw new Error("Azienda non selezionata");
      if (!canEditOpportunities(permissions)) throw new Error("Non hai i permessi per eliminare opportunità");
      if (ids.length === 0) return;
      // Prima di eliminare si controllano i collegamenti di ogni opportunità,
      // una richiesta per tabella ogni cento id: con «Seleziona tutti» su una
      // pipeline da diciottomila sarebbero migliaia di richieste insieme.
      if (ids.length > MASSIMO_ELIMINAZIONE) {
        throw new Error(`Si possono eliminare al massimo ${MASSIMO_ELIMINAZIONE.toLocaleString("it-IT")} opportunità alla volta: restringi la selezione con i filtri.`);
      }
      const { daArchiviare, progettiFv } = await countOpportunityLinks(ids, companyId);
      const archiveIds = ids.filter((id) => daArchiviare.has(id));
      const deleteIds = ids.filter((id) => !daArchiviare.has(id));

      for (const blocco of aBlocchi(archiveIds, BLOCCO_MODIFICHE)) {
        const { error } = await supabase
          .from("marketing_opportunities")
          .update({ status: "abandoned", updated_at: new Date().toISOString() })
          .eq("company_id", companyId)
          .in("id", blocco);
        if (error) throw error;
      }

      for (const blocco of aBlocchi(deleteIds, BLOCCO_MODIFICHE)) {
        const { error } = await supabase
          .from("marketing_opportunities")
          .delete()
          .eq("company_id", companyId)
          .in("id", blocco);
        if (error) throw error;
      }

      return { archived: archiveIds.length, deleted: deleteIds.length, progettiFv };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.marketingContacts.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.marketing.all });
      queryClient.invalidateQueries({ queryKey: ["fv_progetti"] });
      const archived = result?.archived || 0;
      const deleted = result?.deleted || 0;
      const nota = notaProgettiFv(result?.progettiFv || 0);
      if (archived && deleted) toast.success(`${deleted} eliminate, ${archived} archiviate perché avevano dati collegati`, { description: nota });
      else if (archived) toast.success(`${archived} opportunità archiviate perché avevano dati collegati`, { description: nota });
      else toast.success("Opportunità eliminate", { description: nota });
    },
    onError: (e: any) => toast.error(userErrorMessage(e, e?.message)),
  });
}
