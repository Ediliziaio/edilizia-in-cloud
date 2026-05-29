/**
 * MP-EMAIL-AI-01 — Hooks React per chiamare le edge function della cascata.
 *
 *   useGenerateAiDraft  → chiama L4 (Sonnet bozza on-demand)
 *   useReclassifyEmail  → chiama RPC reclassify_email_manuale (feedback loop)
 *   useL1Backfill       → chiama email-ai-l1-classify mode=backfill (admin only)
 */

import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { EmailCategoria, EntitaTipo } from "./types";

const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

// ─── L4 — Genera bozza risposta (MP-EMAIL-AI-02) ──────────────────────────────

export interface DraftVariante {
  etichetta: string; // "Secca" | "Diplomatica" | "Operativa" | ...
  corpo: string;
}

export interface DraftResponse {
  ok: boolean;
  email_id: string;
  categoria: string;
  playbook_used?: string;
  /** Oggetto della risposta (null se no_reply). */
  oggetto: string | null;
  /** 1-2 varianti editabili. Vuoto se no_reply. */
  varianti: DraftVariante[];
  /** Descrizioni dei dati da completare prima dell'invio (placeholder [DA VERIFICARE]). */
  dati_mancanti: string[];
  /** true per categorie che non richiedono risposta (newsletter/social/notifica/spam). */
  no_reply?: boolean;
  message?: string;
  entity_context_used?: boolean;
  thread_context_used?: boolean;
  elapsed_ms?: number;
  model?: string;
  anthropic_usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

export function useGenerateAiDraft() {
  return useMutation({
    mutationFn: async (email_id: string): Promise<DraftResponse> => {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Non autenticato");

      const res = await fetch(`${FN_BASE}/email-ai-l4-draft`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email_id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      return json as DraftResponse;
    },
    onError: (e) => {
      toast.error("Errore generazione bozza", {
        description: e instanceof Error ? e.message : String(e),
      });
    },
  });
}

// ─── Feedback loop — sposta email in altra categoria + aggiorna mittente ─────

export interface ReclassifyInput {
  email_id: string;
  categoria: EmailCategoria;
  entita_tipo?: EntitaTipo | null;
  entita_id?: string | null;
}

export function useReclassifyEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ReclassifyInput) => {
      const { error } = await (supabase.rpc as any)("reclassify_email_manuale", {
        p_email_id: input.email_id,
        p_categoria: input.categoria,
        p_entita_tipo: input.entita_tipo ?? null,
        p_entita_id: input.entita_id ?? null,
      });
      if (error) throw error;
      return { ok: true };
    },
    onSuccess: () => {
      // Invalida liste email + thread
      queryClient.invalidateQueries({ queryKey: ["email-inbox"] });
      queryClient.invalidateQueries({ queryKey: ["email-threads"] });
      queryClient.invalidateQueries({ queryKey: ["v_email_inbox_classified"] });
      toast.success("Email riclassificata. Il mittente è stato memorizzato.");
    },
    onError: (e) => {
      toast.error("Errore riclassificazione", {
        description: e instanceof Error ? e.message : String(e),
      });
    },
  });
}

// ─── MP-EMAIL-AI-03 — Feedback loop: 5 eventi di apprendimento ────────────────

export type EventoCorrezione = "sposta" | "associa" | "conferma" | "spam" | "annulla";

export interface RegistraCorrezioneInput {
  email_id: string;
  evento: EventoCorrezione;
  categoria?: EmailCategoria | null;
  entita_tipo?: EntitaTipo | null;
  entita_id?: string | null;
}

/**
 * Registra una correzione manuale (RPC registra_correzione_email).
 * Scrive audit immutabile + aggiorna mittenti_noti + email. Idempotente.
 * Effetto: la quota gestita da L1 sale nel tempo → costo medio scende.
 */
export function useRegistraCorrezione() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RegistraCorrezioneInput) => {
      const { data, error } = await (supabase.rpc as any)("registra_correzione_email", {
        p_email_id: input.email_id,
        p_evento: input.evento,
        p_categoria: input.categoria ?? null,
        p_entita_tipo: input.entita_tipo ?? null,
        p_entita_id: input.entita_id ?? null,
      });
      if (error) throw error;
      return data as { ok: boolean; evento: string; mittente: string };
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["email-inbox"] });
      queryClient.invalidateQueries({ queryKey: ["email-threads"] });
      queryClient.invalidateQueries({ queryKey: ["email-learning-dashboard"] });
      const msg: Record<EventoCorrezione, string> = {
        sposta: "Categoria aggiornata. Il mittente è stato memorizzato.",
        associa: "Entità collegata. Memorizzato per le prossime email.",
        conferma: "Classificazione confermata.",
        spam: "Mittente messo in blacklist spam.",
        annulla: "Etichetta rimossa. Email rimessa tra quelle da rivedere.",
      };
      toast.success(msg[vars.evento] ?? "Correzione registrata.");
    },
    onError: (e) => {
      toast.error("Errore correzione", { description: e instanceof Error ? e.message : String(e) });
    },
  });
}

// ─── MP-EMAIL-AI-03 — Dashboard apprendimento (north star L1%) ────────────────

export interface LearningDashboard {
  north_star_l1_perc: number;
  totale: number;
  da_regola: number;
  da_haiku: number;
  da_manuale: number;
  da_rivedere: number;
  serie: Array<{ giorno: string; totale: number; da_regola: number; da_haiku: number; da_manuale: number }>;
  mittenti_appresi: number;
  blacklist_count: number;
}

export function useEmailLearningDashboard(days = 30) {
  return useQuery({
    queryKey: ["email-learning-dashboard", days],
    queryFn: async (): Promise<LearningDashboard> => {
      const { data, error } = await (supabase.rpc as any)("email_learning_dashboard", { p_days: days });
      if (error) throw error;
      return (data ?? {}) as LearningDashboard;
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Backfill L1 — admin only ─────────────────────────────────────────────────

export interface L1BackfillResult {
  processed: number;
  l1_hits: number;
  l1_misses: number;
  perc_l1: number;
  dry_run?: boolean;
}

export function useL1Backfill() {
  return useMutation({
    mutationFn: async (opts: { company_id?: string; limit?: number; dry_run?: boolean }): Promise<L1BackfillResult> => {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Non autenticato");

      const res = await fetch(`${FN_BASE}/email-ai-l1-classify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ mode: "backfill", ...opts }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      return json as L1BackfillResult;
    },
  });
}

// ─── MP-EMAIL-AI-05 — CRUD regole instradamento ──────────────────────────────

import type { Condizione, Azione } from "./rules-engine";

export interface EmailRegola {
  id: string;
  nome: string;
  origine: "manuale" | "auto";
  stato: "attiva" | "in_approvazione" | "disattivata" | "rifiutata";
  priorita: number;
  combinatore: "AND" | "OR";
  condizioni: Condizione[];
  azioni: Azione[];
  match_count: number;
  ultimo_match_at: string | null;
  created_at: string;
}

export function useEmailRegole() {
  return useQuery({
    queryKey: ["email-regole"],
    queryFn: async (): Promise<EmailRegola[]> => {
      const { data, error } = await (supabase as any)
        .from("email_regole")
        .select("*")
        .order("priorita", { ascending: true });
      if (error) throw error;
      return (data ?? []) as EmailRegola[];
    },
    staleTime: 60 * 1000,
  });
}

export function useSaveEmailRegola() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (regola: Partial<EmailRegola> & { company_id?: string }) => {
      const payload = {
        nome: regola.nome,
        origine: regola.origine ?? "manuale",
        stato: regola.stato ?? "attiva",
        priorita: regola.priorita ?? 100,
        combinatore: regola.combinatore ?? "AND",
        condizioni: regola.condizioni ?? [],
        azioni: regola.azioni ?? [],
      };
      if (regola.id) {
        const { error } = await (supabase as any).from("email_regole").update(payload).eq("id", regola.id);
        if (error) throw error;
        return { id: regola.id };
      }
      const { data, error } = await (supabase as any).from("email_regole").insert(payload).select("id").single();
      if (error) throw error;
      return { id: data.id };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-regole"] });
      toast.success("Regola salvata.");
    },
    onError: (e) => toast.error("Errore salvataggio regola", { description: e instanceof Error ? e.message : String(e) }),
  });
}

export function useDeleteEmailRegola() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("email_regole").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-regole"] });
      toast.success("Regola eliminata.");
    },
  });
}

export function useToggleEmailRegola() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, stato }: { id: string; stato: EmailRegola["stato"] }) => {
      const { error } = await (supabase as any).from("email_regole").update({ stato }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["email-regole"] }),
  });
}

// ─── L3 batch trigger — admin only ────────────────────────────────────────────

export interface L3BatchResult {
  batched: number;
  classified: number;
  da_rivedere: number;
  processed?: number;
  elapsed_ms?: number;
  anthropic_usage?: Record<string, number>;
}

// ─── MP-EMAIL-AI-04 — Silvio query in linguaggio naturale ─────────────────────

export interface SilvioQueryResult {
  ok: boolean;
  intent: string;
  azione: string;
  count: number;
  risultati: Array<{
    email_id: string; thread_id: string | null; subject: string | null;
    from_email: string; received_at: string; categoria: string; score?: number | null;
  }>;
  sintesi: string | null;
}

export function useSilvioEmailQuery() {
  return useMutation({
    mutationFn: async (input: { query: string; azione?: "lista" | "conteggio" | "sintesi" }): Promise<SilvioQueryResult> => {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Non autenticato");
      const res = await fetch(`${FN_BASE}/email-silvio-query`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      return json as SilvioQueryResult;
    },
    onError: (e) => toast.error("Errore ricerca Silvio", { description: e instanceof Error ? e.message : String(e) }),
  });
}

export function useL3BatchClassify() {
  return useMutation({
    mutationFn: async (opts: { company_id?: string; limit?: number; dry_run?: boolean }): Promise<L3BatchResult> => {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Non autenticato");

      const res = await fetch(`${FN_BASE}/email-ai-l3-batch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ mode: "live", ...opts }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      return json as L3BatchResult;
    },
  });
}

// ─── MP-EMAIL-AI-06 — Estrazione allegati PDF → bozza gestionale ──────────────

export interface DocumentoEstratto {
  id: string;
  company_id: string;
  email_id: string | null;
  attachment_id: string | null;
  tipo: string;
  confidenza_tipo: number | null;
  campi: Record<string, { valore: string | number | null; conf: number }>;
  dati_incerti: string[];
  note: string | null;
  stato: "da_confermare" | "confermato" | "scartato" | "duplicato";
  fornitore_match_id: string | null;
  fornitore_match_tipo: string | null;
  dedup_fattura_id: string | null;
  iban_estratto: string | null;
  iban_alert: boolean;
  pdf_storage_bucket: string | null;
  pdf_storage_path: string | null;
  created_at: string;
}

// Tabella non ancora nei tipi generati (schema applicato al release MP-06): cast localizzato.
const sbAny = supabase as unknown as {
  from: (t: string) => ReturnType<typeof supabase.from>;
};

export function useEstraiAllegato() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { email_id: string; attachment_index: number }): Promise<{ ok?: boolean; draft?: DocumentoEstratto; skipped?: string; reason?: string }> => {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Non autenticato");
      const res = await fetch(`${FN_BASE}/email-ai-estrai-allegato`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      return json;
    },
    onSuccess: (data, vars) => {
      if (data.skipped) {
        toast.info("Estrazione non necessaria", { description: data.reason || data.skipped });
      } else {
        toast.success("Bozza pronta", { description: "Dati estratti dal documento. Controlla i campi evidenziati." });
        void qc.invalidateQueries({ queryKey: ["email-documenti-estratti", vars.email_id] });
      }
    },
    onError: (e) => toast.error("Errore estrazione", { description: e instanceof Error ? e.message : String(e) }),
  });
}

export function useDocumentiEstrattiPerEmail(emailId: string | null | undefined) {
  return useQuery({
    queryKey: ["email-documenti-estratti", emailId],
    enabled: !!emailId,
    queryFn: async (): Promise<DocumentoEstratto[]> => {
      const { data, error } = await sbAny
        .from("email_documento_estratto")
        .select("*")
        .eq("email_id", emailId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as DocumentoEstratto[]) || [];
    },
  });
}

export function useAggiornaStatoDocumentoEstratto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; stato: "confermato" | "scartato"; email_id?: string }) => {
      const patch: Record<string, unknown> = { stato: input.stato };
      if (input.stato === "confermato") {
        const { data: u } = await supabase.auth.getUser();
        patch.confirmed_by = u.user?.id ?? null;
        patch.confirmed_at = new Date().toISOString();
      }
      const { error } = await sbAny.from("email_documento_estratto").update(patch).eq("id", input.id);
      if (error) throw error;
      return input;
    },
    onSuccess: (input) => {
      toast.success(input.stato === "confermato" ? "Documento confermato" : "Bozza scartata");
      void qc.invalidateQueries({ queryKey: ["email-documenti-estratti", input.email_id] });
    },
    onError: (e) => toast.error("Errore", { description: e instanceof Error ? e.message : String(e) }),
  });
}

// ─── MP-EMAIL-AI-07 — DDT → proposta di carico magazzino ──────────────────────

export interface DdtCaricoRiga {
  descrizione: string;
  codice: string | null;
  qta_bolla: number;
  qta_ordine: number | null;
  scostamento: number | null;
  po_item_id: string | null;
  note: string | null;
}
export interface DdtCarico {
  id: string;
  email_id: string | null;
  documento_estratto_id: string | null;
  ddt_numero: string | null;
  purchase_order_numero: string | null;
  senza_ordine: boolean;
  righe: DdtCaricoRiga[];
  scostamenti_totali: number;
  stato: "bozza" | "confermato" | "scartato";
  created_at: string;
}

export function useCreaCaricoDdt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { documento_estratto_id: string; email_id?: string }): Promise<{ ok?: boolean; carico?: DdtCarico; error?: string; reason?: string }> => {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Non autenticato");
      const res = await fetch(`${FN_BASE}/email-ai-ddt-carico`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ documento_estratto_id: input.documento_estratto_id }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || `HTTP ${res.status}`);
      return out;
    },
    onSuccess: (data, vars) => {
      if (data.carico) {
        const s = data.carico.scostamenti_totali;
        toast.success("Carico proposto", { description: s > 0 ? `${s} righe con scostamento da verificare.` : "Quantità coerenti con l'ordine." });
        void qc.invalidateQueries({ queryKey: ["email-ddt-carichi", vars.email_id] });
      }
    },
    onError: (e) => toast.error("Errore carico", { description: e instanceof Error ? e.message : String(e) }),
  });
}

export function useCarichiDdtPerEmail(emailId: string | null | undefined) {
  return useQuery({
    queryKey: ["email-ddt-carichi", emailId],
    enabled: !!emailId,
    queryFn: async (): Promise<DdtCarico[]> => {
      const { data, error } = await sbAny
        .from("email_ddt_carico")
        .select("*")
        .eq("email_id", emailId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as DdtCarico[]) || [];
    },
  });
}

export function useAggiornaStatoCaricoDdt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; stato: "confermato" | "scartato"; email_id?: string }) => {
      const patch: Record<string, unknown> = { stato: input.stato };
      if (input.stato === "confermato") {
        const { data: u } = await supabase.auth.getUser();
        patch.confirmed_by = u.user?.id ?? null;
        patch.confirmed_at = new Date().toISOString();
      }
      const { error } = await sbAny.from("email_ddt_carico").update(patch).eq("id", input.id);
      if (error) throw error;
      return input;
    },
    onSuccess: (input) => {
      toast.success(input.stato === "confermato" ? "Carico confermato" : "Carico scartato");
      void qc.invalidateQueries({ queryKey: ["email-ddt-carichi", input.email_id] });
    },
    onError: (e) => toast.error("Errore", { description: e instanceof Error ? e.message : String(e) }),
  });
}

// ─── MP-EMAIL-AI-08 — Email → bozza opportunità ───────────────────────────────

export interface OpportunitaBozza {
  id: string;
  email_id: string | null;
  cliente_match_id: string | null;
  cliente_nuovo: { nome: string | null; email: string | null; telefono: string | null } | null;
  tipo_lavoro: string | null;
  indirizzo: string | null;
  tempistiche: string | null;
  vincoli: string | null;
  richiesta_sintesi: string | null;
  stato: "bozza" | "aperta" | "scartata";
  created_at: string;
}

export function useApriOpportunita() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { email_id: string }): Promise<{ ok?: boolean; bozza?: OpportunitaBozza; cliente_trovato?: boolean; error?: string }> => {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Non autenticato");
      const res = await fetch(`${FN_BASE}/email-ai-opportunita`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(input),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || `HTTP ${res.status}`);
      return out;
    },
    onSuccess: (data, vars) => {
      toast.success("Opportunità preparata", { description: data.cliente_trovato ? "Cliente collegato dal CRM." : "Cliente nuovo: proposta dai dati firma." });
      void qc.invalidateQueries({ queryKey: ["email-opportunita-bozze", vars.email_id] });
    },
    onError: (e) => toast.error("Errore opportunità", { description: e instanceof Error ? e.message : String(e) }),
  });
}

export function useOpportunitaBozzePerEmail(emailId: string | null | undefined) {
  return useQuery({
    queryKey: ["email-opportunita-bozze", emailId],
    enabled: !!emailId,
    queryFn: async (): Promise<OpportunitaBozza[]> => {
      const { data, error } = await sbAny
        .from("email_opportunita_bozza")
        .select("*")
        .eq("email_id", emailId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as OpportunitaBozza[]) || [];
    },
  });
}

export function useAggiornaStatoOpportunita() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; stato: "aperta" | "scartata"; email_id?: string }) => {
      const patch: Record<string, unknown> = { stato: input.stato };
      if (input.stato === "aperta") {
        const { data: u } = await supabase.auth.getUser();
        patch.confirmed_by = u.user?.id ?? null;
        patch.confirmed_at = new Date().toISOString();
      }
      const { error } = await sbAny.from("email_opportunita_bozza").update(patch).eq("id", input.id);
      if (error) throw error;
      return input;
    },
    onSuccess: (input) => {
      toast.success(input.stato === "aperta" ? "Opportunità segnata come aperta" : "Bozza scartata");
      void qc.invalidateQueries({ queryKey: ["email-opportunita-bozze", input.email_id] });
    },
    onError: (e) => toast.error("Errore", { description: e instanceof Error ? e.message : String(e) }),
  });
}
