import {
  User, Users, Server, Mail, Bell,
  ScrollText, Zap, Plug, Landmark, Filter,
  Webhook, CalendarDays, Wrench, Variable, Package,
  GitBranch, Shield, KeyRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface AdminSettingsItem {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  url: string;
  permission?: "can_manage_admins" | "can_manage_plans" | "can_view_platform_stats";
  badge?: string;
}

export interface AdminSettingsGroup {
  group: string;
  items: AdminSettingsItem[];
}

export const ADMIN_SETTINGS_NAV: AdminSettingsGroup[] = [
  {
    group: "Account",
    items: [
      {
        id: "mio-profilo",
        label: "Il mio profilo",
        description: "Dati personali, sicurezza, calendari, email OAuth, notifiche",
        icon: User,
        url: "/admin/impostazioni/mio-profilo",
      },
    ],
  },
  {
    group: "Team",
    items: [
      {
        id: "super-admin",
        label: "Gestione Team",
        description: "Gestisci gli amministratori della piattaforma",
        icon: Users,
        url: "/admin/impostazioni/super-admin",
        permission: "can_manage_admins",
      },
    ],
  },
  {
    group: "Piattaforma",
    items: [
      {
        id: "piattaforma",
        label: "Info Piattaforma",
        description: "Configurazione generale della piattaforma",
        icon: Server,
        url: "/admin/impostazioni/piattaforma",
        permission: "can_manage_admins",
      },
      {
        id: "campi-personalizzati",
        label: "Campi personalizzati",
        description: "Catalogo campi di sistema, copertura per oggetto e campi creati dalle aziende",
        icon: Variable,
        url: "/admin/impostazioni/campi-personalizzati",
        permission: "can_manage_admins",
      },
      {
        id: "prodotti-servizi",
        label: "Prodotti & Servizi",
        description: "Catalogo dei servizi venduti oltre a Edilizia in Cloud (consulenza, agenzia, performance…)",
        icon: Package,
        url: "/admin/impostazioni/prodotti-servizi",
        permission: "can_manage_admins",
      },
      {
        id: "integrazioni",
        label: "Integrazioni",
        description: "API esterne, webhook e connettori",
        icon: Plug,
        url: "/admin/impostazioni/integrazioni",
        permission: "can_manage_admins",
      },
      {
        id: "calendari",
        label: "Calendari marketing",
        description: "Calendari CRM, disponibilità e sincronizzazione Google/Apple",
        icon: CalendarDays,
        url: "/admin/impostazioni/calendari",
        permission: "can_manage_admins",
      },
      {
        id: "sequenze",
        label: "Pipeline di vendita",
        description: "Pipeline e fasi delle opportunità del CRM interno",
        icon: GitBranch,
        url: "/admin/impostazioni/sequenze",
        permission: "can_manage_admins",
      },
      {
        id: "banking",
        label: "Banking",
        description: "Collegamento Open Banking (Salt Edge) e situazione delle connessioni per azienda",
        icon: Landmark,
        url: "/admin/impostazioni/banking",
        permission: "can_manage_admins",
      },
      // L'AI sta tutta in /admin/ai, nel menu principale.
    ],
  },
  {
    group: "Comunicazioni",
    items: [
      {
        id: "email",
        label: "Email",
        description: "Provider, mittente e aspetto, dominio, invii e consegna",
        icon: Mail,
        url: "/admin/impostazioni/email",
        permission: "can_manage_admins",
      },
      {
        id: "notifiche",
        label: "Notifiche",
        description: "Avvisi per gli amministratori",
        icon: Bell,
        url: "/admin/impostazioni/notifiche",
        permission: "can_manage_admins",
      },
      // WhatsApp dal telefono sta nel Marketing (/admin/marketing/whatsapp-locale):
      // qui era lo stesso pannello una seconda volta.
      {
        id: "meta-lead-esclusioni",
        label: "Filtro Lead Meta",
        description: "Campagne Meta Lead Ads da non importare nel CRM (es. reclutamento venditori)",
        icon: Filter,
        url: "/admin/impostazioni/meta-lead-esclusioni",
        permission: "can_manage_admins",
      },
    ],
  },
  {
    group: "Sistema",
    items: [
      {
        id: "operazioni",
        label: "Operazioni",
        description: "Sincronizzazioni, import CSV, GDPR",
        icon: Wrench,
        // dentro le impostazioni: prima /admin/operazioni usciva dal menu delle impostazioni
        url: "/admin/impostazioni/operazioni",
        permission: "can_view_platform_stats",
      },
      {
        id: "audit",
        label: "Registro Attività",
        description: "Log di tutte le azioni degli amministratori",
        icon: ScrollText,
        url: "/admin/impostazioni/audit",
        permission: "can_manage_admins",
      },
      {
        id: "sicurezza",
        label: "Sicurezza",
        description: "Stato della sicurezza della piattaforma e IP autorizzati",
        icon: Shield,
        url: "/admin/impostazioni/sicurezza",
        permission: "can_manage_admins",
      },
      {
        id: "api-mcp",
        label: "API e MCP",
        description: "Chiavi per collegare Claude, ChatGPT e altri sistemi",
        icon: KeyRound,
        url: "/admin/impostazioni/api-mcp",
        permission: "can_manage_admins",
      },
      // «Funzionalità Azienda» sta nel menu principale (Prodotto): qui portava
      // fuori dalle impostazioni e la barra laterale cambiava del tutto.
      {
        id: "webhooks",
        label: "Webhook in uscita",
        description: "Avvisi verso sistemi esterni",
        icon: Zap,
        url: "/admin/impostazioni/webhooks",
        permission: "can_manage_admins",
      },
      {
        id: "webhook-logs",
        label: "Registro webhook",
        description: "Webhook in entrata (GoCardless, Stripe, Telnyx)",
        icon: Webhook,
        url: "/admin/impostazioni/webhook-logs",
        permission: "can_manage_admins",
      },
    ],
  },
];
