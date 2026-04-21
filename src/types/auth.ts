import type { User } from "@supabase/supabase-js";

export type AppRole =
  | "super_admin"
  | "company_admin"
  | "company_staff"
  | "customer"
  | "employee"
  | "subcontractor" // ruolo subappaltatore — accesso area campo
  | "salesperson"
  | "call_center"
  | "referrer"
  | "platform_manager"
  | "platform_sales"
  | "platform_support"
  | "platform_marketing"
  | "platform_implementation"
  | "multi_company_user";

/** Ruoli con accesso all'area campo (lavori.ediliziaincloud.com) */
export type CampoRole = "employee" | "subcontractor";
export const CAMPO_ROLES: CampoRole[] = ["employee", "subcontractor"];
export const OPERAIO_ROLES: AppRole[] = ["employee"];
export const SUBCONTRACTOR_ROLES: AppRole[] = ["subcontractor"];

export type PlatformRole =
  | "platform_manager"
  | "platform_sales"
  | "platform_support"
  | "platform_marketing"
  | "platform_implementation";

export const PLATFORM_ROLES: PlatformRole[] = [
  "platform_manager",
  "platform_sales",
  "platform_support",
  "platform_marketing",
  "platform_implementation",
];

export const PLATFORM_ROLE_LABELS: Record<PlatformRole, string> = {
  platform_manager: "Gestore Piattaforma",
  platform_sales: "Commerciale",
  platform_support: "Supporto",
  platform_marketing: "Marketing",
  platform_implementation: "Implementazione",
};

export const PLATFORM_ROLE_DESCRIPTIONS: Record<PlatformRole, string> = {
  platform_manager: "Accesso completo alla piattaforma e gestione team",
  platform_sales: "Gestione aziende, piani e statistiche",
  platform_support: "Gestione ticket e assistenza clienti",
  platform_marketing: "Gestione marketing e campagne piattaforma",
  platform_implementation: "Onboarding e configurazione aziende",
};

export const PLATFORM_ROLE_COLORS: Record<PlatformRole, string> = {
  platform_manager: "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200",
  platform_sales: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  platform_support: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  platform_marketing: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  platform_implementation: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200",
};

/** Permission presets per platform role */
export const PLATFORM_ROLE_PRESETS: Record<PlatformRole, Record<string, boolean>> = {
  platform_manager: {
    can_manage_companies: true,
    can_manage_plans: true,
    can_manage_tickets: true,
    can_manage_referrals: true,
    can_manage_admins: false,
    can_view_platform_stats: true,
    can_manage_marketing: true,
  },
  platform_sales: {
    can_manage_companies: true,
    can_manage_plans: true,
    can_manage_tickets: false,
    can_manage_referrals: true,
    can_manage_admins: false,
    can_view_platform_stats: true,
    can_manage_marketing: false,
  },
  platform_support: {
    can_manage_companies: true,
    can_manage_plans: false,
    can_manage_tickets: true,
    can_manage_referrals: false,
    can_manage_admins: false,
    can_view_platform_stats: true,
    can_manage_marketing: false,
  },
  platform_marketing: {
    can_manage_companies: false,
    can_manage_plans: false,
    can_manage_tickets: false,
    can_manage_referrals: true,
    can_manage_admins: false,
    can_view_platform_stats: true,
    can_manage_marketing: true,
  },
  platform_implementation: {
    can_manage_companies: true,
    can_manage_plans: false,
    can_manage_tickets: true,
    can_manage_referrals: false,
    can_manage_admins: false,
    can_view_platform_stats: true,
    can_manage_marketing: false,
  },
};

export interface MultiCompanyAccess {
  id: string;
  user_id: string;
  company_id: string;
  access_role: string;
  granted_by: string | null;
  created_at: string;
  company?: Company;
}

export const ADMIN_PLATFORM_ROLES: AppRole[] = [
  "super_admin",
  "platform_manager",
  "platform_sales",
  "platform_support",
  "platform_marketing",
  "platform_implementation",
];

export type CompanySector = 
  | "serramenti"
  | "infissi"
  | "bagni"
  | "tetti"
  | "fotovoltaico"
  | "pittura"
  | "ristrutturazioni"
  | "altro";

export type CompanyStatus = "trial" | "active" | "suspended" | "expired" | "free";

/**
 * Verticali di settore supportati dal Preventivatore Verticalizzato (FASE 1.1).
 * Coesiste con `CompanySector`: `sector` è meta-dato storico, `vertical` guida
 * la verticalizzazione UI/AI/listini.
 */
export type CompanyVertical =
  | "serramentista"
  | "tetti"
  | "bagno"
  | "ristrutturazione"
  | "tende_da_sole"
  | "vetrate"
  | "caldaie"
  | "clima"
  | "generico";

export interface Profile {
  id: string;
  company_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  avatar_url: string | null;
  phone: string | null;
  address: string | null;
  fiscal_code: string | null;
  site_address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Security fields
  password_changed_at: string | null;
  failed_login_count: number;
  locked_until: string | null;
  require_2fa: boolean;
  last_login_at: string | null;
  last_login_ip: string | null;
}

export interface Company {
  id: string;
  name: string;
  email: string;
  logo_url: string | null;
  sector: CompanySector;
  status: CompanyStatus;
  trial_ends_at: string | null;
  subscription_plan_id: string | null;
  stripe_customer_id: string | null;
  business_name: string | null;
  vat_number: string | null;
  fiscal_code: string | null;
  phone: string | null;
  pec: string | null;
  sdi_code: string | null;
  legal_address: string | null;
  legal_city: string | null;
  legal_province: string | null;
  legal_postal_code: string | null;
  operational_address: string | null;
  operational_city: string | null;
  operational_province: string | null;
  operational_postal_code: string | null;
  website: string | null;
  notes: string | null;
  payment_method: string;
  bank_iban: string | null;
  bank_account_holder: string | null;
  bank_name: string | null;
  payment_notes: string | null;
  created_at: string;
  updated_at: string;
  // Security fields
  enforce_2fa: boolean;
  allowed_ips: string[] | null;
  password_expiry_days: number;
  max_failed_attempts: number;
  // White-label addon
  white_label_enabled: boolean;
  brand_primary_color: string | null;
  brand_secondary_color: string | null;
  brand_accent_color: string | null;
  brand_text_on_primary: string | null;
  brand_platform_name: string | null;
  brand_favicon_url: string | null;
  brand_login_bg_url: string | null;
  brand_hide_powered_by: boolean;
  white_label_enabled_at: string | null;
  white_label_enabled_by: string | null;
  white_label_monthly_price: number;
  // GPS FleetTrack addon
  fleet_track_enabled: boolean;
  // Preventivatore Verticalizzato (FASE 1.1)
  vertical: CompanyVertical | null;
  verticals_secondari: CompanyVertical[];
  onboarding_vertical_completed: boolean;
  // Billing / dunning (SuperAdmin): queste colonne esistono già su
  // `companies` ma erano assenti dal type client causando cast ad `any`.
  // Le rendiamo opzionali perché il fetch minimo (login) non le seleziona
  // sempre; la pagina SuperAdmin le popola invece dal detail-fetch completo.
  dunning_status?: string | null;
  payment_failure_count?: number | null;
  stripe_subscription_status?: string | null;
  trial_extensions_count?: number | null;
  last_payment_failure_at?: string | null;
}

export interface AuthState {
  user: User | null;
  profile: Profile | null;
  role: AppRole | null;
  company: Company | null;
  isLoading: boolean;
}
