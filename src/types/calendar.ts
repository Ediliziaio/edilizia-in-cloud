export interface CalendarResourceBooking {
  resourceId: string;
  resourceName: string;
  resourceType: "employee" | "team";
  start_date: string;
  end_date: string;
  start_time?: string | null;
  end_time?: string | null;
  phase_name?: string | null;
  phase_id?: string | null;
}

export interface CalendarWorkPhase {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
  position: number;
  notes?: string | null;
  percentuale?: number | null;
  completata_il?: string | null;
}

export interface CalendarWorkPeriod {
  id: string;
  phase_id?: string;
  name: string;
  start_date: string;
  end_date: string;
  start_time?: string | null;
  end_time?: string | null;
  status?: string;
  resources: CalendarResourceBooking[];
  phase_notes?: string | null;
  progress?: number | null;
  completed_date?: string | null;
}

export interface CalendarOrder {
  id: string;
  order_code: string | null;
  description: string;
  expected_date: string | null;
  work_start_date: string | null;
  work_end_date: string | null;
  /** Orari dei lavori (HH:MM:SS); null = tutto il giorno. */
  work_start_time?: string | null;
  work_end_time?: string | null;
  warehouse_arrival_date: string | null;
  created_at: string;
  customer_id: string;
  current_status_id: string | null;
  indirizzo_lavori?: string | null;
  work_address?: string | null;
  work_lat?: number | null;
  work_lng?: number | null;
  distanza_sede_km?: number | null;
  distanza_sede_minuti?: number | null;
  distanza_sede_il?: string | null;
  customer: {
    first_name: string;
    last_name: string;
  };
  status: {
    name: string;
    color: string;
  } | null;
  order_employees?: Array<{
    employee: {
      id: string;
      first_name: string;
      last_name: string;
    };
  }>;
  order_external_teams?: Array<{
    external_team: {
      id: string;
      name: string;
      color?: string | null;
    };
  }>;
  /** Assegnazioni effettive, con le date delle fasi/squadre; separate dai nomi unici. */
  resource_bookings?: CalendarResourceBooking[];
  work_phases?: CalendarWorkPhase[];
  planning_resource_filter?: { employeeIds: string[]; teamIds: string[] };
  /** Rate cliente non incassate (arricchito dal Calendar, non dal DB). */
  pagamenti_scoperti?: {
    acconto_eur: number;
    saldo_eur: number;
    /** Rate il cui evento è vicino ma non ancora arrivato: c'è ancora tempo per sollecitare. */
    preavviso_eur?: number;
    /** Frase già pronta, costruita dall'evento della rata più imminente. */
    preavviso_messaggio?: string;
  };
}

export type { OrderStatus } from "@/lib/orderUtils";

export interface CustomerFilter {
  id: string;
  first_name: string;
  last_name: string;
}

export type GanttZoom = "year" | "quarter" | "month";

export type CalendarViewType =
  | "month"
  | "week"
  | "day"
  | "gantt"
  | "heatmap"
  | "agenda"
  | "teams";
export type CalendarScope = "personal" | "team";

export interface GoogleBusySlot {
  id: string;
  start_at: string;
  end_at: string;
  summary: string | null;
  is_all_day: boolean;
  user_id: string;
  google_calendar_id: string | null;
  /** Id dell'evento Google: se corrisponde a un appuntamento CRM esportato,
   *  il calendario non lo ridisegna come impegno esterno (evita i doppioni). */
  google_event_id?: string | null;
  provider?: "google" | "apple" | "outlook";
  /** Se il calendario è di una squadra di posa: il suo nome e colore (arricchiti dal Calendar). */
  team_name?: string | null;
  team_color?: string | null;
}

export interface ApprovedLeave {
  id: string;
  employee_id: string;
  type: string;
  start_date: string;
  end_date: string;
  total_days: number | null;
  total_hours: number | null;
  employee: { id: string; first_name: string; last_name: string } | null;
}

export interface CalendarWarehouseInfo {
  orderId: string;
  orderCode: string | null;
  customerName: string;
  readyCount: number;
  pendingCount: number;
  items: Array<{ id: string; name: string; status: string }>;
}

export interface CalendarIntervento {
  id: string;
  subject: string;
  tipo: string;
  data_intervento_prevista: string | null;
  status: string;
  assigned_to: string | null;
  order_id?: string | null;
  indirizzo_intervento?: string | null;
  lat_intervento?: number | null;
  lng_intervento?: number | null;
  durata_ore?: number | null;
  note_tecnico?: string | null;
  assigned_profile?: { first_name: string; last_name: string } | null;
}

export interface CalendarManutenzione {
  impianto_id?: string | null;
  order_id?: string | null;
  impianto?: string;
  indirizzo?: string | null;
  lat?: number | null;
  lng?: number | null;
  frequenza_tipo?: string | null;
  ultima_esecuzione?: string | null;
  assigned_to?: string | null;
  assigned_profile?: { first_name: string; last_name: string } | null;
  id: string;
  titolo: string;
  prossima_scadenza: string | null;
  stato: string;
}

export interface CalendarAppointment {
  id: string;
  title: string;
  description: string | null;
  appointment_date: string;
  appointment_time: string | null;
  appointment_end_time?: string | null;
  appointment_type: string;
  assigned_to: string | null;
  order_id: string | null;
  calendar_id?: string | null;
  is_completed: boolean;
  company_id: string;
  created_by: string;
  assigned?: {
    first_name: string;
    last_name: string;
  } | null;
  order?: {
    order_code: string | null;
    description: string;
    customer?: {
      first_name: string;
      last_name: string;
    } | null;
  } | null;
  contact?: {
    first_name: string;
    last_name: string;
  } | null;
  status?: string;
  reminder_minutes?: number | null;
  meeting_provider?: string | null;
  meeting_url?: string | null;
  meeting_status?: string | null;
  meeting_created_at?: string | null;
  formatted_address?: string | null;
  address_line?: string | null;
  address_city?: string | null;
  address_postal_code?: string | null;
  address_province?: string | null;
  address_country?: string | null;
  address_notes?: string | null;
  place_id?: string | null;
  lat?: number | null;
  lng?: number | null;
  assigned_profile?: {
    first_name: string;
    last_name: string;
  } | null;
  /** Appuntamento commerciale di un collega mostrato come «Occupato» (appuntamentiRiservati.ts). */
  riservato?: boolean;
}
