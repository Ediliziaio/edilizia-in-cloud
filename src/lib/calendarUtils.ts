import { CalendarClock, Search, Truck, Users, UserCheck, Ruler, HardHat, ClipboardCheck, Wrench, ShieldCheck, MapPin, Hammer, Flag, Video } from "lucide-react";
import type { CalendarOrder, CalendarAppointment } from "@/types/calendar";
import type { AppointmentData } from "@/components/appointments/AppointmentDialog";

export type CalendarEventColorKey =
  | "posa"
  | "lavoro"
  | "appuntamento"
  | "merce"
  | "intervento"
  | "manutenzione"
  | "leave"
  | "google_busy"
  | "weather";

export type CalendarEventColors = Record<CalendarEventColorKey, string>;

export const DEFAULT_CALENDAR_EVENT_COLORS: CalendarEventColors = {
  posa: "#3B82F6",
  lavoro: "#22C55E",
  appuntamento: "#6366F1",
  merce: "#F59E0B",
  intervento: "#E87722",
  manutenzione: "#3B82F6",
  leave: "#F59E0B",
  google_busy: "#9CA3AF",
  weather: "#0EA5E9",
};

export function normalizeCalendarEventColors(value: unknown): CalendarEventColors {
  if (!value || typeof value !== "object") return DEFAULT_CALENDAR_EVENT_COLORS;
  const raw = value as Partial<Record<CalendarEventColorKey, unknown>>;
  return Object.fromEntries(
    Object.entries(DEFAULT_CALENDAR_EVENT_COLORS).map(([key, fallback]) => {
      const next = raw[key as CalendarEventColorKey];
      return [key, typeof next === "string" && /^#[0-9a-f]{6}$/i.test(next) ? next : fallback];
    })
  ) as CalendarEventColors;
}

export function getCalendarEventStyle(color: string, opacity = "22") {
  return {
    backgroundColor: `${color}${opacity}`,
    borderLeftColor: color,
  };
}

/**
 * Un colore stabile PER COMMESSA (stile Google Calendar): con tutte le barre
 * dello stesso verde non si distingue quale striscia è quale cantiere. Hash
 * dell'id → tinta fissa: la stessa commessa ha lo stesso colore ovunque e
 * per sempre. Tinte scure a sufficienza per il testo bianco dei chip.
 */
/** Come colorare le barre lavoro: per tipo evento, per commessa o per squadra. */
export type CalendarColorMode = "tipo" | "commessa" | "squadra";

/** Quali avvisi pagamento mostrare sulle barre: tutti, solo i rossi, nessuno. */
export type CalendarAvvisiPagamento = "tutti" | "rossi" | "off";

export const ORDER_COLOR_PALETTE = [
  "#2563EB", // blu
  "#0D9488", // teal
  "#7C3AED", // viola
  "#DB2777", // magenta
  "#EA580C", // arancione
  "#16A34A", // verde
  "#0891B2", // ciano
  "#9333EA", // porpora
  "#B45309", // ambra scura
  "#DC2626", // rosso
  "#4F46E5", // indaco
  "#65A30D", // lime scuro
] as const;

export function orderColor(orderId: string): string {
  let h = 0;
  for (let i = 0; i < orderId.length; i++) h = (h * 31 + orderId.charCodeAt(i)) >>> 0;
  return ORDER_COLOR_PALETTE[h % ORDER_COLOR_PALETTE.length];
}

/** Rate cliente non incassate della commessa, aggregate per momento dovuto. */
export interface PagamentiScoperti {
  /** Acconti (type 'deposit') non pagati: dovevano entrare PRIMA dell'inizio. */
  acconto_eur: number;
  /** Saldi (type 'balance') non pagati. */
  saldo_eur: number;
}

export interface RischioPagamento {
  livello: "rosso" | "ambra";
  messaggio: string;
  importo_eur: number;
}

/**
 * "Sto iniziando un lavoro ma il cliente non ha ancora pagato" — la regola:
 * acconto scoperto = rosso sempre (l'acconto per definizione precede l'inizio);
 * saldo scoperto = ambra solo a lavori finiti (prima è fisiologico).
 */
export function rischioPagamenti(order: CalendarOrder, oggi = new Date()): RischioPagamento | null {
  const sc = order.pagamenti_scoperti;
  if (!sc) return null;
  if (sc.acconto_eur > 0) {
    const iniziato = !!order.work_start_date && order.work_start_date <= oggi.toLocaleDateString("en-CA");
    return {
      livello: "rosso",
      messaggio: iniziato ? "Lavoro avviato senza acconto incassato" : "Il lavoro parte ma l'acconto non è stato incassato",
      importo_eur: sc.acconto_eur,
    };
  }
  const finito = !!order.work_end_date && order.work_end_date < oggi.toLocaleDateString("en-CA");
  if (sc.saldo_eur > 0 && finito) {
    return { livello: "ambra", messaggio: "Lavori chiusi, saldo da incassare", importo_eur: sc.saldo_eur };
  }
  return null;
}

export function hasLogisticRisk(order: CalendarOrder): boolean {
  if (!order.expected_date) return false;
  if (!order.warehouse_arrival_date) return true;
  return order.warehouse_arrival_date > order.expected_date;
}

export function getEmployeeInitials(order: CalendarOrder): string {
  if (!order.order_employees || order.order_employees.length === 0) return "";
  return order.order_employees
    .map((ae) => `${ae.employee.first_name[0]}${ae.employee.last_name[0]}`)
    .join(", ");
}

export const WEEK_DAYS_IT = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"] as const;

export const APPOINTMENT_ICONS: Record<string, typeof CalendarClock> = {
  // Tipi esistenti
  sopralluogo: Search,
  consegna: Truck,
  riunione: Users,
  cliente: UserCheck,
  generico: CalendarClock,
  videocall: Video,
  // M16 — Nuovi tipi appuntamento tecnico
  sopralluogo_preventivo: MapPin,
  rilievo_tecnico: Ruler,
  misurazione: Ruler,
  verifica_cantiere: HardHat,
  inizio_lavori: Hammer,
  fine_lavori: Flag,
  conferma_ordine: ClipboardCheck,
  posa_prova: Wrench,
  collaudo: ClipboardCheck,
  assistenza: Wrench,
  manutenzione: Wrench,
  ispezione: ShieldCheck,
};

// M16 — Colori badge per tipo appuntamento
export const APPOINTMENT_COLORS: Record<string, string> = {
  // Acquisizione — blu
  sopralluogo_preventivo: "bg-blue-100 text-blue-800 border-blue-200",
  rilievo_tecnico:        "bg-blue-100 text-blue-800 border-blue-200",
  misurazione:            "bg-blue-100 text-blue-800 border-blue-200",
  conferma_ordine:        "bg-indigo-100 text-indigo-800 border-indigo-200",
  // Esecuzione — arancione
  verifica_cantiere:      "bg-orange-100 text-orange-800 border-orange-200",
  inizio_lavori:          "bg-orange-100 text-orange-800 border-orange-200",
  fine_lavori:            "bg-slate-100 text-slate-800 border-slate-200",
  posa_prova:             "bg-orange-100 text-orange-800 border-orange-200",
  consegna:               "bg-amber-100 text-amber-800 border-amber-200",
  collaudo:               "bg-green-100 text-green-800 border-green-200",
  // Post-vendita — viola/grigio
  assistenza:             "bg-purple-100 text-purple-800 border-purple-200",
  manutenzione:           "bg-orange-100 text-orange-800 border-orange-200",
  ispezione:              "bg-slate-100 text-slate-800 border-slate-200",
  // Generici
  sopralluogo:            "bg-teal-100 text-teal-800 border-teal-200",
  riunione:               "bg-gray-100 text-gray-800 border-gray-200",
  cliente:                "bg-pink-100 text-pink-800 border-pink-200",
  generico:               "bg-gray-100 text-gray-700 border-gray-200",
  videocall:              "bg-sky-100 text-sky-800 border-sky-200",
};

export function mapAppointmentToEditData(apt: CalendarAppointment): AppointmentData {
  return {
    id: apt.id,
    title: apt.title,
    description: apt.description,
    appointment_date: apt.appointment_date,
    appointment_time: apt.appointment_time,
    appointment_end_time: apt.appointment_end_time ?? null,
    appointment_type: apt.appointment_type,
    assigned_to: apt.assigned_to,
    order_id: apt.order_id,
    is_completed: apt.is_completed,
    status: apt.status || "confermato",
    reminder_minutes: apt.reminder_minutes ?? null,
    formatted_address: apt.formatted_address ?? null,
    address_line: apt.address_line ?? null,
    address_city: apt.address_city ?? null,
    address_postal_code: apt.address_postal_code ?? null,
    address_province: apt.address_province ?? null,
    address_country: apt.address_country ?? null,
    address_notes: apt.address_notes ?? null,
    place_id: apt.place_id ?? null,
    lat: apt.lat ?? null,
    lng: apt.lng ?? null,
  };
}
