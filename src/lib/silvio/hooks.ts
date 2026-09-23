/**
 * hooks.ts — MP-SILVIO · hook React per l'agente operativo per-azienda.
 * (Distinto dallo scaffold admin silvio_agent_*.)
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { toast } from "sonner";
import type { Autorizzazione } from "./permessi";

const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

export interface SilvioAzioneCatalogo {
  chiave: string;
  descrizione: string;
  modulo: string;
  funzione_target: string;
  reversibilita: string;
  categoria_rischio: string;
  ambito: string;
  autorizzazione_default: Autorizzazione;
  autorizzazione_effettiva: Autorizzazione;
  ruoli_consentiti: string[];
  attiva: boolean;
}

/** Catalogo azioni con autorizzazione effettiva per l'azienda/utente correnti. */
export function useSilvioCatalogo() {
  return useQuery({
    queryKey: ["silvio-catalogo"],
    queryFn: async (): Promise<SilvioAzioneCatalogo[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("silvio_catalogo");
      if (error) throw error;
      return (data as SilvioAzioneCatalogo[]) ?? [];
    },
  });
}

/** Imposta un override (solo restrittivo) o disattiva un'azione per l'azienda. */
export function useSilvioOverrideSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { chiave: string; autorizzazione?: Autorizzazione | null; attiva?: boolean | null }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)("silvio_azione_override_set", {
        p_chiave: input.chiave,
        p_autorizzazione: input.autorizzazione ?? null,
        p_attiva: input.attiva ?? null,
      });
      if (error) throw error;
      return input;
    },
    onSuccess: () => {
      toast.success("Permesso aggiornato");
      void qc.invalidateQueries({ queryKey: ["silvio-catalogo"] });
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Operazione non riuscita", {
        description: msg.includes("override_non_puo_allargare")
          ? "Non puoi rendere un'azione più permissiva del livello di sicurezza di base."
          : msg,
      });
    },
  });
}

// ─── MP-SILVIO-06/04/05 — coda conferme, audit, task, playbook (read + risolvi) ──

export interface SilvioCodaVoce {
  id: string; azione_chiave: string; parametri: Record<string, unknown>;
  anteprima: string | null; stato: string; origine: string | null; created_at: string;
}
export interface SilvioAuditVoce {
  id: string; azione_chiave: string; oggetto_tipo: string | null; oggetto_id: string | null;
  esito: string; autonomia: string; motivo: string | null; origine: string | null;
  reversibile: boolean; ref_audit_id: string | null; created_at: string;
}
export interface SilvioTaskRow {
  id: string; titolo: string | null; origine: string; stato: string; passo_corrente: number;
  contesto: Record<string, unknown>; created_at: string;
}
export interface SilvioPlaybookRow {
  id: string; company_id: string | null; chiave: string; nome: string; innesco: string;
  passi: Array<{ ordine: number; azione_chiave?: string; condizione?: string; nota?: string }>; attivo: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sbAnyS = supabase as unknown as { from: (t: string) => any };

export function useSilvioCodaConferme() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["silvio-coda", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<SilvioCodaVoce[]> => {
      const { data, error } = await sbAnyS.from("silvio_coda_conferme")
        .select("id, azione_chiave, parametri, anteprima, stato, origine, created_at")
        // Solo QUESTA azienda (il super admin e chi ha più aziende le vedevano tutte).
        .eq("company_id", companyId)
        .eq("stato", "in_attesa").order("created_at", { ascending: true }).limit(100);
      if (error) throw error;
      return (data as SilvioCodaVoce[]) ?? [];
    },
  });
}

export function useRisolviConferma() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; azione: "approvata" | "rifiutata"; note?: string }) => {
      if (input.azione === "approvata") {
        // MP-06: Approva = ESEGUI. Passa dall'orchestratore (esegue + audit + marca coda).
        const { data: session } = await supabase.auth.getSession();
        const tk = session.session?.access_token;
        if (!tk) throw new Error("Non autenticato");
        const res = await fetch(`${FN_BASE}/silvio-orchestratore`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
          body: JSON.stringify({ coda_id: input.id }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || j.ok === false) throw new Error(j.errore || j.error || "Esecuzione non riuscita");
      } else {
        const { error } = await (supabase.rpc as any)("silvio_coda_risolvi", {
          p_id: input.id, p_azione: "rifiutata", p_note: input.note ?? null, p_parametri_modificati: null,
        });
        if (error) throw error;
      }
      return input;
    },
    onSuccess: (input) => {
      toast.success(input.azione === "approvata" ? "Eseguito" : "Rifiutato");
      void qc.invalidateQueries({ queryKey: ["silvio-coda"] });
      void qc.invalidateQueries({ queryKey: ["silvio-audit"] });
    },
    onError: (e) => toast.error("Operazione non riuscita", { description: e instanceof Error ? e.message : String(e) }),
  });
}

export function useSilvioAudit(limit = 50) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["silvio-audit", limit, companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<SilvioAuditVoce[]> => {
      const { data, error } = await sbAnyS.from("silvio_audit")
        .select("id, azione_chiave, oggetto_tipo, oggetto_id, esito, autonomia, motivo, origine, reversibile, ref_audit_id, created_at")
        // Solo QUESTA azienda (il super admin e chi ha più aziende le vedevano tutte).
        .eq("company_id", companyId)
        .order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return (data as SilvioAuditVoce[]) ?? [];
    },
  });
}

// errori parlanti del DB (silvio_undo) → messaggi per l'utente
const UNDO_MSG: Record<string, string> = {
  gia_annullata: "Questa azione è già stata annullata.",
  bozza_gia_confermata: "La bozza è già stata confermata: non si può più annullare.",
  oggetto_assente: "L'elemento è già stato rimosso.",
  annullamento_non_supportato: "Questa azione non si può annullare automaticamente.",
  non_reversibile: "Questa azione non è reversibile.",
  non_annullabile: "Solo le azioni eseguite si possono annullare.",
  oggetto_non_tracciato: "Non è stato tracciato cosa annullare per questa azione.",
  non_autorizzato: "Non hai i permessi per annullare.",
};

/** Annulla un'azione reversibile eseguita (MP-SILVIO-06): esegue l'inverso e traccia. */
export function useSilvioUndo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (auditId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)("silvio_undo", { p_audit_id: auditId });
      if (error) throw error;
      return auditId;
    },
    onSuccess: () => {
      toast.success("Azione annullata");
      void qc.invalidateQueries({ queryKey: ["silvio-audit"] });
      void qc.invalidateQueries({ queryKey: ["silvio-coda"] });
    },
    onError: (e) => {
      const raw = e instanceof Error ? e.message : String(e);
      const key = Object.keys(UNDO_MSG).find((k) => raw.includes(k));
      toast.error("Annullamento non riuscito", { description: key ? UNDO_MSG[key] : raw });
    },
  });
}

export function useSilvioTaskAttivi() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["silvio-task-attivi", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<SilvioTaskRow[]> => {
      const { data, error } = await sbAnyS.from("silvio_task")
        .select("id, titolo, origine, stato, passo_corrente, contesto, created_at")
        // Solo QUESTA azienda (il super admin e chi ha più aziende le vedevano tutte).
        .eq("company_id", companyId)
        .eq("archiviato", false).order("updated_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (data as SilvioTaskRow[]) ?? [];
    },
  });
}

export function useSilvioPlaybook() {
  return useQuery({
    queryKey: ["silvio-playbook"],
    queryFn: async (): Promise<SilvioPlaybookRow[]> => {
      const { data, error } = await sbAnyS.from("silvio_playbook")
        .select("id, company_id, chiave, nome, innesco, passi, attivo").order("nome", { ascending: true });
      if (error) throw error;
      return (data as SilvioPlaybookRow[]) ?? [];
    },
  });
}

/** Avvia un playbook (ricetta) → l'orchestratore crea un task ed esegue/accoda i passi. */
export function useAvviaPlaybook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { playbook_chiave: string; contesto?: Record<string, unknown> }) => {
      const { data: session } = await supabase.auth.getSession();
      const tk = session.session?.access_token;
      if (!tk) throw new Error("Non autenticato");
      const res = await fetch(`${FN_BASE}/silvio-orchestratore`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
        body: JSON.stringify({ origine: "playbook", playbook_chiave: input.playbook_chiave, contesto: input.contesto ?? {} }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.ok === false) throw new Error(j.error || j.motivo || "Avvio non riuscito");
      return j;
    },
    onSuccess: (j: { inviati?: number; in_coda?: number }) => {
      const parts = [];
      if (j.inviati) parts.push(`${j.inviati} eseguite`);
      if (j.in_coda) parts.push(`${j.in_coda} da approvare`);
      toast.success("Procedura avviata", { description: parts.join(" · ") || "Task creato" });
      void qc.invalidateQueries({ queryKey: ["silvio-coda"] });
      void qc.invalidateQueries({ queryKey: ["silvio-task-attivi"] });
      void qc.invalidateQueries({ queryKey: ["silvio-audit"] });
    },
    onError: (e) => toast.error("Avvio non riuscito", { description: e instanceof Error ? e.message : String(e) }),
  });
}

/** Richiesta diretta a Silvio (linguaggio naturale) → orchestratore (piano→esegui/coda). */
export function useChiediSilvio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { richiesta: string; contesto?: Record<string, unknown> }) => {
      const { data: session } = await supabase.auth.getSession();
      const tk = session.session?.access_token;
      if (!tk) throw new Error("Non autenticato");
      const res = await fetch(`${FN_BASE}/silvio-orchestratore`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
        body: JSON.stringify({ origine: "richiesta", richiesta: input.richiesta, contesto: input.contesto ?? {} }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Richiesta non riuscita");
      return j as { ok?: boolean; motivo?: string; inviati?: number; in_coda?: number; suggerimento?: string };
    },
    onSuccess: (j) => {
      if (j.ok === false) {
        toast.info("Non ho capito bene", { description: j.suggerimento || "Riprova a riformulare la richiesta." });
      } else {
        const p = [];
        if (j.inviati) p.push(`${j.inviati} fatte`);
        if (j.in_coda) p.push(`${j.in_coda} da approvare`);
        toast.success("Silvio ha lavorato", { description: p.join(" · ") || "Nessuna azione necessaria" });
      }
      void qc.invalidateQueries({ queryKey: ["silvio-coda"] });
      void qc.invalidateQueries({ queryKey: ["silvio-audit"] });
      void qc.invalidateQueries({ queryKey: ["silvio-task-attivi"] });
    },
    onError: (e) => toast.error("Richiesta non riuscita", { description: e instanceof Error ? e.message : String(e) }),
  });
}

// ─── MP-SILVIO-07 — canali (verifica numero WhatsApp, reverse-OTP) ───────────

export interface SilvioCanaleRow {
  id: string;
  canale: string;
  identificativo: string;
  verificato: boolean;
  verificato_at: string | null;
  codice: string | null;
  codice_scadenza: string | null;
  created_at: string;
}

export interface AvviaVerificaResult {
  codice: string;
  identificativo: string;
  numero_aziendale: string | null;
  scade_il: string;
}

/** Canali Silvio dell'utente corrente (RLS: solo le proprie righe). */
export function useSilvioCanali() {
  return useQuery({
    queryKey: ["silvio-canali"],
    queryFn: async (): Promise<SilvioCanaleRow[]> => {
      const { data, error } = await sbAnyS.from("silvio_canali_identita")
        .select("id, canale, identificativo, verificato, verificato_at, codice, codice_scadenza, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as SilvioCanaleRow[]) ?? [];
    },
    // Mentre una verifica è in corso (riga non verificata) ricontrolla ogni 4s,
    // così la UI passa a "collegato" appena l'utente invia il codice da WhatsApp.
    refetchInterval: (query) => {
      const rows = (query.state.data ?? []) as SilvioCanaleRow[];
      return rows.some((r) => !r.verificato) ? 4000 : false;
    },
  });
}

const AVVIA_MSG: Record<string, string> = {
  numero_gia_collegato: "Questo numero è già collegato a un altro account.",
  numero_non_valido: "Numero non valido. Inseriscilo con il prefisso internazionale (es. +39…).",
  azienda_non_risolta: "Non riesco a determinare la tua azienda. Ricarica la pagina e riprova.",
  non_autenticato: "Sessione scaduta: accedi di nuovo.",
};

/** Avvia la verifica reverse-OTP per un numero WhatsApp. Ritorna il codice da inviare. */
export function useAvviaVerificaCanale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { numero: string }): Promise<AvviaVerificaResult> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("silvio_canale_avvia_verifica", {
        p_identificativo: input.numero,
      });
      if (error) throw error;
      return data as AvviaVerificaResult;
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["silvio-canali"] }); },
    onError: (e) => {
      const raw = e instanceof Error ? e.message : String(e);
      const key = Object.keys(AVVIA_MSG).find((k) => raw.includes(k));
      toast.error("Verifica non avviata", { description: key ? AVVIA_MSG[key] : raw });
    },
  });
}

/** Scollega un canale (elimina la riga; RLS: solo le proprie). */
export function useScollegaCanale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sbAnyS.from("silvio_canali_identita").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      toast.success("Canale scollegato");
      void qc.invalidateQueries({ queryKey: ["silvio-canali"] });
    },
    onError: (e) => toast.error("Operazione non riuscita", { description: e instanceof Error ? e.message : String(e) }),
  });
}
