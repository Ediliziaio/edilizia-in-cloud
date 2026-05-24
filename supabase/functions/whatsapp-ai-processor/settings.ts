import type { ToolDef } from "./tools/shared/types.ts";

export interface OperationalSettings {
  ai_mode: "draft_only" | "confirm_critical" | "auto_with_review";
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

export const DEFAULT_OPERATIONAL_SETTINGS: OperationalSettings = {
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
  handoff_note:
    "Se il messaggio è ambiguo o riguarda sicurezza, costi, contenziosi o dati non certi, fermati e chiedi conferma al responsabile.",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asString<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}

export function normalizeOperationalSettings(value: unknown): OperationalSettings {
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

export function buildOperationalSystemPrompt(settings: OperationalSettings): string {
  const modeText = {
    draft_only: "SOLO BOZZE: non chiamare tool che scrivono dati. Prepara un riepilogo e spiega cosa andrebbe registrato.",
    confirm_critical:
      "CONFERMA DATI CRITICI: puoi registrare rapportini e foto quando il messaggio è chiaro; per DDT, sicurezza, materiali costosi o dati dubbi chiedi conferma.",
    auto_with_review:
      "AUTONOMO CON REVISIONE: registra i dati operativi chiari e segnala nel riepilogo cosa è stato salvato o cosa resta da verificare.",
  } satisfies Record<OperationalSettings["ai_mode"], string>;

  return `

CONFIGURAZIONE AZIENDALE DEL NUMERO OPERATIVO:
- Modalità: ${modeText[settings.ai_mode]}
- Rapportino giornaliero: ${settings.daily_rapportino_enabled ? `attivo alle ${settings.daily_rapportino_time}` : "non attivo"}.
- Destinatari promemoria: ${settings.daily_rapportino_target === "assigned_workers" ? "solo operai assegnati ai cantieri" : "tutti gli operativi"}.
- DDT: ${settings.ddt_requires_confirmation ? "chiedi sempre conferma prima di registrare" : "puoi registrare se i dati sono chiari"}; ${settings.ddt_notify_admin ? "avvisa amministrazione/responsabile" : "non creare escalation automatica"}.
- Foto/documenti: ${settings.media_auto_classify ? "classifica automaticamente" : "non classificare automaticamente"}; ${settings.media_save_to_diary ? "salva nel diario commessa se cantiere chiaro" : "non salvare nel diario senza conferma"}.
- Presenze via chat: ${settings.attendance_enabled ? "abilitate" : "disabilitate"}.
- Sicurezza: ${settings.safety_escalation_enabled ? "crea escalation quando ci sono rischi o incidenti" : "non creare escalation automatica"}.
- Regola interna: ${settings.handoff_note}
`.trim();
}

export function filterOperationalTools(
  tools: ToolDef[],
  settings: OperationalSettings,
): ToolDef[] {
  if (settings.ai_mode === "draft_only") return [];

  const disabled = new Set<string>();
  if (!settings.attendance_enabled) disabled.add("registra_presenza");
  if (!settings.media_save_to_diary) disabled.add("carica_foto_cantiere");
  if (!settings.safety_escalation_enabled) disabled.add("crea_segnalazione");

  return tools.filter((tool) => !disabled.has(tool.name));
}
