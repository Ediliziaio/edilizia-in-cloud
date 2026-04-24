import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─── Tipi principali ──────────────────────────────────────

/** Singola azione eseguibile da un playbook */
export interface PlaybookAction {
  type: "send_email" | "add_tag" | "notify_superadmin" | "update_flag";
  template_id?: string;
  tag?: string;
  message?: string;
  flag?: string;
  value?: boolean | string;
  delay_minutes: number;
}

/** Playbook lifecycle: regola automatica scatenata da un evento */
export interface Playbook {
  id: string;
  name: string;
  trigger_event:
    | "trial_started"
    | "trial_expiring_7d"
    | "trial_expired"
    | "payment_failed"
    | "payment_recovered"
    | "plan_upgraded"
    | "plan_downgraded"
    | "account_suspended"
    | "churned"
    | "reactivated";
  is_active: boolean;
  delay_hours: number;
  actions: PlaybookAction[];
  created_at: string;
}

/** Log di una singola esecuzione di playbook */
export interface PlaybookExecution {
  id: string;
  playbook_id: string | null;
  company_id: string;
  /** Nome azienda (join) — resolver side per UI più leggibile */
  company_name?: string | null;
  /** Nome playbook (join) */
  playbook_name?: string | null;
  trigger_event: string;
  status: "pending" | "running" | "completed" | "failed";
  actions_log: Array<{ action: string; result: string; at: string }>;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
}

/** Payload per creare un nuovo playbook */
export interface CreatePlaybookPayload {
  name: string;
  trigger_event: Playbook["trigger_event"];
}

/** Payload per aggiornare un playbook esistente */
export interface UpdatePlaybookPayload {
  id: string;
  name: string;
  trigger_event: Playbook["trigger_event"];
  is_active: boolean;
  delay_hours: number;
  actions: PlaybookAction[];
}

// ─── Chiavi query condivise ───────────────────────────────

const PLAYBOOKS_KEY = ["lifecycle-playbooks"] as const;
const EXECUTIONS_KEY = ["playbook-executions"] as const;

// ─── Utility: normalizza riga grezza dal DB ───────────────

function normalizePlaybook(raw: Record<string, unknown>): Playbook {
  // Il campo actions è JSONB — può arrivare come array o null
  const rawActions = raw.actions;
  const actions: PlaybookAction[] = Array.isArray(rawActions)
    ? (rawActions as PlaybookAction[])
    : [];

  return {
    id: raw.id as string,
    name: raw.name as string,
    trigger_event: raw.trigger_event as Playbook["trigger_event"],
    is_active: raw.is_active as boolean,
    delay_hours: (raw.delay_hours as number) ?? 0,
    actions,
    created_at: raw.created_at as string,
  };
}

function normalizeExecution(raw: Record<string, unknown>): PlaybookExecution {
  const rawLog = raw.actions_log;
  const actions_log: PlaybookExecution["actions_log"] = Array.isArray(rawLog)
    ? (rawLog as PlaybookExecution["actions_log"])
    : [];

  // PostgREST fornisce join come oggetto annidato (select "companies(name)")
  const company = raw.companies as { name: string } | null | undefined;
  const playbook = raw.lifecycle_playbooks as { name: string } | null | undefined;

  return {
    id: raw.id as string,
    playbook_id: (raw.playbook_id as string | null) ?? null,
    company_id: raw.company_id as string,
    company_name: company?.name ?? null,
    playbook_name: playbook?.name ?? null,
    trigger_event: raw.trigger_event as string,
    status: raw.status as PlaybookExecution["status"],
    actions_log,
    started_at: raw.started_at as string,
    completed_at: (raw.completed_at as string | null) ?? null,
    error_message: (raw.error_message as string | null) ?? null,
  };
}

// ─── Lista playbook ───────────────────────────────────────

/** Carica tutti i playbook ordinati per data di creazione */
export function usePlaybooksList() {
  return useQuery({
    queryKey: PLAYBOOKS_KEY,
    queryFn: async (): Promise<Playbook[]> => {
      const { data, error } = await supabase
        .from("lifecycle_playbooks")
        .select("id, name, trigger_event, is_active, delay_hours, actions, created_at")
        .order("created_at", { ascending: false });

      if (error) throw new Error("Impossibile caricare i playbook: " + error.message);

      return (data ?? []).map((row) => normalizePlaybook(row as Record<string, unknown>));
    },
    staleTime: 2 * 60 * 1000, // 2 minuti
  });
}

// ─── Lista esecuzioni ─────────────────────────────────────

/**
 * Carica le esecuzioni più recenti (default 100) con join company + playbook
 * per mostrare nome leggibile invece di UUID grezzi.
 * Filtri opzionali: companyId, status.
 */
export function usePlaybookExecutions(options?: {
  companyId?: string;
  status?: PlaybookExecution["status"] | "all";
  limit?: number;
}) {
  const { companyId, status, limit = 100 } = options ?? {};
  return useQuery({
    queryKey: [...EXECUTIONS_KEY, companyId ?? "all", status ?? "all", limit],
    queryFn: async (): Promise<PlaybookExecution[]> => {
      let query = supabase
        .from("playbook_executions")
        .select(
          "id, playbook_id, company_id, trigger_event, status, actions_log, started_at, completed_at, error_message, companies(name), lifecycle_playbooks(name)"
        )
        .order("started_at", { ascending: false })
        .limit(limit);

      if (companyId) {
        query = query.eq("company_id", companyId);
      }
      if (status && status !== "all") {
        query = query.eq("status", status);
      }

      const { data, error } = await query;

      if (error) throw new Error("Impossibile caricare le esecuzioni: " + error.message);

      return (data ?? []).map((row) => normalizeExecution(row as Record<string, unknown>));
    },
    staleTime: 60 * 1000,
  });
}

// ─── Crea playbook ────────────────────────────────────────

/** Mutation per inserire un nuovo playbook */
export function useCreatePlaybook() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreatePlaybookPayload): Promise<void> => {
      const { error } = await supabase.from("lifecycle_playbooks").insert({
        name: payload.name,
        trigger_event: payload.trigger_event,
        is_active: true,
        delay_hours: 0,
        actions: [],
      });

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Playbook creato");
      void qc.invalidateQueries({ queryKey: PLAYBOOKS_KEY });
    },
    onError: (err: Error) => {
      toast.error("Errore creazione playbook: " + err.message);
    },
  });
}

// ─── Aggiorna playbook ────────────────────────────────────

/** Mutation per aggiornare nome, stato, delay e azioni di un playbook */
export function useUpdatePlaybook() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (payload: UpdatePlaybookPayload): Promise<void> => {
      const { error } = await supabase
        .from("lifecycle_playbooks")
        .update({
          name: payload.name,
          trigger_event: payload.trigger_event,
          is_active: payload.is_active,
          delay_hours: payload.delay_hours,
          actions: payload.actions,
        })
        .eq("id", payload.id);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Playbook salvato");
      void qc.invalidateQueries({ queryKey: PLAYBOOKS_KEY });
    },
    onError: (err: Error) => {
      toast.error("Errore salvataggio playbook: " + err.message);
    },
  });
}

// ─── Elimina playbook ─────────────────────────────────────

/**
 * Mutation per eliminare un playbook.
 *
 * Il confirm UI DEVE avvenire a livello componente (AlertDialog), NON qui.
 * Prima c'era `window.confirm()` dentro il mutationFn: antipattern doppio —
 * (a) UI bloccante brutto, (b) se l'utente premeva Annulla la mutationFn
 * ritornava void senza errore, onSuccess scattava comunque con toast
 * "Playbook eliminato" mentre il record era ancora lì (falso positivo).
 */
export function useDeletePlaybook() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from("lifecycle_playbooks")
        .delete()
        .eq("id", id);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Playbook eliminato");
      void qc.invalidateQueries({ queryKey: PLAYBOOKS_KEY });
    },
    onError: (err: Error) => {
      toast.error("Errore eliminazione playbook: " + err.message);
    },
  });
}

// ─── Toggle attivo/inattivo ───────────────────────────────

/** Mutation rapida per attivare/disattivare un playbook */
export function useTogglePlaybook() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      is_active,
    }: {
      id: string;
      is_active: boolean;
    }): Promise<void> => {
      const { error } = await supabase
        .from("lifecycle_playbooks")
        .update({ is_active })
        .eq("id", id);

      if (error) throw new Error(error.message);
    },
    onSuccess: (_data, variables) => {
      toast.success(variables.is_active ? "Playbook attivato" : "Playbook disattivato");
      void qc.invalidateQueries({ queryKey: PLAYBOOKS_KEY });
    },
    onError: (err: Error) => {
      toast.error("Errore aggiornamento stato: " + err.message);
    },
  });
}
