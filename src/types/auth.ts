import type { User } from "@supabase/supabase-js";

export type AppRole = "super_admin" | "company_admin" | "company_staff" | "customer" | "employee";

export type CompanySector = 
  | "serramenti"
  | "infissi"
  | "bagni"
  | "tetti"
  | "fotovoltaico"
  | "pittura"
  | "ristrutturazioni"
  | "altro";

export type TicketStatus = "aperto" | "in_lavorazione" | "risolto";

export interface Profile {
  id: string;
  company_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  address: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
}

export interface Company {
  id: string;
  name: string;
  email: string;
  logo_url: string | null;
  sector: CompanySector;
  created_at: string;
  updated_at: string;
}

export interface AuthState {
  user: User | null;
  profile: Profile | null;
  role: AppRole | null;
  company: Company | null;
  isLoading: boolean;
}
