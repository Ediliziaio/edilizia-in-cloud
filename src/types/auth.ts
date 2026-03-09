import type { User } from "@supabase/supabase-js";

export type AppRole = "super_admin" | "company_admin" | "company_staff" | "customer" | "employee" | "salesperson" | "call_center" | "referrer";

export type CompanySector = 
  | "serramenti"
  | "infissi"
  | "bagni"
  | "tetti"
  | "fotovoltaico"
  | "pittura"
  | "ristrutturazioni"
  | "altro";

export type CompanyStatus = "trial" | "active" | "suspended" | "expired";

export interface Profile {
  id: string;
  company_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
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
}

export interface AuthState {
  user: User | null;
  profile: Profile | null;
  role: AppRole | null;
  company: Company | null;
  isLoading: boolean;
}
