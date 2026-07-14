import {
  User, Users, Server, Mail, Bell,
  ScrollText, Globe, Zap, Plug, Landmark,
  Webhook, Activity, CalendarDays, Wrench, Variable, Package,
  MessageCircle,
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
        description: "Calendari CRM, disponibilita e sync Google/Apple",
        icon: CalendarDays,
        url: "/admin/impostazioni/calendari",
        permission: "can_manage_admins",
      },
      {
        id: "banking",
        label: "Banking",
        description: "Conti bancari e impostazioni pagamenti",
        icon: Landmark,
        url: "/admin/impostazioni/banking",
        permission: "can_manage_admins",
      },
      {
        id: "banking-overview",
        label: "Vista Globale Banche",
        description: "Stato connessioni Open Banking per tutte le aziende",
        icon: Activity,
        url: "/admin/impostazioni/banking-overview",
        permission: "can_manage_admins",
      },
      // NB: "Agenti AI", "Monitor AI", "AI Test Lab", "Silvio Hub" sono state
      // consolidate in 3 pagine sulla sidebar principale (Revenue):
      //   /admin/ai-config   (Routing/Personas/KB/Pricing/Governance/Voci/Chatbot)
      //   /admin/ai-monitor  (Usage/TestLab/Health)
      //   /admin/ai-operate  (Approvals/Queue/Policies/Agents/Chief/Personas/Memory/Learning)
      // I vecchi link redirezionano automaticamente. Vedi adminRoutes.tsx.
    ],
  },
  {
    group: "Comunicazioni",
    items: [
      {
        id: "email",
        label: "Email",
        description: "Provider, template e statistiche invii",
        icon: Mail,
        url: "/admin/impostazioni/email",
      },
      {
        id: "notifiche",
        label: "Notifiche",
        description: "Alert e notifiche per gli admin",
        icon: Bell,
        url: "/admin/impostazioni/notifiche",
      },
      {
        id: "whatsapp-locale",
        label: "WhatsApp Locale",
        description: "Numeri WhatsApp non-ufficiali (gateway self-hosted) per marketing e outreach",
        icon: MessageCircle,
        url: "/admin/impostazioni/whatsapp-locale",
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
        description: "Sync logs, alert failure, import CSV, audit applicativo, GDPR",
        icon: Wrench,
        url: "/admin/operazioni",
        permission: "can_manage_admins",
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
        id: "ip-allowlist",
        label: "IP Allowlist",
        description: "Gestisci gli IP autorizzati per l'accesso",
        icon: Globe,
        url: "/admin/impostazioni/ip-allowlist",
        permission: "can_manage_admins",
      },
      {
        id: "feature-flags",
        label: "Funzionalità Azienda",
        description: "Abilita/disabilita funzionalità per azienda",
        icon: Zap,
        url: "/admin/feature-flags",
        permission: "can_manage_admins",
      },
      {
        id: "webhooks",
        label: "Webhook Outbound",
        description: "Notifica sistemi esterni",
        icon: Zap,
        url: "/admin/impostazioni/webhooks",
        permission: "can_manage_admins",
      },
      {
        id: "webhook-logs",
        label: "Webhook Log",
        description: "Log webhook in entrata (GoCardless, Stripe, Telnyx)",
        icon: Webhook,
        url: "/admin/impostazioni/webhook-logs",
        permission: "can_manage_admins",
      },
    ],
  },
];
