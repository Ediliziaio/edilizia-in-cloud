import {
  User, Shield, Users, Server, Mail, Bell,
  ScrollText, Bot, Globe, Zap, Plug, Landmark,
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
        id: "profilo",
        label: "Profilo",
        description: "Nome, email e informazioni personali",
        icon: User,
        url: "/admin/impostazioni/profilo",
      },
      {
        id: "sicurezza",
        label: "Sicurezza",
        description: "Password, sessioni attive e accesso",
        icon: Shield,
        url: "/admin/impostazioni/sicurezza",
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
        id: "integrazioni",
        label: "Integrazioni",
        description: "API esterne, webhook e connettori",
        icon: Plug,
        url: "/admin/impostazioni/integrazioni",
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
        id: "agenti-ai",
        label: "Agenti AI",
        description: "Configurazione modelli e agenti intelligenti",
        icon: Bot,
        url: "/admin/impostazioni/agenti-ai",
      },
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
    ],
  },
  {
    group: "Sistema",
    items: [
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
        label: "Feature Flags",
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
    ],
  },
];
