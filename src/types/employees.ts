export interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  gross_salary: number;
  net_salary: number;
  monthly_hours: number;
  /** €/h usato dal trigger rapportino approvato → costo commessa.
   *  Se assente si salva il costo calcolato dallo stipendio. */
  costo_orario?: number | null;
  is_active: boolean;
  user_id: string | null;
  role_type: string;
  area?: string | null;
}

export interface ExternalTeam {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  is_active: boolean;
  vat_rate: number;
  color?: string | null;
  kind?: "interna" | "esterna";
  subappaltatore_id?: string | null;
  leader_user_id?: string | null;
  google_connection_id?: string | null;
  google_calendar_id?: string | null;
  google_sync_enabled?: boolean;
  google_last_sync_at?: string | null;
  google_last_error?: string | null;
}
