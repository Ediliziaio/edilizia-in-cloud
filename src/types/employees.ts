export interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  gross_salary: number;
  net_salary: number;
  monthly_hours: number;
  is_active: boolean;
  user_id: string | null;
  role_type: string;
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
}
