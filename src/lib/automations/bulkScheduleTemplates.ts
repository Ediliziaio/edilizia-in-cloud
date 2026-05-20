/**
 * bulkScheduleTemplates — catalog di template pre-configurati per
 * "messaggi programmati bulk" che l'utente può clonare con 1 click.
 *
 * Ognuno produce un payload pronto per INSERT su automation_flows con
 * `bulk_trigger_config` valorizzato. L'utente può poi aprire il flow e
 * personalizzarlo nel wizard o nel builder xyflow.
 */

export type BulkChannelType = "silvio_chat" | "telegram" | "whatsapp" | "email";
export type BulkTargetType = "role" | "all_workers" | "all_company_admins";
export type BulkTemplateMode = "static" | "ai_generated";

export interface BulkScheduleTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;     // emoji
  category: "operativo" | "finanza" | "hr" | "marketing" | "compliance";
  config: {
    cron: string;
    timezone: string;
    target: { type: BulkTargetType; value: string | null };
    channels: Array<{ type: BulkChannelType }>;
    use_fallback: boolean;
    template: {
      mode: BulkTemplateMode;
      body: string;
      ai_prompt?: string;
    };
  };
  /** Quanto è "essenziale" — alto = più visibile nella galleria */
  priority: number;
}

export const BULK_SCHEDULE_TEMPLATES: BulkScheduleTemplate[] = [
  {
    id: "briefing_operai_mattutino",
    name: "Briefing operai mattutino",
    description: "Ogni mattina lavorativa alle 7:00 manda a tutti gli operai il loro cantiere di oggi + ore previste. Canali: Telegram (push gratis) + Silvio chat (fallback).",
    icon: "👷",
    category: "operativo",
    priority: 10,
    config: {
      cron: "0 7 * * 1-5",
      timezone: "Europe/Rome",
      target: { type: "all_workers", value: null },
      // Telegram come canale primario per push gratuita sul telefono in cantiere,
      // Silvio chat come fallback per chi non ha legato il bot.
      channels: [{ type: "telegram" }, { type: "silvio_chat" }],
      use_fallback: true,
      template: {
        mode: "static",
        body: "Ciao {nome}, oggi {data_oggi}.\n📍 Cantiere: {cantiere_oggi}\n⏱ Ore: {ore_pianificate}\n🌤 Meteo: {meteo}\n\nBuona giornata!",
      },
    },
  },
  {
    id: "briefing_operai_ai",
    name: "Briefing operai personalizzato (AI)",
    description: "Come sopra ma Silvio scrive un messaggio diverso per ogni operaio in base ai suoi dati.",
    icon: "🤖",
    category: "operativo",
    priority: 9,
    config: {
      cron: "0 7 * * 1-5",
      timezone: "Europe/Rome",
      target: { type: "all_workers", value: null },
      channels: [{ type: "silvio_chat" }],
      use_fallback: false,
      template: {
        mode: "ai_generated",
        body: "",
        ai_prompt: "Genera un breve briefing operativo (max 200 char) per {nome} che oggi lavora a {cantiere_oggi} per {ore_pianificate}. Task da fare: {task_oggi}. Meteo: {meteo}. Includi 1-2 cose pratiche da ricordare. Tono diretto, italiano, no saluti formali.",
      },
    },
  },
  {
    id: "riepilogo_titolare_mattutino",
    name: "Riepilogo titolare 08:00",
    description: "Ogni mattina alle 8 ai company_admin: cantieri aperti, operai oggi, crediti scaduti, appuntamenti 48h.",
    icon: "👔",
    category: "operativo",
    priority: 8,
    config: {
      cron: "0 8 * * 1-5",
      timezone: "Europe/Rome",
      target: { type: "all_company_admins", value: null },
      channels: [{ type: "silvio_chat" }],
      use_fallback: false,
      template: {
        mode: "static",
        body: "Buongiorno {nome}, situazione {azienda} oggi:\n\n🏗 Cantieri aperti: {numero_cantieri_aperti}\n👷 Operai pianificati: {operai_oggi}\n⚠️ Crediti scaduti: {crediti_scaduti}\n📞 Appuntamenti 48h: {prossimi_appuntamenti}\n📦 DDT in arrivo: {ddt_in_arrivo}",
      },
    },
  },
  {
    id: "alert_crediti_settimanale",
    name: "Alert crediti scaduti — lunedì",
    description: "Ogni lunedì alle 9:00 ai company_admin: stato crediti scaduti per pianificare i solleciti.",
    icon: "💸",
    category: "finanza",
    priority: 7,
    config: {
      cron: "0 9 * * 1",
      timezone: "Europe/Rome",
      target: { type: "all_company_admins", value: null },
      channels: [{ type: "silvio_chat" }],
      use_fallback: false,
      template: {
        mode: "static",
        body: "📊 Settimana iniziata. Stato crediti {azienda}:\n\n💸 Crediti scaduti: {crediti_scaduti}\n\nVai in Tesoreria per la lista completa e mandare i solleciti.",
      },
    },
  },
  {
    id: "reminder_chiusura_settimana",
    name: "Riepilogo settimanale venerdì",
    description: "Venerdì alle 17:00 ai company_admin con sintesi settimana + cose chiuse / aperte.",
    icon: "📅",
    category: "operativo",
    priority: 6,
    config: {
      cron: "0 17 * * 5",
      timezone: "Europe/Rome",
      target: { type: "all_company_admins", value: null },
      channels: [{ type: "silvio_chat" }],
      use_fallback: false,
      template: {
        mode: "ai_generated",
        body: "",
        ai_prompt: "Genera un riepilogo settimanale per {nome} di {azienda}. Considera: {numero_cantieri_aperti} cantieri aperti, {crediti_scaduti} di crediti scaduti. Tono diretto, italiano, max 300 char. Suggerisci 1 cosa concreta su cui focus la prossima settimana.",
      },
    },
  },
  {
    id: "promemoria_durc_mensile",
    name: "Reminder DURC mensile",
    description: "Il 1° di ogni mese alle 9:00 ai company_admin per ricordare di verificare i DURC fornitori/subappaltatori.",
    icon: "📋",
    category: "compliance",
    priority: 5,
    config: {
      cron: "0 9 1 * *",
      timezone: "Europe/Rome",
      target: { type: "all_company_admins", value: null },
      channels: [{ type: "silvio_chat" }],
      use_fallback: false,
      template: {
        mode: "static",
        body: "📋 Promemoria mensile — verifica DURC.\n\nCiao {nome}, è il primo del mese. Ricorda di controllare i DURC di:\n• Fornitori principali\n• Subappaltatori attivi sui cantieri\n\nUn DURC scaduto blocca i pagamenti e può ritardare i cantieri pubblici.",
      },
    },
  },
  {
    id: "newsletter_team",
    name: "Newsletter aziendale settimanale",
    description: "Ogni lunedì alle 8:00 a tutti i dipendenti per condividere updates aziendali.",
    icon: "📰",
    category: "marketing",
    priority: 4,
    config: {
      cron: "0 8 * * 1",
      timezone: "Europe/Rome",
      target: { type: "role", value: "employee" },
      channels: [{ type: "silvio_chat" }],
      use_fallback: false,
      template: {
        mode: "static",
        body: "📰 Newsletter team — {data_oggi}\n\nCiao {nome}, ecco gli update di {azienda}:\n\n[Aggiungi qui le tue comunicazioni della settimana]\n\nBuona settimana!",
      },
    },
  },
];

/** Crea un payload pronto per INSERT in automation_flows da un template. */
export function bulkTemplateToFlowPayload(
  template: BulkScheduleTemplate,
  opts: { company_id: string; created_by: string }
): {
  company_id: string;
  name: string;
  description: string;
  status: "published" | "draft";
  created_by: string;
  bulk_trigger_config: BulkScheduleTemplate["config"] & {
    type: "bulk_scheduler";
    next_run_at: string;
    last_run_at: null;
  };
} {
  // next_run_at: pillo 5 min nel futuro così il runner cron lo prende presto
  // e ricalcola il vero next con cron-parser.
  const nextRunAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  return {
    company_id: opts.company_id,
    name: template.name,
    description: template.description,
    status: "draft", // l'utente conferma manualmente per attivare
    created_by: opts.created_by,
    bulk_trigger_config: {
      type: "bulk_scheduler",
      ...template.config,
      next_run_at: nextRunAt,
      last_run_at: null,
    },
  };
}
