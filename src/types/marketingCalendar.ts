export interface MarketingAppointment {
  id: string;
  title: string;
  appointment_date: string;
  appointment_time: string | null;
  appointment_end_time?: string | null;
  appointment_type: string;
  status: string;
  calendar_id: string | null;
  assigned_to: string | null;
  contact_id: string | null;
  description: string | null;
  is_completed: boolean;
  is_blocked_slot?: boolean;
  lat?: number | null;
  lng?: number | null;
  formatted_address?: string | null;
  internal_notes?: string | null;
  // Enriched fields
  calendar_name?: string | null;
  assigned_name?: string | null;
  contact_name?: string | null;
}

export interface TravelLeg {
  duration_s: number;
  distance_m: number;
  duration_text: string;
  distance_text: string;
  fromId: string;
  toId: string;
  isLate?: boolean;
  delayMinutes?: number;
}
