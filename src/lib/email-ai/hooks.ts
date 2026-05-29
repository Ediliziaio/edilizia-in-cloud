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

// ─── MP-EMAIL-AI-09 — Email/documento → scadenza previsionale ─────────────────

export interface ScadenzaBozza {
  id: string;
  email_id: string | null;
  documento_estratto_id: string | null;
  direzione: "entrata" | "uscita";
  amount: number;
  due_date: string;
  descrizione: string | null;
  dedup_scadenza_id: string | null;
  scadenza_creata_id: string | null;
  stato: "bozza" | "aggiunta" | "scartata";
  created_at: string;
}

export function useRilevaScadenza() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { documento_estratto_id: string; email_id?: string }): Promise<{ ok?: boolean; bozza?: ScadenzaBozza; skipped?: string; reason?: string; gia_presente?: boolean }> => {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Non autenticato");
      const res = await fetch(`${FN_BASE}/email-ai-scadenza`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ documento_estratto_id: input.documento_estratto_id }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || `HTTP ${res.status}`);
      return out;
    },
    onSuccess: (data, vars) => {
      if (data.skipped) toast.info("Nessuna scadenza", { description: data.reason || data.skipped });
      else { toast.success("Scadenza rilevata", { description: "Controlla e aggiungila allo scadenzario." }); void qc.invalidateQueries({ queryKey: ["email-scadenze-bozze", vars.email_id] }); }
    },
    onError: (e) => toast.error("Errore scadenza", { description: e instanceof Error ? e.message : String(e) }),
  });
}

export function useScadenzeBozzePerEmail(emailId: string | null | undefined) {
  return useQuery({
    queryKey: ["email-scadenze-bozze", emailId],
    enabled: !!emailId,
    queryFn: async (): Promise<ScadenzaBozza[]> => {
      const { data, error } = await sbAny
        .from("email_scadenza_bozza").select("*").eq("email_id", emailId as string).order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as ScadenzaBozza[]) || [];
    },
  });
}

export function useConfermaScadenza() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; email_id?: string }) => {
      const { data, error } = await (supabase.rpc as any)("email_scadenza_conferma", { p_bozza_id: input.id });
      if (error) throw error;
      return { id: input.id, scadenza_id: data as string };
    },
    onSuccess: (_d, vars) => {
      toast.success("Aggiunta allo scadenzario", { description: "Voce previsionale creata nel Cashflow." });
      void qc.invalidateQueries({ queryKey: ["email-scadenze-bozze", vars.email_id] });
    },
    onError: (e) => toast.error("Errore conferma", { description: e instanceof Error ? e.message : String(e) }),
  });
}

export function useScartaScadenza() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; email_id?: string }) => {
      const { error } = await sbAny.from("email_scadenza_bozza").update({ stato: "scartata" }).eq("id", input.id);
      if (error) throw error;
      return input;
    },
    onSuccess: (input) => { toast.success("Scadenza scartata"); void qc.invalidateQueries({ queryKey: ["email-scadenze-bozze", input.email_id] }); },
    onError: (e) => toast.error("Errore", { description: e instanceof Error ? e.message : String(e) }),
  });
}

// ─── MP-EMAIL-AI-10 — Collegamenti email ↔ cantieri/pratiche ──────────────────

export interface EmailCollegamento {
  id: string;
  email_id: string;
  oggetto_tipo: "cantiere" | "pratica";
  oggetto_id: string;
  origine: string;
  created_at: string;
}
export interface OggettoOpzione {
  tipo: "cantiere" | "pratica";
  id: string;
  label: string;
}

export function useCollegamentiPerEmail(emailId: string | null | undefined) {
  return useQuery({
    queryKey: ["email-collegamenti", emailId],
    enabled: !!emailId,
    queryFn: async (): Promise<EmailCollegamento[]> => {
      const { data, error } = await sbAny
        .from("email_collegamenti").select("id, email_id, oggetto_tipo, oggetto_id, origine, created_at")
        .eq("email_id", emailId as string).order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as EmailCollegamento[]) || [];
    },
  });
}

export function useCantieriPraticheOpzioni(companyId: string | null | undefined) {
  return useQuery({
    queryKey: ["email-collega-opzioni", companyId],
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<OggettoOpzione[]> => {
      const out: OggettoOpzione[] = [];
      const { data: orders } = await sbAny
        .from("orders").select("id, client_name, client_company, indirizzo_lavori")
        .eq("company_id", companyId as string).order("created_at", { ascending: false }).limit(80);
      for (const o of (orders as any[]) || []) {
        const nome = [o.client_name || o.client_company, o.indirizzo_lavori].filter(Boolean).join(" — ");
        out.push({ tipo: "cantiere", id: o.id, label: nome || `Commessa ${String(o.id).slice(0, 8)}` });
      }
      const { data: pratiche } = await sbAny
        .from("pratiche_edilizie").select("id, tipo_pratica")
        .eq("company_id", companyId as string).order("created_at", { ascending: false }).limit(80);
      for (const p of (pratiche as any[]) || []) {
        out.push({ tipo: "pratica", id: p.id, label: `Pratica ${p.tipo_pratica || String(p.id).slice(0, 8)}` });
      }
      return out;
    },
  });
}

export function useCollegaEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { email_id: string; thread_id?: string | null; oggetto_tipo: "cantiere" | "pratica"; oggetto_id: string; company_id: string }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await sbAny.from("email_collegamenti").insert({
        company_id: input.company_id,
        email_id: input.email_id,
        thread_id: input.thread_id ?? null,
        oggetto_tipo: input.oggetto_tipo,
        oggetto_id: input.oggetto_id,
        origine: "manuale",
        collegato_da: u.user?.id ?? null,
      });
      if (error) throw error;
      return input;
    },
    onSuccess: (input) => { toast.success("Email collegata"); void qc.invalidateQueries({ queryKey: ["email-collegamenti", input.email_id] }); },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(/duplicate|unique/i.test(msg) ? "Già collegata a questo elemento" : "Errore collegamento", { description: msg.slice(0, 120) });
    },
  });
}

export function useScollegaEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; email_id: string }) => {
      const { error } = await sbAny.from("email_collegamenti").delete().eq("id", input.id);
      if (error) throw error;
      return input;
    },
    onSuccess: (input) => { toast.success("Collegamento rimosso"); void qc.invalidateQueries({ queryKey: ["email-collegamenti", input.email_id] }); },
    onError: (e) => toast.error("Errore", { description: e instanceof Error ? e.message : String(e) }),
  });
}

// ─── MP-EMAIL-AI-11 — Email → bozza evento/appuntamento ───────────────────────

export interface EventoBozza {
  id: string;
  email_id: string | null;
  titolo: string | null;
  inizio: string | null;
  tutto_il_giorno: boolean;
  luogo: string | null;
  ambiguo: boolean;
  nota: string | null;
  stato: "bozza" | "aggiunto" | "scartato";
  created_at: string;
}

export function useRilevaEvento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { email_id: string }): Promise<{ ok?: boolean; bozza?: EventoBozza; skipped?: string; reason?: string }> => {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Non autenticato");
      const res = await fetch(`${FN_BASE}/email-ai-evento`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(input),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || `HTTP ${res.status}`);
      return out;
    },
    onSuccess: (data, vars) => {
      if (data.skipped) toast.info("Nessun appuntamento", { description: data.reason || data.skipped });
      else { toast.success("Appuntamento rilevato", { description: "Controlla la data e aggiungilo in agenda." }); void qc.invalidateQueries({ queryKey: ["email-eventi-bozze", vars.email_id] }); }
    },
    onError: (e) => toast.error("Errore rilevazione", { description: e instanceof Error ? e.message : String(e) }),
  });
}

export function useEventiBozzePerEmail(emailId: string | null | undefined) {
  return useQuery({
    queryKey: ["email-eventi-bozze", emailId],
    enabled: !!emailId,
    queryFn: async (): Promise<EventoBozza[]> => {
      const { data, error } = await sbAny
        .from("email_evento_bozza").select("*").eq("email_id", emailId as string).order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as EventoBozza[]) || [];
    },
  });
}

export function useAggiornaStatoEvento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; stato: "aggiunto" | "scartato"; email_id?: string }) => {
      const patch: Record<string, unknown> = { stato: input.stato };
      if (input.stato === "aggiunto") {
        const { data: u } = await supabase.auth.getUser();
        patch.confirmed_by = u.user?.id ?? null;
        patch.confirmed_at = new Date().toISOString();
      }
      const { error } = await sbAny.from("email_evento_bozza").update(patch).eq("id", input.id);
      if (error) throw error;
      return input;
    },
    onSuccess: (input) => { toast.success(input.stato === "aggiunto" ? "Aggiunto in agenda" : "Scartato"); void qc.invalidateQueries({ queryKey: ["email-eventi-bozze", input.email_id] }); },
    onError: (e) => toast.error("Errore", { description: e instanceof Error ? e.message : String(e) }),
  });
}

// ─── MP-EMAIL-AI-12 — Bonifica arretrato (panoramica + azioni di massa) ────────

export interface BonificaGruppo { categoria: string; n: number; }

export function useBonificaOverview() {
  return useQuery({
    queryKey: ["email-bonifica-overview"],
    queryFn: async (): Promise<BonificaGruppo[]> => {
      const { data, error } = await (supabase.rpc as any)("bonifica_overview");
      if (error) throw error;
      return ((data as any[]) || []).map((r) => ({ categoria: r.categoria, n: Number(r.n) }));
    },
    staleTime: 30 * 1000,
  });
}

export function useBonificaArchivia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { categoria: string }): Promise<{ count: number; azione_id?: string }> => {
      const { data, error } = await (supabase.rpc as any)("bonifica_archivia_categoria", { p_categoria: input.categoria });
      if (error) throw error;
      return data as { count: number; azione_id?: string };
    },
    onSuccess: (data) => {
      toast.success(`${data.count} email archiviate`, { description: data.azione_id ? "Puoi annullare l'operazione." : undefined });
      void qc.invalidateQueries({ queryKey: ["email-bonifica-overview"] });
      void qc.invalidateQueries({ queryKey: ["email-threads"] });
    },
    onError: (e) => toast.error("Errore bonifica", { description: e instanceof Error ? e.message : String(e) }),
  });
}

export function useBonificaAnnulla() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { azione_id: string }) => {
      const { data, error } = await (supabase.rpc as any)("bonifica_annulla", { p_azione_id: input.azione_id });
      if (error) throw error;
      return data as { count: number };
    },
    onSuccess: (data) => {
      toast.success(`Ripristinate ${data.count} email`);
      void qc.invalidateQueries({ queryKey: ["email-bonifica-overview"] });
      void qc.invalidateQueries({ queryKey: ["email-threads"] });
    },
    onError: (e) => toast.error("Errore annulla", { description: e instanceof Error ? e.message : String(e) }),
  });
}

// ─── MP-EMAIL-AI-16 — Domini noti fornitori/clienti (per look-alike) ──────────

export function useDominiFornitoriNoti(companyId: string | null | undefined) {
  return useQuery({
    queryKey: ["email-domini-noti", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<string[]> => {
      const set = new Set<string>();
      const add = (email?: string | null) => {
        const d = (email || "").toLowerCase().match(/@([^@\s>]+)/)?.[1];
        if (d && !["gmail.com", "libero.it", "hotmail.com", "outlook.com", "yahoo.it", "yahoo.com", "icloud.com", "pec.it", "tin.it"].includes(d)) set.add(d);
      };
      const { data: anag } = await sbAny.from("anagrafiche_native").select("email, email_fatture").eq("company_id", companyId as string).limit(500);
      for (const a of (anag as any[]) || []) { add(a.email); add(a.email_fatture); }
      const { data: sup } = await sbAny.from("suppliers").select("email").eq("company_id", companyId as string).limit(500);
      for (const s of (sup as any[]) || []) add(s.email);
      return Array.from(set);
    },
  });
}
