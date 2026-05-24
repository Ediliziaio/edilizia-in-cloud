// MP04 — Hook React Query per gestione multi-numero WhatsApp.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { withClientTimeout } from "@/lib/query-timeout";
import { toast } from "sonner";
import type { Database, Json } from "@/integrations/supabase/types";

export type WANumber = Database["public"]["Tables"]["ai_whatsapp_numbers"]["Row"];

export type WAPurpose =
  | "bot_operativo"
  | "assistenza"
  | "lead"
  | "marketing"
  | "notifiche";

export type WAPurposeGroup =
  | "commerciale_marketing"
  | "operativo_cantieri"
  | "amministrazione_assistenza";

export const PURPOSE_LABELS: Record<WAPurpose, string> = {
  bot_operativo: "Operativo / Cantieri",
  assistenza: "Assistenza / Amministrazione",
  lead: "Lead WhatsApp",
  marketing: "Marketing & Broadcast",
  notifiche: "Notifiche automatiche",
};

export const PURPOSE_DESCRIPTIONS: Record<WAPurpose, string> = {
  bot_operativo: "Silvio legge audio, foto, DDT e documenti; aggiorna commesse, rapportini, diario e materiali.",
  assistenza: "Clienti e amministrazione aprono richieste, chiedono documenti, pagamenti, stato lavori o supporto.",
  lead: "Numero per Click-to-WhatsApp e primo contatto da campagne ads o sito.",
  marketing: "Inbox commerciale e campagne broadcast con template approvati, follow-up e recensioni.",
  notifiche: "Alert automatici su scadenze, SAL, fatture, pagamenti e promemoria operativi.",
};

export const PURPOSE_ORDER: WAPurpose[] = [
  "bot_operativo",
  "marketing",
  "lead",
  "assistenza",
  "notifiche",
];

export const PURPOSE_GROUP_BY_PURPOSE: Record<WAPurpose, WAPurposeGroup> = {
  bot_operativo: "operativo_cantieri",
  marketing: "commerciale_marketing",
  lead: "commerciale_marketing",
  assistenza: "amministrazione_assistenza",
  notifiche: "amministrazione_assistenza",
};

export const PURPOSE_GROUPS: Record<
  WAPurposeGroup,
  {
    label: string;
    shortLabel: string;
    description: string;
    recommendedNumber: string;
    mode: string;
    purposes: WAPurpose[];
  }
> = {
  commerciale_marketing: {
    label: "WhatsApp Commerciale / Marketing",
    shortLabel: "Marketing",
    description: "Lead, campagne, follow-up, recensioni e risposte gestite dall'ufficio commerciale.",
    recommendedNumber: "Numero commerciale",
    mode: "AI assistita + operatore umano",
    purposes: ["marketing", "lead"],
  },
  operativo_cantieri: {
    label: "WhatsApp Operativo / Cantieri",
    shortLabel: "Cantieri",
    description: "Operai, magazzino e subappaltatori mandano audio, foto, DDT e rapportini a Silvio.",
    recommendedNumber: "Numero cantieri",
    mode: "Silvio autonomo con conferme",
    purposes: ["bot_operativo"],
  },
  amministrazione_assistenza: {
    label: "WhatsApp Amministrazione / Assistenza",
    shortLabel: "Amm. / Assistenza",
    description: "Documenti, pagamenti, scadenze, ticket cliente e notifiche transazionali.",
    recommendedNumber: "Numero amministrazione",
    mode: "Workflow automatici + handoff",
    purposes: ["assistenza", "notifiche"],
  },
};

export const PURPOSE_AUTONOMY: Record<WAPurpose, string> = {
  bot_operativo: "Silvio lavora in autonomia e chiede conferma prima di scrivere dati critici.",
  marketing: "L'ufficio vede le risposte e Silvio prepara bozze, follow-up e priorita.",
  lead: "Silvio qualifica il lead e passa al commerciale quando serve un umano.",
  assistenza: "Silvio apre ticket, riconosce cliente/cantiere e propone risposta.",
  notifiche: "Invio automatico controllato da regole, template e opt-in.",
};

export const PURPOSE_EXAMPLES: Record<WAPurpose, string[]> = {
  bot_operativo: [
    "Operaio invia audio di fine giornata -> bozza rapportino",
    "Magazziniere fotografa DDT -> proposta carico materiale",
    "Subappaltatore manda foto -> allegati su commessa",
  ],
  marketing: [
    "Lead risponde a campagna -> inbox commerciale",
    "Follow-up preventivo e richiesta recensione",
    "Operatore risponde dalla chat WhatsApp",
  ],
  lead: [
    "Click-to-WhatsApp da Meta Ads",
    "Qualifica bisogno, zona e budget",
    "Crea contatto e opportunita nel CRM",
  ],
  assistenza: [
    "Cliente chiede stato cantiere o documento",
    "Apre ticket e collega ordine/contatto",
    "Escalation a ufficio quando serve",
  ],
  notifiche: [
    "Promemoria pagamento o appuntamento",
    "Alert SAL, fattura o scadenza",
    "Messaggi transazionali con template",
  ],
};

export type WAOperationalAiMode = "draft_only" | "confirm_critical" | "auto_with_review";

export interface WAOperationalSettings {
  ai_mode: WAOperationalAiMode;
  daily_rapportino_enabled: boolean;
  daily_rapportino_time: string;
  daily_rapportino_target: "assigned_workers" | "all_field_workers";
  ddt_requires_confirmation: boolean;
  ddt_notify_admin: boolean;
  media_auto_classify: boolean;
  media_save_to_diary: boolean;
  attendance_enabled: boolean;
  safety_escalation_enabled: boolean;
  unknown_worker_mode: "block" | "create_review_ticket";
  handoff_note: string;
}

export const DEFAULT_OPERATIONAL_SETTINGS: WAOperationalSettings = {
  ai_mode: "confirm_critical",
  daily_rapportino_enabled: true,
  daily_rapportino_time: "17:00",
  daily_rapportino_target: "assigned_workers",
  ddt_requires_confirmation: true,
  ddt_notify_admin: true,
  media_auto_classify: true,
  media_save_to_diary: true,
  attendance_enabled: true,
  safety_escalation_enabled: true,
  unknown_worker_mode: "block",
  handoff_note: "Se il messaggio è ambiguo o riguarda sicurezza, costi, contenziosi o dati non certi, fermati e chiedi conferma al responsabile.",
};

function isRecord(value: Json | null | undefined): value is Record<string, Json> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asBoolean(value: Json | undefined, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asString<T extends string>(value: Json | undefined, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}

export function normalizeWAOperationalSettings(value: Json | null | undefined): WAOperationalSettings {
  const raw = isRecord(value) ? value : {};
  return {
    ai_mode: asString(
      raw.ai_mode,
      ["draft_only", "confirm_critical", "auto_with_review"] as const,
      DEFAULT_OPERATIONAL_SETTINGS.ai_mode,
    ),
    daily_rapportino_enabled: asBoolean(
      raw.daily_rapportino_enabled,
      DEFAULT_OPERATIONAL_SETTINGS.daily_rapportino_enabled,
    ),
    daily_rapportino_time:
      typeof raw.daily_rapportino_time === "string" && /^\d{2}:\d{2}$/.test(raw.daily_rapportino_time)
        ? raw.daily_rapportino_time
        : DEFAULT_OPERATIONAL_SETTINGS.daily_rapportino_time,
    daily_rapportino_target: asString(
      raw.daily_rapportino_target,
      ["assigned_workers", "all_field_workers"] as const,
      DEFAULT_OPERATIONAL_SETTINGS.daily_rapportino_target,
    ),
    ddt_requires_confirmation: asBoolean(
      raw.ddt_requires_confirmation,
      DEFAULT_OPERATIONAL_SETTINGS.ddt_requires_confirmation,
    ),
    ddt_notify_admin: asBoolean(raw.ddt_notify_admin, DEFAULT_OPERATIONAL_SETTINGS.ddt_notify_admin),
    media_auto_classify: asBoolean(raw.media_auto_classify, DEFAULT_OPERATIONAL_SETTINGS.media_auto_classify),
    media_save_to_diary: asBoolean(raw.media_save_to_diary, DEFAULT_OPERATIONAL_SETTINGS.media_save_to_diary),
    attendance_enabled: asBoolean(raw.attendance_enabled, DEFAULT_OPERATIONAL_SETTINGS.attendance_enabled),
    safety_escalation_enabled: asBoolean(
      raw.safety_escalation_enabled,
      DEFAULT_OPERATIONAL_SETTINGS.safety_escalation_enabled,
    ),
    unknown_worker_mode: asString(
      raw.unknown_worker_mode,
      ["block", "create_review_ticket"] as const,
      DEFAULT_OPERATIONAL_SETTINGS.unknown_worker_mode,
    ),
    handoff_note: typeof raw.handoff_note === "string"
      ? raw.handoff_note
      : DEFAULT_OPERATIONAL_SETTINGS.handoff_note,
  };
}

export const WA_NUMBERS_KEY = ["whatsapp", "numbers"] as const;

export function useWhatsAppNumbers() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: [...WA_NUMBERS_KEY, companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await withClientTimeout(
        supabase
        .from("ai_whatsapp_numbers")
        .select(
          "id, company_id, purpose, display_name, nome_account, numero, phone_number_id, waba_id, agent_id, stato, webhook_verified, messaggio_benvenuto, messaggio_fuori_orario, orario_attivo, operational_settings, daily_budget_eur, current_day_spend_eur, creato_il, updated_at",
        )
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .order("creato_il", { ascending: true }),
        "Caricamento numeri WhatsApp",
      );
      if (error) throw error;
      return data as WANumber[];
    },
  });
}

export function useWhatsAppNumber(id: string | undefined) {
  return useQuery({
    queryKey: [...WA_NUMBERS_KEY, "detail", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await withClientTimeout(
        supabase
        .from("ai_whatsapp_numbers")
        .select("*")
        .eq("id", id!)
        .single(),
        "Caricamento numero WhatsApp",
      );
      if (error) throw error;
      return data;
    },
  });
}

export function useWhatsAppNumbersByPurpose() {
  const query = useWhatsAppNumbers();
  const byPurpose = (query.data ?? []).reduce<Record<WAPurpose, WANumber[]>>(
    (acc, n) => {
      const p = n.purpose as WAPurpose;
      if (!acc[p]) acc[p] = [];
      acc[p].push(n);
      return acc;
    },
    { bot_operativo: [], assistenza: [], lead: [], marketing: [], notifiche: [] },
  );
  return { ...query, byPurpose };
}

export function useDeleteWANumber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("ai_whatsapp_numbers")
        .update({ deleted_at: new Date().toISOString(), stato: "removed" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: WA_NUMBERS_KEY });
      toast.success("Numero rimosso.");
    },
    onError: (err: Error) => toast.error(`Errore: ${err.message}`),
  });
}

export interface WANumberUpdate {
  id: string;
  display_name?: string | null;
  messaggio_benvenuto?: string | null;
  messaggio_fuori_orario?: string | null;
  orario_attivo?: Json | null;
  operational_settings?: Json | null;
  daily_budget_eur?: number | null;
  agent_id?: string | null;
}

export interface ConnectPayload {
  purpose: WAPurpose;
  phone_number: string;
  phone_number_id: string;
  waba_id: string;
  access_token: string;
  display_name?: string;
  nome_account?: string;
}

export function useConnectWANumber() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ConnectPayload) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      const { data, error } = await supabase.functions.invoke("whatsapp-connect", {
        body: {
          company_id: companyId,
          purpose: payload.purpose,
          phone_number: payload.phone_number,
          phone_number_id: payload.phone_number_id,
          waba_id: payload.waba_id,
          access_token: payload.access_token,
          display_name: payload.display_name,
          nome_account: payload.nome_account,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...WA_NUMBERS_KEY, companyId] });
      toast.success("Numero WhatsApp registrato. Completa la verifica webhook.");
    },
    onError: (err: Error) => toast.error(`Errore: ${err.message}`),
  });
}

export function useUpdateWANumberSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: WANumberUpdate) => {
      const { id, ...updates } = payload;
      const { error } = await supabase
        .from("ai_whatsapp_numbers")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: WA_NUMBERS_KEY });
      toast.success("Impostazioni salvate.");
    },
    onError: (err: Error) => toast.error(`Errore: ${err.message}`),
  });
}
