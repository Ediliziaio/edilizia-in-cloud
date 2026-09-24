/**
 * POS sul modello ufficiale: lettura e salvataggio dei documenti, figure della
 * sicurezza dell'impresa, allegati, e le azioni che passano dal server
 * (crea, dati dell'app, lavorazioni proposte dall'AI, approvazione).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import type { Json, TablesUpdate } from "@/integrations/supabase/types";
import {
  normalizzaPos, type Lavorazione, type PosContenuto, type VoceMancante,
} from "../../supabase/functions/_shared/posModello";
import type { ContestoPos } from "../../supabase/functions/_shared/posModello";
import type { RevisionePos } from "@/lib/sicurezza/posHtml";

const BUCKET = "sicurezza-documenti";

export interface IterPos {
  firma_datore_il?: string | null;
  consultazione_rls_il?: string | null;
  affidataria_inviato_il?: string | null;
  affidataria_esito?: "positivo" | "negativo" | null;
  affidataria_esito_il?: string | null;
  cse_inviato_il?: string | null;
  cse_esito?: "positivo" | "negativo" | null;
  cse_esito_il?: string | null;
  note?: string | null;
}

export interface PosRiga {
  id: string;
  company_id: string;
  order_id: string;
  status: string;
  revisione: number;
  revisioni: RevisionePos[];
  contenuto: PosContenuto;
  /** Il documento non ha ancora il POS sul modello (vecchio generatore o bozza vuota). */
  daCompilare: boolean;
  iter: IterPos;
  approvato_da_nome: string | null;
  approvato_il: string | null;
  created_at: string;
  updated_at: string | null;
  commessa: { order_code: string | null; description: string | null } | null;
}

const chiavi = {
  elenco: (companyId: string | null) => ["pos", "elenco", companyId] as const,
  uno: (id: string | undefined) => ["pos", "uno", id] as const,
  figure: (companyId: string | null) => ["pos", "figure", companyId] as const,
};

const SELECT_POS =
  "id, company_id, order_id, status, revisione, revisioni, contenuto, iter, approvato_da_nome, approvato_il, created_at, updated_at, document_type, commessa:orders!pos_documents_order_id_fkey(order_code, description)";

type RigaDb = {
  id: string; company_id: string; order_id: string; status: string; revisione: number | null;
  revisioni: unknown; contenuto: unknown; iter: unknown; approvato_da_nome: string | null; approvato_il: string | null;
  created_at: string; updated_at: string | null; document_type: string | null;
  commessa: { order_code: string | null; description: string | null } | null;
};

function daDb(r: RigaDb): PosRiga {
  const modello = !!r.contenuto && typeof r.contenuto === "object" && (r.contenuto as { versione_modello?: unknown }).versione_modello === 1;
  return {
    id: r.id,
    company_id: r.company_id,
    order_id: r.order_id,
    status: r.status,
    revisione: r.revisione ?? 0,
    revisioni: Array.isArray(r.revisioni) ? (r.revisioni as RevisionePos[]) : [],
    contenuto: normalizzaPos(r.contenuto),
    daCompilare: !modello,
    iter: (r.iter && typeof r.iter === "object" ? r.iter : {}) as IterPos,
    approvato_da_nome: r.approvato_da_nome,
    approvato_il: r.approvato_il,
    created_at: r.created_at,
    updated_at: r.updated_at,
    commessa: r.commessa,
  };
}

export function usePosElenco() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: chiavi.elenco(companyId),
    enabled: !!companyId,
    queryFn: async (): Promise<PosRiga[]> => {
      const { data, error } = await supabase
        .from("pos_documents")
        .select(SELECT_POS)
        .eq("company_id", companyId!)
        .or("document_type.is.null,document_type.eq.pos")
        .is("superseded_by", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as RigaDb[]).map(daDb);
    },
    staleTime: 30 * 1000,
  });
}

export function usePos(id: string | undefined) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: chiavi.uno(id),
    enabled: !!id && !!companyId,
    queryFn: async (): Promise<PosRiga | null> => {
      const { data, error } = await supabase
        .from("pos_documents")
        .select(SELECT_POS)
        .eq("id", id!)
        .eq("company_id", companyId!)
        .maybeSingle();
      if (error) throw error;
      return data ? daDb(data as unknown as RigaDb) : null;
    },
    // L'editor si rimonta quando il POS cambia: niente ricariche mentre si scrive.
    refetchOnWindowFocus: false,
  });
}

// ── Server ───────────────────────────────────────────────────────────────────

export class ErrorePos extends Error {
  constructor(message: string, readonly mancanti: VoceMancante[] = []) {
    super(message);
  }
}

async function chiamaServer<T>(corpo: Record<string, unknown>): Promise<T> {
  const { data: sessione } = await supabase.auth.getSession();
  const token = sessione.session?.access_token;
  if (!token) throw new ErrorePos("Sessione scaduta: accedi di nuovo e riprova");
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/genera-pos`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const testo = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = testo ? JSON.parse(testo) : {};
  } catch {
    // risposta non JSON: il messaggio è il testo
  }
  if (!res.ok || json.ok === false) {
    const messaggio = (typeof json.error === "string" && json.error) || testo || "Operazione non riuscita";
    throw new ErrorePos(messaggio, Array.isArray(json.mancanti) ? (json.mancanti as VoceMancante[]) : []);
  }
  return json as T;
}

export function useCreaPos() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, ruoloImpresa }: { orderId: string; ruoloImpresa?: string }) =>
      chiamaServer<{ pos_id: string; avvisi: string[] }>({ azione: "crea", company_id: companyId, order_id: orderId, ruolo_impresa: ruoloImpresa }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pos"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "POS non creato"),
  });
}

export async function datiAppPos(companyId: string, posId: string) {
  return chiamaServer<{ contenuto: PosContenuto; contesto: ContestoPos }>({ azione: "dati_app", company_id: companyId, pos_id: posId });
}

export async function lavorazioniAiPos(companyId: string, posId: string) {
  return chiamaServer<{ lavorazioni: Lavorazione[] }>({ azione: "lavorazioni_ai", company_id: companyId, pos_id: posId });
}

export function useApprovaPos() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (posId: string) => chiamaServer<{ approvato_da_nome: string }>({ azione: "approva", company_id: companyId, pos_id: posId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos"] });
      toast.success("POS approvato");
    },
  });
}

// ── Scritture dirette (RLS: permesso Sicurezza Cantiere) ─────────────────────

export function useSalvaPos(id: string) {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (campi: { contenuto?: PosContenuto; iter?: IterPos }) => {
      const riga: TablesUpdate<"pos_documents"> = { updated_at: new Date().toISOString() };
      if (campi.contenuto) {
        const c = campi.contenuto;
        riga.contenuto = c as unknown as Json;
        // Colonne riassuntive per la lista e per chi le legge ancora.
        riga.tipo_lavori = c.opera.descrizione_attivita || "Da specificare";
        riga.indirizzo_cantiere = [c.opera.cantiere.via, c.opera.cantiere.localita, c.opera.cantiere.provincia].filter(Boolean).join(", ") || "Da specificare";
        riga.data_inizio = c.opera.data_inizio || null;
        riga.data_fine_prevista = c.opera.data_fine || null;
        riga.numero_lavoratori = c.lavoratori.reduce((t, r) => t + (r.numero || 0), 0) || null;
        riga.responsabile_sicurezza = c.rspp.nominativo || null;
      }
      if (campi.iter) riga.iter = campi.iter as unknown as Json;
      const { error } = await supabase.from("pos_documents").update(riga).eq("id", id).eq("company_id", companyId!);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pos"] }),
    onError: (e) => toast.error(e instanceof Error ? `POS non salvato: ${e.message}` : "POS non salvato"),
  });
}

/** Un POS approvato non si tocca: si apre una nuova revisione, che torna in bozza. */
export function useNuovaRevisione(pos: PosRiga | null | undefined) {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (descrizione: string) => {
      if (!pos) throw new Error("POS non caricato");
      const rev = pos.revisione + 1;
      const revisioni = [...pos.revisioni, { rev, data: new Date().toISOString().slice(0, 10), descrizione }];
      const { error } = await supabase
        .from("pos_documents")
        .update({
          status: "bozza",
          revisione: rev,
          revisioni: revisioni as unknown as Json,
          approvato_da: null,
          approvato_da_nome: null,
          approvato_il: null,
          // Firme e verifiche valgono per la revisione precedente.
          iter: {} as unknown as Json,
          updated_at: new Date().toISOString(),
        })
        .eq("id", pos.id)
        .eq("company_id", companyId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos"] });
      toast.success("Nuova revisione aperta: il POS è tornato in bozza");
    },
    onError: (e) => toast.error(e instanceof Error ? `Revisione non aperta: ${e.message}` : "Revisione non aperta"),
  });
}

export function useEliminaPos() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pos_documents").delete().eq("id", id).eq("company_id", companyId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos"] });
      toast.success("POS eliminato");
    },
    onError: (e) => toast.error(e instanceof Error ? `POS non eliminato: ${e.message}` : "POS non eliminato"),
  });
}

// ── Allegati ─────────────────────────────────────────────────────────────────

export async function caricaAllegatoPos(companyId: string, posId: string, file: File): Promise<string> {
  const sicuro = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  const path = `${companyId}/pos/${posId}/${crypto.randomUUID()}-${sicuro}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (error) throw error;
  return path;
}

export async function rimuoviAllegatoPos(path: string): Promise<void> {
  if (!path) return;
  await supabase.storage.from(BUCKET).remove([path]);
}

export async function linkAllegatoPos(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error) return null;
  return data?.signedUrl ?? null;
}

// ── Figure della sicurezza dell'impresa ──────────────────────────────────────

export type RuoloFigura =
  | "datore_lavoro" | "dirigente" | "direttore_tecnico" | "preposto" | "capocantiere" | "rspp"
  | "medico_competente" | "rls" | "rlst" | "addetto_antincendio" | "addetto_primo_soccorso";

export interface FiguraSicurezza {
  id: string;
  company_id: string;
  ruolo: RuoloFigura;
  nominativo: string;
  hr_profilo_id: string | null;
  esterno: boolean;
  telefono: string | null;
  email: string | null;
  mansioni_sicurezza: string | null;
  attestato: string | null;
  scadenza: string | null;
  note: string | null;
  attivo: boolean;
}

export function useFigureSicurezza() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: chiavi.figure(companyId),
    enabled: !!companyId,
    queryFn: async (): Promise<FiguraSicurezza[]> => {
      const { data, error } = await supabase
        .from("sicurezza_figure")
        .select("*")
        .eq("company_id", companyId!)
        .eq("attivo", true)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as FiguraSicurezza[];
    },
  });
}

export type FiguraInput = Omit<FiguraSicurezza, "id" | "company_id" | "attivo"> & { id?: string };

export function useSalvaFigura() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...campi }: FiguraInput) => {
      const riga = {
        ...campi,
        nominativo: campi.nominativo.trim(),
        telefono: campi.telefono?.trim() || null,
        email: campi.email?.trim() || null,
        mansioni_sicurezza: campi.mansioni_sicurezza?.trim() || null,
        attestato: campi.attestato?.trim() || null,
        scadenza: campi.scadenza || null,
        note: campi.note?.trim() || null,
      };
      const q = id
        ? supabase.from("sicurezza_figure").update(riga).eq("id", id).eq("company_id", companyId!)
        : supabase.from("sicurezza_figure").insert({ ...riga, company_id: companyId! });
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: chiavi.figure(companyId) });
      toast.success(v.id ? "Figura aggiornata" : "Figura aggiunta");
    },
    onError: (e) => toast.error(e instanceof Error ? `Figura non salvata: ${e.message}` : "Figura non salvata"),
  });
}

export function useEliminaFigura() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Si spegne, non si cancella: i POS approvati la citano ancora.
      const { error } = await supabase.from("sicurezza_figure").update({ attivo: false }).eq("id", id).eq("company_id", companyId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chiavi.figure(companyId) });
      toast.success("Figura tolta");
    },
    onError: (e) => toast.error(e instanceof Error ? `Figura non tolta: ${e.message}` : "Figura non tolta"),
  });
}
