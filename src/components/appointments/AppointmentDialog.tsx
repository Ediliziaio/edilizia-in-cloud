import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CalendarClock, CalendarDays, Check, CheckCircle2, ChevronsUpDown, Clock, LifeBuoy, Settings, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
import { useMembriMieSquadre } from "@/hooks/useMembriMieSquadre";
import { toast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePermissions } from "@/hooks/usePermissions";
import { useGoogleCalendarSync } from "@/hooks/useGoogleCalendarSync";
import AddressAutocomplete, { emptyAddress, type AddressData } from "@/components/shared/AddressAutocomplete";
import { EntityCustomFieldsSection } from "@/components/shared/EntityCustomFieldsSection";

export interface AppointmentData {
  id?: string;
  title: string;
  description: string | null;
  appointment_date: string;
  appointment_time: string | null;
  appointment_end_time?: string | null;
  appointment_type: string;
  assigned_to: string | null;
  order_id: string | null;
  is_completed: boolean;
  calendar_id?: string | null;
  contact_id?: string | null;
  status?: string;
  reminder_minutes?: number | null;
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
}

interface AppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment?: AppointmentData | null;
  initialData?: AppointmentData | null;
  onSaved: () => void;
  onDeleted?: () => void;
  defaultOrderId?: string;
  showOrderSelect?: boolean;
  defaultDate?: string;
  defaultTime?: string;
  defaultAppointmentType?: string;
  defaultTitle?: string;
  defaultAddress?: string | null;
  defaultCity?: string | null;
  defaultProvince?: string | null;
  defaultAssignedTo?: string | null;
  requireTime?: boolean;
  hideMarketingFields?: boolean;
}

interface WorkEmployeeRow {
  user_id: string | null;
  area: string | null;
  role_type: string | null;
}

interface OrderOperationalUserRow {
  user_id?: string | null;
  campo_user_id?: string | null;
}

interface AvailabilityAppointment {
  id: string;
  title: string;
  appointment_time: string | null;
  appointment_end_time?: string | null;
  status?: string | null;
}

type ReferenceType = "none" | "order" | "ticket" | "maintenance";

interface AppointmentTicketReference {
  id: string;
  subject: string;
  status: string | null;
  priority: string | null;
  tipo: string | null;
  order_id: string | null;
  assigned_to: string | null;
  data_intervento_prevista: string | null;
  indirizzo_intervento: string | null;
}

interface MaintenancePlanReference {
  id: string;
  titolo: string;
  prossima_scadenza: string | null;
  tecnico_preferito: string | null;
  frequenza_tipo: string | null;
}

interface AppointmentOrderReference {
  id: string;
  description: string | null;
  order_code: string | null;
  order_employees?: Array<{
    employee?: {
      id: string;
      first_name: string | null;
      last_name: string | null;
      user_id: string | null;
    } | null;
  }> | null;
  order_external_teams?: Array<{
    external_team?: {
      id: string;
      name: string | null;
    } | null;
  }> | null;
}

type AppointmentPayload = {
  company_id: string;
  title: string;
  description: string | null;
  appointment_date: string;
  appointment_time: string | null;
  appointment_end_time: string | null;
  appointment_type: string;
  assigned_to: string | null;
  order_id: string | null;
  calendar_id: string | null;
  contact_id: string | null;
  status: string;
  reminder_minutes: number | null;
  reminder_sent: boolean;
  formatted_address: string | null;
  address_line: string | null;
  address_city: string | null;
  address_postal_code: string | null;
  address_province: string | null;
  address_country: string | null;
  address_notes: string | null;
  place_id: string | null;
  lat: number | null;
  lng: number | null;
  created_by?: string;
};

// M16 — Tipi appuntamento con gruppi (acquisizione, esecuzione, post-vendita, altro)
const APPOINTMENT_TYPES = [
  // Acquisizione
  { value: "sopralluogo_preventivo", label: "Sopralluogo Preventivo",  group: "Acquisizione" },
  { value: "rilievo_tecnico",        label: "Rilievo Tecnico",          group: "Acquisizione" },
  { value: "misurazione",            label: "Misurazione",              group: "Acquisizione" },
  { value: "conferma_ordine",        label: "Conferma Ordine",          group: "Acquisizione" },
  // Esecuzione
  { value: "verifica_cantiere",      label: "Verifica Cantiere",        group: "Esecuzione" },
  { value: "inizio_lavori",          label: "Inizio Lavori",            group: "Esecuzione" },
  { value: "fine_lavori",            label: "Fine Lavori",              group: "Esecuzione" },
  { value: "posa_prova",             label: "Posa di Prova",            group: "Esecuzione" },
  { value: "consegna",               label: "Consegna",                 group: "Esecuzione" },
  { value: "collaudo",               label: "Collaudo",                 group: "Esecuzione" },
  // Post-vendita
  { value: "assistenza",             label: "Assistenza Post-Vendita",  group: "Post-Vendita" },
  { value: "manutenzione",           label: "Manutenzione",             group: "Post-Vendita" },
  { value: "ispezione",              label: "Ispezione Tecnica",        group: "Post-Vendita" },
  // Altro
  { value: "sopralluogo",            label: "Sopralluogo",              group: "Altro" },
  { value: "riunione",               label: "Riunione",                 group: "Altro" },
  { value: "cliente",                label: "Appuntamento Cliente",     group: "Altro" },
  { value: "generico",               label: "Generico",                 group: "Altro" },
];

// Tipi che mostrano la sezione Luogo (sopralluoghi e associazione ordini)
const SOPRALLUOGO_TYPES = new Set([
  'sopralluogo_preventivo', 'rilievo_tecnico', 'misurazione', 'verifica_cantiere',
  'inizio_lavori', 'fine_lavori', 'posa_prova', 'collaudo', 'consegna', 'assistenza', 'manutenzione', 'ispezione', 'sopralluogo',
]);

// Tipi che richiedono un tecnico assegnato
const REQUIRES_TECHNICIAN = new Set([
  "rilievo_tecnico", "misurazione", "verifica_cantiere",
  "conferma_ordine", "inizio_lavori", "fine_lavori", "posa_prova", "collaudo", "assistenza", "manutenzione", "ispezione",
]);

const APPOINTMENT_TYPE_GROUPS = ["Acquisizione", "Esecuzione", "Post-Vendita", "Altro"] as const;
const DEFAULT_DURATION_MINUTES = 60;
const APPOINTMENT_SLOT_MINUTES = 15;
const WORKING_SLOT_STARTS = Array.from({ length: ((18 - 8) * 60) / APPOINTMENT_SLOT_MINUTES + 1 }, (_, index) => {
  const totalMinutes = 8 * 60 + index * APPOINTMENT_SLOT_MINUTES;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
});

function toTimeValue(value?: string | null) {
  return value ? value.slice(0, 5) : "";
}

function timeToMinutes(value?: string | null) {
  if (!value) return null;
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function minutesToTime(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function addMinutesToTime(value: string, minutes: number) {
  const start = timeToMinutes(value);
  if (start == null) return "";
  return minutesToTime(start + minutes);
}

function getReferenceLabel(
  referenceType: ReferenceType,
  orderId: string,
  ticket?: AppointmentTicketReference,
  maintenancePlan?: MaintenancePlanReference,
) {
  if (referenceType === "order" && orderId && orderId !== "none") return "Commessa collegata";
  if (referenceType === "ticket" && ticket) return `Assistenza: ${ticket.subject}`;
  if (referenceType === "maintenance" && maintenancePlan) return `Manutenzione: ${maintenancePlan.titolo}`;
  return "";
}

function withReferenceNote(description: string, referenceLabel: string) {
  const cleaned = description
    .split("\n")
    .filter((line) => !line.trim().startsWith("[Riferimento]"))
    .join("\n")
    .trim();
  if (!referenceLabel) return cleaned;
  return [cleaned, `[Riferimento] ${referenceLabel}`].filter(Boolean).join("\n");
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Operazione non riuscita";
}

function getUserName(user: { first_name?: string | null; last_name?: string | null } | undefined) {
  return [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim() || "Senza nome";
}

function getOrderDateSyncPatch(appointmentType: string, appointmentDateValue: string) {
  if (appointmentType === "inizio_lavori") return { work_start_date: appointmentDateValue };
  if (appointmentType === "fine_lavori") return { work_end_date: appointmentDateValue };
  return null;
}

type SearchableOption = {
  value: string;
  label: string;
  description?: string;
  badge?: string;
};

function SearchableSelect({
  value,
  options,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  disabled,
  onChange,
}: {
  value: string;
  options: SearchableOption[];
  placeholder: string;
  searchPlaceholder: string;
  emptyLabel: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between gap-2 px-3 font-normal"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected?.label || placeholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(560px,calc(100vw-2rem))] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList className="max-h-72">
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={`${option.label} ${option.description ?? ""} ${option.badge ?? ""}`}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className="items-start gap-2"
                >
                  <Check className={cn("mt-0.5 h-4 w-4 shrink-0", option.value === value ? "opacity-100" : "opacity-0")} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{option.label}</span>
                      {option.badge && <Badge variant="outline" className="shrink-0 text-[10px]">{option.badge}</Badge>}
                    </div>
                    {option.description && <p className="truncate text-xs text-muted-foreground">{option.description}</p>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const CITY_TO_PROVINCE: Record<string, string> = {
  verona: "VR",
  milano: "MI",
  roma: "RM",
  torino: "TO",
  bologna: "BO",
  napoli: "NA",
  firenze: "FI",
  venezia: "VE",
  padova: "PD",
  vicenza: "VI",
  treviso: "TV",
  bergamo: "BG",
  brescia: "BS",
};

function inferAddressParts(formattedAddress?: string | null, city?: string | null, province?: string | null): AddressData {
  const formatted = formattedAddress?.trim() || "";
  const explicitCity = city?.trim() || "";
  const explicitProvince = province?.trim() || "";
  const postalAndCity = formatted.match(/\b\d{5}\s+([A-Za-zÀ-ÖØ-öø-ÿ' -]+)(?:\s+[A-Z]{2})?(?:,|$)/);
  const trailingCity = formatted.match(/,\s*([A-Za-zÀ-ÖØ-öø-ÿ' -]+)(?:\s+[A-Z]{2})?$/);
  const inferredCity = explicitCity || postalAndCity?.[1]?.trim() || trailingCity?.[1]?.trim() || "";
  const normalizedCity = inferredCity.toLowerCase();
  const inferredProvince = explicitProvince || CITY_TO_PROVINCE[normalizedCity] || "";

  return {
    ...emptyAddress,
    address_line: formatted,
    address_city: inferredCity,
    address_province: inferredProvince,
    formatted_address: formatted,
  };
}

export function AppointmentDialog({
  open,
  onOpenChange,
  appointment,
  initialData,
  onSaved,
  onDeleted,
  defaultOrderId,
  showOrderSelect = false,
  defaultDate,
  defaultTime,
  defaultAppointmentType = "generico",
  defaultTitle = "",
  defaultAddress,
  defaultCity,
  defaultProvince,
  defaultAssignedTo,
  requireTime = false,
  hideMarketingFields = false,
}: AppointmentDialogProps) {
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const currentAppointment = appointment ?? initialData ?? null;
  const isEditing = !!currentAppointment?.id;
  const { onlyAssigned, solaLettura } = usePermissions();
  // Con «Solo i propri» l'appuntamento è di chi lo crea; il responsabile di una
  // squadra (Impostazioni → Team) lo può dare anche ai membri, di cui vede e
  // lavora gli appuntamenti.
  const { data: membriSquadra = [] } = useMembriMieSquadre(open && onlyAssigned);
  // In sola lettura l'appuntamento si consulta: la policy RESTRICTIVE su
  // appointments rifiuterebbe comunque il salvataggio.
  const bloccoTitle = solaLettura ? "Sei in sola lettura" : undefined;
  // 2026-05-27: hasAnyCompanyGoogleConnection invece di isGoogleConnected
  // così l'admin (anche se lui non ha Google) può creare un appointment
  // per un posatore connesso. La edge function risolve il push verso il
  // Google del posatore via assigned_to.
  const { hasAnyCompanyGoogleConnection, pushEvent: gcalPush, updateEvent: gcalUpdate, deleteEvent: gcalDelete } = useGoogleCalendarSync();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [appointmentDate, setAppointmentDate] = useState<Date | undefined>();
  const [appointmentTime, setAppointmentTime] = useState("");
  const [appointmentEndTime, setAppointmentEndTime] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(String(DEFAULT_DURATION_MINUTES));
  const [appointmentType, setAppointmentType] = useState("generico");
  const [assignedTo, setAssignedTo] = useState("");
  const [orderId, setOrderId] = useState("");
  const [referenceType, setReferenceType] = useState<ReferenceType>("none");
  const [ticketId, setTicketId] = useState("");
  const [maintenancePlanId, setMaintenancePlanId] = useState("");
  const [calendarId, setCalendarId] = useState("");
  const [contactId, setContactId] = useState("");
  const [status, setStatus] = useState("confermato");
  const [reminderMinutes, setReminderMinutes] = useState<string>("none");
  const [addressData, setAddressData] = useState<AddressData>(emptyAddress);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (currentAppointment) {
      setTitle(currentAppointment.title);
      setDescription(currentAppointment.description || "");
      setAppointmentDate(currentAppointment.appointment_date ? new Date(currentAppointment.appointment_date) : undefined);
      setAppointmentTime(toTimeValue(currentAppointment.appointment_time));
      setAppointmentEndTime(toTimeValue(currentAppointment.appointment_end_time));
      const start = timeToMinutes(currentAppointment.appointment_time);
      const end = timeToMinutes(currentAppointment.appointment_end_time);
      setDurationMinutes(String(start != null && end != null && end > start ? end - start : DEFAULT_DURATION_MINUTES));
      setAppointmentType(currentAppointment.appointment_type);
      setAssignedTo(currentAppointment.assigned_to || "");
      setOrderId(currentAppointment.order_id || "");
      setReferenceType(currentAppointment.order_id ? "order" : "none");
      setTicketId("");
      setMaintenancePlanId("");
      setCalendarId(currentAppointment.calendar_id || "");
      setContactId(currentAppointment.contact_id || "");
      setStatus(currentAppointment.status || "confermato");
      setReminderMinutes(currentAppointment.reminder_minutes != null ? String(currentAppointment.reminder_minutes) : "none");
      setAddressData({
        ...emptyAddress,
        address_line: currentAppointment.address_line || currentAppointment.formatted_address || "",
        address_city: currentAppointment.address_city || "",
        address_postal_code: currentAppointment.address_postal_code || "",
        address_province: currentAppointment.address_province || "",
        address_country: currentAppointment.address_country || "IT",
        address_notes: currentAppointment.address_notes || "",
        formatted_address: currentAppointment.formatted_address || currentAppointment.address_line || "",
        lat: currentAppointment.lat ?? null,
        lng: currentAppointment.lng ?? null,
        place_id: currentAppointment.place_id || "",
      });
    } else {
      setTitle(defaultTitle);
      setDescription("");
      setAppointmentDate(defaultDate ? new Date(defaultDate) : undefined);
      setAppointmentTime(defaultTime || "");
      setAppointmentEndTime(defaultTime ? addMinutesToTime(defaultTime, DEFAULT_DURATION_MINUTES) : "");
      setDurationMinutes(String(DEFAULT_DURATION_MINUTES));
      setAppointmentType(defaultAppointmentType);
      setAssignedTo(defaultAssignedTo || (onlyAssigned && user?.id ? user.id : ""));
      setOrderId(defaultOrderId || "");
      setReferenceType(defaultOrderId ? "order" : "none");
      setTicketId("");
      setMaintenancePlanId("");
      setCalendarId("");
      setContactId("");
      setStatus("confermato");
      setReminderMinutes("none");
      setAddressData(inferAddressParts(defaultAddress, defaultCity, defaultProvince));
    }
  }, [
    currentAppointment,
    open,
    defaultOrderId,
    onlyAssigned,
    user?.id,
    defaultDate,
    defaultTime,
    defaultAppointmentType,
    defaultTitle,
    defaultAddress,
    defaultCity,
    defaultProvince,
    defaultAssignedTo,
  ]);

  // FIX: centralizzato via useCompanyStaffUsers (esclude customer/referrer)
  const { data: staffUsers = [] } = useCompanyStaffUsers(
    open ? companyId : null
  );

  const isOperationalAppointment = hideMarketingFields || !!defaultOrderId || !!orderId;

  const { data: workEmployeeUserIds = [] } = useQuery({
    queryKey: ["appointment-work-users", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("employees")
        .select("user_id, area, role_type")
        .eq("company_id", companyId)
        .not("user_id", "is", null);
      if (error) throw error;
      return ((data || []) as WorkEmployeeRow[])
        .filter((employee) => {
          const area = String(employee.area || "").toLowerCase();
          const roleType = String(employee.role_type || "").toLowerCase();
          if (area === "cantiere" || area === "tecnico") return true;
          if (area === "commerciale" || area === "amministrazione") return false;
          return roleType !== "staff_interno";
        })
        .map((employee) => employee.user_id)
        .filter((userId): userId is string => !!userId);
    },
    enabled: open && !!companyId && isOperationalAppointment,
    staleTime: 5 * 60 * 1000,
  });

  const { data: orderOperationalUserIds = [] } = useQuery({
    queryKey: ["appointment-order-operational-users", companyId, orderId],
    queryFn: async () => {
      if (!companyId || !orderId) return [];
      const [assignmentsRes, subappaltatoriRes] = await Promise.all([
        supabase
          .from("order_campo_assignments")
          .select("user_id, role_type")
          .eq("company_id", companyId)
          .eq("order_id", orderId),
        supabase
          .from("v_subappaltatori_dashboard")
          .select("campo_user_id")
          .eq("company_id", companyId)
          .eq("order_id", orderId)
          .not("campo_user_id", "is", null),
      ]);
      if (assignmentsRes.error) throw assignmentsRes.error;
      if (subappaltatoriRes.error) throw subappaltatoriRes.error;
      const ids = [
        ...((assignmentsRes.data || []) as OrderOperationalUserRow[]).map((row) => row.user_id),
        ...((subappaltatoriRes.data || []) as OrderOperationalUserRow[]).map((row) => row.campo_user_id),
      ];
      return Array.from(new Set(ids.filter((id): id is string => !!id)));
    },
    enabled: open && !!companyId && !!orderId && isOperationalAppointment,
    staleTime: 60 * 1000,
  });

  const assignableUsers = useMemo(() => {
    const allowed = new Set(workEmployeeUserIds);
    orderOperationalUserIds.forEach((id) => allowed.add(id));
    const perTipo = !isOperationalAppointment ? staffUsers : staffUsers.filter((u) => {
      if (allowed.has(u.id)) return true;
      const roles = u.roles || [];
      if (roles.includes("employee") || roles.includes("worker") || roles.includes("subcontractor")) return true;
      return roles.length === 0 && workEmployeeUserIds.length === 0 && orderOperationalUserIds.length === 0;
    });
    if (!onlyAssigned || membriSquadra.length === 0) return perTipo;
    const ammessi = new Set([user?.id, ...membriSquadra]);
    return perTipo.filter((u) => ammessi.has(u.id));
  }, [isOperationalAppointment, orderOperationalUserIds, staffUsers, workEmployeeUserIds, onlyAssigned, membriSquadra, user?.id]);

  const selectedDateStr = appointmentDate ? format(appointmentDate, "yyyy-MM-dd") : null;
  const { data: dayAppointments = [] } = useQuery<AvailabilityAppointment[]>({
    queryKey: ["appointments-availability", companyId, selectedDateStr, assignedTo, currentAppointment?.id],
    queryFn: async () => {
      if (!companyId || !selectedDateStr || !assignedTo || assignedTo === "none") return [];
      let query = supabase
        .from("appointments")
        .select("id, title, appointment_time, appointment_end_time, status")
        .eq("company_id", companyId)
        .eq("appointment_date", selectedDateStr)
        .eq("assigned_to", assignedTo)
        .neq("status", "annullato")
        .order("appointment_time", { ascending: true });
      if (currentAppointment?.id) query = query.neq("id", currentAppointment.id);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as AvailabilityAppointment[];
    },
    enabled: open && !!companyId && !!selectedDateStr && !!assignedTo && assignedTo !== "none",
    staleTime: 30 * 1000,
  });

  const availabilitySlots = useMemo(() => {
    const duration = Number(durationMinutes) || DEFAULT_DURATION_MINUTES;
    return WORKING_SLOT_STARTS.map((start) => {
      const startMin = timeToMinutes(start)!;
      const endMin = startMin + duration;
      const blocker = dayAppointments.find((apt) => {
        const aptStart = timeToMinutes(apt.appointment_time);
        if (aptStart == null) return false;
        const aptEnd = timeToMinutes(apt.appointment_end_time) ?? aptStart + DEFAULT_DURATION_MINUTES;
        return aptStart < endMin && aptEnd > startMin;
      });
      return {
        start,
        end: minutesToTime(endMin),
        available: !blocker,
        blocker,
      };
    });
  }, [dayAppointments, durationMinutes]);

  const { data: orders = [] } = useQuery({
    queryKey: ["appointment-orders", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("orders")
        .select(`
          id,
          description,
          order_code,
          order_employees(employee:employees(id, first_name, last_name, user_id)),
          order_external_teams(external_team:external_teams(id, name))
        `)
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as AppointmentOrderReference[];
    },
    enabled: open && !!companyId && showOrderSelect,
  });

  const { data: tickets = [] } = useQuery({
    queryKey: ["appointment-ticket-references", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("tickets")
        .select("id, subject, status, priority, tipo, order_id, assigned_to, data_intervento_prevista, indirizzo_intervento")
        .eq("company_id", companyId)
        .order("updated_at", { ascending: false })
        .limit(150);
      if (error) throw error;
      return (data || []) as AppointmentTicketReference[];
    },
    enabled: open && !!companyId && showOrderSelect,
    staleTime: 60 * 1000,
  });

  const { data: maintenancePlans = [] } = useQuery({
    queryKey: ["appointment-maintenance-references", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("piani_manutenzione")
        .select("id, titolo, prossima_scadenza, tecnico_preferito, frequenza_tipo")
        .eq("company_id", companyId)
        .eq("attivo", true)
        .order("prossima_scadenza", { ascending: true, nullsFirst: false })
        .limit(150);
      if (error) throw error;
      return (data || []) as MaintenancePlanReference[];
    },
    enabled: open && !!companyId && showOrderSelect,
    staleTime: 60 * 1000,
  });

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === ticketId),
    [ticketId, tickets],
  );

  const selectedMaintenancePlan = useMemo(
    () => maintenancePlans.find((plan) => plan.id === maintenancePlanId),
    [maintenancePlanId, maintenancePlans],
  );

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === orderId),
    [orderId, orders],
  );

  const selectedAssignee = useMemo(
    () => staffUsers.find((staffUser) => staffUser.id === assignedTo),
    [assignedTo, staffUsers],
  );

  const selectedOrderTeam = useMemo(() => {
    const internal = selectedOrder?.order_employees
      ?.map((assignment) => assignment.employee)
      .filter((employee): employee is NonNullable<typeof employee> => !!employee) ?? [];
    const external = selectedOrder?.order_external_teams
      ?.map((assignment) => assignment.external_team)
      .filter((team): team is NonNullable<typeof team> => !!team) ?? [];
    return { internal, external };
  }, [selectedOrder]);

  const assigneeTeamWarning = useMemo(() => {
    if (!selectedOrder || !assignedTo || assignedTo === "none") return null;
    const hasConfiguredTeam = selectedOrderTeam.internal.length > 0 || selectedOrderTeam.external.length > 0 || orderOperationalUserIds.length > 0;
    if (!hasConfiguredTeam) return null;
    const allowedUserIds = new Set([
      ...orderOperationalUserIds,
      ...selectedOrderTeam.internal.map((employee) => employee.user_id).filter((id): id is string => !!id),
    ]);
    if (allowedUserIds.has(assignedTo)) return null;
    const internalNames = selectedOrderTeam.internal.map((employee) => `${employee.first_name ?? ""} ${employee.last_name ?? ""}`.trim()).filter(Boolean);
    const externalNames = selectedOrderTeam.external.map((team) => team.name).filter(Boolean);
    const configuredNames = [...internalNames, ...externalNames].slice(0, 4).join(", ");
    return {
      assignee: getUserName(selectedAssignee),
      team: configuredNames || "squadra commessa",
    };
  }, [assignedTo, orderOperationalUserIds, selectedAssignee, selectedOrder, selectedOrderTeam]);

  const assigneeOptions = useMemo<SearchableOption[]>(() => [
    { value: "none", label: "Nessun assegnatario" },
    ...assignableUsers.map((user) => ({
      value: user.id,
      label: getUserName(user),
      description: user.roles?.join(", ") || undefined,
      badge: user.roles?.includes("subcontractor") ? "Subapp." : user.roles?.includes("employee") ? "Operaio" : undefined,
    })),
  ], [assignableUsers]);

  const orderOptions = useMemo<SearchableOption[]>(() => [
    { value: "none", label: "Nessuna commessa" },
    ...orders.map((order) => ({
      value: order.id,
      label: `${order.order_code ? `${order.order_code} - ` : ""}${order.description?.slice(0, 80) || "Senza descrizione"}`,
      description: [
        order.order_employees?.length ? `${order.order_employees.length} operai` : null,
        order.order_external_teams?.length ? `${order.order_external_teams.length} squadre esterne` : null,
      ].filter(Boolean).join(" · ") || undefined,
    })),
  ], [orders]);

  const ticketOptions = useMemo<SearchableOption[]>(() => [
    { value: "none", label: "Nessuna assistenza" },
    ...tickets.map((ticket) => ({
      value: ticket.id,
      label: ticket.subject,
      description: [ticket.tipo, ticket.priority].filter(Boolean).join(" · ") || undefined,
      badge: ticket.status || undefined,
    })),
  ], [tickets]);

  const maintenanceOptions = useMemo<SearchableOption[]>(() => [
    { value: "none", label: "Nessuna manutenzione" },
    ...maintenancePlans.map((plan) => ({
      value: plan.id,
      label: plan.titolo,
      description: plan.prossima_scadenza ? `Scadenza ${format(new Date(plan.prossima_scadenza), "dd/MM/yyyy")}` : undefined,
      badge: plan.frequenza_tipo || undefined,
    })),
  ], [maintenancePlans]);

  useEffect(() => {
    if (!open || referenceType !== "ticket" || !selectedTicket) return;
    if (selectedTicket.order_id) setOrderId(selectedTicket.order_id);
    if (selectedTicket.assigned_to && !assignedTo) setAssignedTo(selectedTicket.assigned_to);
    if (selectedTicket.indirizzo_intervento && !addressData.formatted_address) {
      setAddressData(inferAddressParts(selectedTicket.indirizzo_intervento));
    }
    if (!title.trim()) setTitle(`Assistenza · ${selectedTicket.subject}`);
    if (appointmentType === "generico") setAppointmentType("assistenza");
  }, [addressData.formatted_address, appointmentType, assignedTo, open, referenceType, selectedTicket, title]);

  useEffect(() => {
    if (!open || referenceType !== "maintenance" || !selectedMaintenancePlan) return;
    setOrderId("");
    if (selectedMaintenancePlan.tecnico_preferito && !assignedTo) {
      setAssignedTo(selectedMaintenancePlan.tecnico_preferito);
    }
    if (!title.trim()) setTitle(`Manutenzione · ${selectedMaintenancePlan.titolo}`);
    if (appointmentType === "generico" || appointmentType === "assistenza") {
      setAppointmentType("manutenzione");
    }
  }, [appointmentType, assignedTo, open, referenceType, selectedMaintenancePlan, title]);

  const { data: marketingCalendars = [] } = useQuery({
    queryKey: ["appointment-calendars", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from("marketing_calendars")
        .select("id, name")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
    enabled: open && !!companyId,
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ["appointment-contacts", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from("marketing_contacts")
        .select("id, first_name, last_name")
        .eq("company_id", companyId)
        .order("last_name")
        .limit(200);
      return data || [];
    },
    enabled: open && !!companyId,
  });

  const handleSave = async () => {
    if (!title.trim()) {
      toast({ title: "Inserisci un titolo", variant: "destructive" });
      return;
    }
    if (!appointmentDate) {
      toast({ title: "Inserisci una data", variant: "destructive" });
      return;
    }
    if (requireTime && !appointmentTime) {
      toast({ title: "Inserisci un orario", variant: "destructive" });
      return;
    }
    if (appointmentTime && appointmentEndTime) {
      const startMin = timeToMinutes(appointmentTime);
      const endMin = timeToMinutes(appointmentEndTime);
      if (startMin != null && endMin != null && endMin <= startMin) {
        toast({ title: "L'orario di fine deve essere successivo all'inizio", variant: "destructive" });
        return;
      }
    }
    if (!companyId || !user) return;

    setSaving(true);
    try {
      const effectiveOrderId = referenceType === "maintenance" ? "" : orderId;
      const referenceLabel = getReferenceLabel(referenceType, effectiveOrderId, selectedTicket, selectedMaintenancePlan);
      const finalDescription = withReferenceNote(description, referenceLabel);
      const appointmentDateValue = format(appointmentDate, "yyyy-MM-dd");
      const effectiveEndTime = appointmentEndTime || (appointmentTime ? addMinutesToTime(appointmentTime, Number(durationMinutes) || DEFAULT_DURATION_MINUTES) : null);

      const payload: AppointmentPayload = {
        company_id: companyId,
        title: title.trim(),
        description: finalDescription || null,
        appointment_date: appointmentDateValue,
        appointment_time: appointmentTime || null,
        appointment_end_time: effectiveEndTime,
        appointment_type: appointmentType,
        // Chi vede «Solo i propri» non può lasciare l'appuntamento senza
        // assegnatario: gli sparirebbe dalla vista appena salvato.
        assigned_to: assignedTo && assignedTo !== "none" ? assignedTo : (onlyAssigned ? (user?.id ?? null) : null),
        order_id: effectiveOrderId && effectiveOrderId !== "none" ? effectiveOrderId : null,
        calendar_id: hideMarketingFields ? null : (calendarId && calendarId !== "none" ? calendarId : null),
        contact_id: hideMarketingFields ? null : (contactId && contactId !== "none" ? contactId : null),
        status: status,
        reminder_minutes: reminderMinutes !== "none" ? parseInt(reminderMinutes) : null,
        reminder_sent: false,
        formatted_address: addressData.formatted_address.trim() || null,
        address_line: addressData.address_line.trim() || null,
        address_city: addressData.address_city.trim() || null,
        address_postal_code: addressData.address_postal_code.trim() || null,
        address_province: addressData.address_province.trim() || null,
        address_country: addressData.address_country.trim() || "IT",
        address_notes: addressData.address_notes.trim() || null,
        place_id: addressData.place_id.trim() || null,
        lat: addressData.lat ?? null,
        lng: addressData.lng ?? null,
      };

      if (isEditing && currentAppointment?.id) {
        const { error } = await supabase.from("appointments").update(payload).eq("id", currentAppointment.id);
        if (error) throw error;
        toast({ title: "Appuntamento aggiornato" });
        // Fire-and-forget Google sync
        if (hasAnyCompanyGoogleConnection) {
          gcalUpdate(currentAppointment.id).catch(() => {});
        }
      } else {
        payload.created_by = user.id;
        const { data: inserted, error } = await supabase.from("appointments").insert(payload).select("id").single();
        if (error) throw error;
        toast({ title: "Appuntamento creato" });
        // Diary log (fire-and-forget, solo se collegato a un ordine)
        if (payload.order_id) {
          void supabase.from("order_events" as never).insert({
            order_id: payload.order_id,
            company_id: companyId,
            event_type: "appuntamento_creato",
            actor_id: user.id,
            actor_name: user.email || "Utente",
            payload: {
              title: payload.title,
              date: payload.appointment_date,
              time: payload.appointment_time,
              type: payload.appointment_type,
            },
          } as never);
        }
        // Fire-and-forget Google sync
        if (hasAnyCompanyGoogleConnection && inserted?.id) {
          gcalPush(inserted.id).catch(() => {});
        }
      }

      if (referenceType === "ticket" && ticketId) {
        const scheduledAt = `${appointmentDateValue}T${appointmentTime || "09:00"}:00`;
        const duration = appointmentTime && effectiveEndTime
          ? Math.max((timeToMinutes(effectiveEndTime) ?? 0) - (timeToMinutes(appointmentTime) ?? 0), 0) / 60
          : null;
        const ticketUpdate = {
          data_intervento_prevista: scheduledAt,
          assigned_to: payload.assigned_to,
          durata_ore: duration,
          ...(payload.formatted_address ? { indirizzo_intervento: payload.formatted_address } : {}),
          ...(payload.lat != null ? { lat_intervento: payload.lat } : {}),
          ...(payload.lng != null ? { lng_intervento: payload.lng } : {}),
        };
        const { error: ticketError } = await supabase
          .from("tickets")
          .update(ticketUpdate)
          .eq("id", ticketId)
          .eq("company_id", companyId);
        if (ticketError) throw ticketError;
      }

      if (payload.order_id) {
        const orderDatePatch = getOrderDateSyncPatch(payload.appointment_type, appointmentDateValue);
        if (orderDatePatch) {
          const { error: orderSyncError } = await supabase
            .from("orders")
            .update(orderDatePatch)
            .eq("id", payload.order_id)
            .eq("company_id", companyId);
          if (orderSyncError) throw orderSyncError;
          queryClient.invalidateQueries({ queryKey: ["order", payload.order_id] });
          queryClient.invalidateQueries({ queryKey: ["orders"] });
          queryClient.invalidateQueries({ queryKey: ["calendar-orders"] });
        }
      }

      onSaved();
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket"] });
      queryClient.invalidateQueries({ queryKey: ["maintenance"] });
      queryClient.invalidateQueries({ queryKey: ["appointment-ticket-references"] });
      queryClient.invalidateQueries({ queryKey: ["appointment-maintenance-references"] });
      onOpenChange(false);
    } catch (e: unknown) {
      toast({ title: "Errore", description: getErrorMessage(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!currentAppointment?.id) return;
    setSaving(true);
    try {
      // Fire-and-forget Google delete before CRM delete
      if (hasAnyCompanyGoogleConnection) {
        gcalDelete(currentAppointment.id).catch(() => {});
      }
      const { error } = await supabase.from("appointments").delete().eq("id", currentAppointment.id);
      if (error) throw error;
      toast({ title: "Appuntamento eliminato" });
      if (onDeleted) onDeleted();
      else onSaved();
      onOpenChange(false);
    } catch (e: unknown) {
      toast({ title: "Errore", description: getErrorMessage(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Modifica Appuntamento" : "Nuovo Appuntamento"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Modifica i dettagli dell'appuntamento" : "Compila i campi per creare un nuovo appuntamento"}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="apt-title">Titolo *</Label>
            <Input id="apt-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Es. Sopralluogo tecnico" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={appointmentType} onValueChange={setAppointmentType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {APPOINTMENT_TYPE_GROUPS.map(group => {
                    const groupTypes = APPOINTMENT_TYPES.filter(t => t.group === group);
                    return (
                      <SelectGroup key={group}>
                        <SelectLabel className="text-xs text-muted-foreground">{group.toUpperCase()}</SelectLabel>
                        {groupTypes.map(t => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectGroup>
                    );
                  })}
                </SelectContent>
              </Select>
              {REQUIRES_TECHNICIAN.has(appointmentType) && !assignedTo && (
                <p className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Questo tipo richiede un tecnico assegnato
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Data *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !appointmentDate && "text-muted-foreground")}>
                    <CalendarDays className="mr-2 h-4 w-4" />
                    {appointmentDate ? format(appointmentDate, "dd/MM/yyyy") : "Seleziona data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={appointmentDate} onSelect={setAppointmentDate} locale={it} />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="rounded-lg border bg-slate-50/70 p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <Label className="text-sm font-semibold">Orario appuntamento</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Imposta inizio e fine nello stesso punto; la durata resta sincronizzata.
                </p>
              </div>
              {appointmentTime && appointmentEndTime && (
                <Badge variant="outline" className="shrink-0">
                  {appointmentTime} - {appointmentEndTime}
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_140px]">
              <div className="space-y-2">
                <Label htmlFor="apt-time">{requireTime ? "Ora inizio *" : "Ora inizio"}</Label>
                <Input
                  id="apt-time"
                  type="time"
                  step={APPOINTMENT_SLOT_MINUTES * 60}
                  value={appointmentTime}
                  onChange={(e) => {
                    const value = e.target.value;
                    setAppointmentTime(value);
                    setAppointmentEndTime(value ? addMinutesToTime(value, Number(durationMinutes) || DEFAULT_DURATION_MINUTES) : "");
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="apt-end-time">Ora fine</Label>
                <Input
                  id="apt-end-time"
                  type="time"
                  step={APPOINTMENT_SLOT_MINUTES * 60}
                  value={appointmentEndTime}
                  onChange={(e) => setAppointmentEndTime(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Durata</Label>
                <Select
                  value={durationMinutes}
                  onValueChange={(value) => {
                    setDurationMinutes(value);
                    if (appointmentTime) setAppointmentEndTime(addMinutesToTime(appointmentTime, Number(value)));
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 minuti</SelectItem>
                    <SelectItem value="60">1 ora</SelectItem>
                    <SelectItem value="90">1 ora e 30</SelectItem>
                    <SelectItem value="120">2 ore</SelectItem>
                    <SelectItem value="180">3 ore</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Assegna a</Label>
            <SearchableSelect
              value={assignedTo || "none"}
              options={assigneeOptions}
              placeholder="Nessun assegnatario"
              searchPlaceholder="Cerca operaio, tecnico o subappaltatore..."
              emptyLabel="Nessun assegnatario trovato"
              disabled={onlyAssigned && membriSquadra.length === 0}
              onChange={(value) => setAssignedTo(value === "none" ? "" : value)}
            />
          </div>

          {selectedDateStr && assignedTo && assignedTo !== "none" && (
            <div className="rounded-md border bg-slate-50/70 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium flex items-center gap-1.5">
                    <CalendarClock className="h-4 w-4 text-blue-600" />
                    Disponibilità tecnico
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Seleziona uno slot libero: verranno compilati ora e fine prevista.
                  </p>
                </div>
                <Badge variant="outline">{availabilitySlots.filter((slot) => slot.available).length} liberi</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {availabilitySlots.map((slot) => {
                  const active = appointmentTime === slot.start;
                  return (
                    <Button
                      key={slot.start}
                      type="button"
                      variant={active ? "default" : "outline"}
                      size="sm"
                      disabled={!slot.available}
                      className={cn("justify-start gap-1.5", slot.available ? "bg-white" : "opacity-60")}
                      title={slot.blocker ? `Occupato: ${slot.blocker.title}` : `Libero ${slot.start}-${slot.end}`}
                      onClick={() => {
                        setAppointmentTime(slot.start);
                        setAppointmentEndTime(slot.end);
                      }}
                    >
                      {slot.available ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Clock className="h-3.5 w-3.5 text-amber-600" />}
                      <span>{slot.start}</span>
                    </Button>
                  );
                })}
              </div>
            </div>
          )}

          {showOrderSelect && (
            <div className="rounded-lg border bg-slate-50/70 p-3">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <Label>Riferimento operativo</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Collega l'appuntamento a commessa, assistenza o manutenzione: calendario e schede operative restano allineati.
                  </p>
                </div>
                {referenceType === "ticket" && <LifeBuoy className="mt-0.5 h-4 w-4 text-purple-600" />}
                {referenceType === "maintenance" && <Settings className="mt-0.5 h-4 w-4 text-orange-600" />}
              </div>

              <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
                <div className="space-y-2">
                  <Label>Tipo riferimento</Label>
                  <Select
                    value={referenceType}
                    onValueChange={(value) => {
                      const next = value as ReferenceType;
                      setReferenceType(next);
                      if (next !== "order") setOrderId("");
                      if (next !== "ticket") setTicketId("");
                      if (next !== "maintenance") setMaintenancePlanId("");
                      if (next === "ticket" && appointmentType === "generico") setAppointmentType("assistenza");
                      if (next === "maintenance") setAppointmentType("manutenzione");
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nessun riferimento</SelectItem>
                      <SelectItem value="order">Commessa</SelectItem>
                      <SelectItem value="ticket">Assistenza</SelectItem>
                      <SelectItem value="maintenance">Manutenzione</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {referenceType === "order" && (
                  <div className="space-y-2">
                    <Label>Commessa collegata</Label>
                    <SearchableSelect
                      value={orderId || "none"}
                      options={orderOptions}
                      placeholder="Nessuna commessa"
                      searchPlaceholder="Cerca codice, cliente o descrizione..."
                      emptyLabel="Nessuna commessa trovata"
                      onChange={(value) => setOrderId(value === "none" ? "" : value)}
                    />
                  </div>
                )}

                {referenceType === "ticket" && (
                  <div className="space-y-2">
                    <Label>Assistenza collegata</Label>
                    <SearchableSelect
                      value={ticketId || "none"}
                      options={ticketOptions}
                      placeholder="Nessuna assistenza"
                      searchPlaceholder="Cerca assistenza, stato o priorità..."
                      emptyLabel="Nessuna assistenza trovata"
                      onChange={(value) => setTicketId(value === "none" ? "" : value)}
                    />
                    {selectedTicket?.order_id && (
                      <p className="text-xs text-muted-foreground">La commessa del ticket viene collegata automaticamente.</p>
                    )}
                  </div>
                )}

                {referenceType === "maintenance" && (
                  <div className="space-y-2">
                    <Label>Manutenzione collegata</Label>
                    <SearchableSelect
                      value={maintenancePlanId || "none"}
                      options={maintenanceOptions}
                      placeholder="Nessuna manutenzione"
                      searchPlaceholder="Cerca manutenzione o scadenza..."
                      emptyLabel="Nessuna manutenzione trovata"
                      onChange={(value) => setMaintenancePlanId(value === "none" ? "" : value)}
                    />
                  </div>
                )}
              </div>

              {assigneeTeamWarning && (
                <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  <div className="flex gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p className="font-medium">Assegnatario diverso dalla squadra commessa</p>
                      <p className="text-xs">
                        Hai selezionato {assigneeTeamWarning.assignee}, ma nella commessa risultano {assigneeTeamWarning.team}.
                        Verifica se vuoi aggiornare la squadra della commessa o cambiare assegnatario.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {SOPRALLUOGO_TYPES.has(appointmentType) && (
            <AddressAutocomplete value={addressData} onChange={setAddressData} />
          )}

          <div className={hideMarketingFields ? "" : "grid grid-cols-2 gap-4"}>
            {!hideMarketingFields && (
              <div className="space-y-2">
                <Label>Calendario</Label>
                <Select value={calendarId} onValueChange={setCalendarId}>
                  <SelectTrigger><SelectValue placeholder="Nessun calendario" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nessuno</SelectItem>
                    {marketingCalendars.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Stato</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="confermato">Confermato</SelectItem>
                  <SelectItem value="annullato">Annullato</SelectItem>
                  <SelectItem value="riprogrammato">Riprogrammato</SelectItem>
                  <SelectItem value="completato">Completato</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Promemoria</Label>
            <Select value={reminderMinutes} onValueChange={setReminderMinutes}>
              <SelectTrigger><SelectValue placeholder="Nessun promemoria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nessuno</SelectItem>
                <SelectItem value="60">1 ora prima</SelectItem>
                <SelectItem value="120">2 ore prima</SelectItem>
                <SelectItem value="1440">24 ore prima</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {!hideMarketingFields && (
            <div className="space-y-2">
              <Label>Contatto CRM</Label>
              <Select value={contactId} onValueChange={setContactId}>
                <SelectTrigger><SelectValue placeholder="Nessun contatto" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nessuno</SelectItem>
                  {contacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.first_name} {c.last_name || ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="apt-desc">Note</Label>
            <Textarea id="apt-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Dettagli aggiuntivi..." rows={3} />
          </div>

          {/* v8.6.113 — Custom fields appuntamento. */}
          {isEditing && appointment?.id && (
            <div className="pt-3 border-t">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Campi personalizzati
              </p>
              <EntityCustomFieldsSection entityType="appointment" entityId={appointment.id} />
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {isEditing && (
            <Button variant="destructive" onClick={handleDelete} disabled={saving || solaLettura} title={bloccoTitle} className="sm:mr-auto">
              <Trash2 className="h-4 w-4 mr-2" />
              Elimina
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Annulla
          </Button>
          <Button onClick={handleSave} disabled={saving || solaLettura} title={bloccoTitle}>
            {saving ? "Salvataggio..." : isEditing ? "Salva modifiche" : "Crea appuntamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
