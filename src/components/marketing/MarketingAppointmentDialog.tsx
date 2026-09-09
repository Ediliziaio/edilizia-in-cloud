import { useState, useEffect, useMemo, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription as AlertDialogDesc, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle as AlertDialogTitleComp } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CalendarDays, Trash2, Plus, Clock, Ban, Car, Loader2, ChevronsUpDown, Check, AlertCircle, Sparkles, ListChecks, Video, ExternalLink, Copy } from "lucide-react";
import { addDays, format } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AddressAutocomplete, { type AddressData, emptyAddress } from "@/components/shared/AddressAutocomplete";
import AddressMapPreview from "@/components/shared/AddressMapPreview";
import CalendarSuggestions, { type CalendarSuggestion } from "./CalendarSuggestions";
import { useGoogleCalendarSync } from "@/hooks/useGoogleCalendarSync";
import { useAppleCalendarSync } from "@/hooks/useAppleCalendarSync";
import { queryKeys } from "@/lib/queryKeys";
import {
  MARKETING_APPOINTMENT_STATUS_OPTIONS,
  getMarketingAppointmentStatusMeta,
  getMarketingFollowUpSuggestion,
} from "@/lib/marketingAppointmentStatus";

interface CalendarOption {
  id: string;
  name: string;
  base_lat?: number | null;
  base_lng?: number | null;
  base_formatted_address?: string | null;
  duration_minutes?: number | null;
  default_meeting_provider?: "none" | "google_meet" | null;
  default_meeting_enabled?: boolean | null;
}

interface UserOption {
  id: string;
  first_name: string;
  last_name: string;
}

export interface MarketingAppointmentData {
  id?: string;
  title: string;
  description: string | null;
  appointment_date: string;
  appointment_time: string | null;
  appointment_end_time?: string | null;
  appointment_type: string;
  assigned_to: string | null;
  calendar_id: string | null;
  contact_id: string | null;
  status: string;
  is_completed: boolean;
  is_blocked_slot?: boolean;
  internal_notes?: string | null;
  // Address fields
  address_line?: string | null;
  address_city?: string | null;
  address_postal_code?: string | null;
  address_province?: string | null;
  address_country?: string | null;
  address_notes?: string | null;
  formatted_address?: string | null;
  lat?: number | null;
  lng?: number | null;
  place_id?: string | null;
  meeting_provider?: string | null;
  meeting_url?: string | null;
  meeting_status?: string | null;
  meeting_created_at?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment?: MarketingAppointmentData | null;
  onSaved: () => void;
  calendars: CalendarOption[];
  users: UserOption[];
  defaultDate?: string;
  defaultTime?: string;
  defaultContactId?: string;
  /**
   * Titolo precompilato per le nuove prenotazioni (ignorato in modifica).
   * Usato dal flusso Outreach "Prenota demo" per proporre es.
   * "Demo EdiliziaInCloud — {contatto}" senza duplicare la dialog.
   */
  defaultTitle?: string;
}

import { addMinutesToTimeStr as addMinutesToTime, timeToMin } from "@/lib/marketingCalendarConstants";

const formatEuro = (value: number | null | undefined) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }).format(value || 0);

export default function MarketingAppointmentDialog({
  open,
  onOpenChange,
  appointment,
  onSaved,
  calendars,
  users,
  defaultDate,
  defaultTime,
  defaultContactId,
  defaultTitle,
}: Props) {
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const isEditing = !!appointment?.id;
  const googleSync = useGoogleCalendarSync();
  const appleSync = useAppleCalendarSync();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"appointment" | "blocked">("appointment");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [calendarId, setCalendarId] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [contactId, setContactId] = useState("");
  const [appointmentDate, setAppointmentDate] = useState<Date | undefined>();
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("09:30");
  const [status, setStatus] = useState("confermato");
  const [internalNotes, setInternalNotes] = useState("");
  const [showInternalNotes, setShowInternalNotes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [addressData, setAddressData] = useState<AddressData>(emptyAddress);
  const [meetingProvider, setMeetingProvider] = useState<"none" | "google_meet">("none");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [meetingStatus, setMeetingStatus] = useState<"none" | "pending" | "ready" | "error">("none");
  const [createFollowUp, setCreateFollowUp] = useState(false);
  const [followUpTitle, setFollowUpTitle] = useState("");
  const [followUpDueDate, setFollowUpDueDate] = useState("");
  const [followUpPriority, setFollowUpPriority] = useState<"bassa" | "normale" | "alta">("normale");

  // Auto-select single calendar
  const defaultCalendarId = useMemo(() => {
    if (calendars.length === 1) return calendars[0].id;
    return "";
  }, [calendars]);

  // Selected calendar object
  const selectedCalendar = useMemo(() => {
    return calendars.find((c) => c.id === calendarId) || null;
  }, [calendars, calendarId]);

  const timeError = useMemo(() => {
    if (!startTime || !endTime) return "Inserisci ora di inizio e ora di fine.";
    if (timeToMin(endTime) <= timeToMin(startTime)) return "L'ora di fine deve essere successiva all'ora di inizio.";
    return "";
  }, [endTime, startTime]);

  useEffect(() => {
    if (!open) return;
    if (appointment) {
      setActiveTab(appointment.is_blocked_slot ? "blocked" : "appointment");
      setTitle(appointment.title);
      setDescription(appointment.description || "");
      setAppointmentDate(appointment.appointment_date ? new Date(appointment.appointment_date) : undefined);
      setStartTime(appointment.appointment_time?.slice(0, 5) || "09:00");
      setEndTime(appointment.appointment_end_time?.slice(0, 5) || addMinutesToTime(appointment.appointment_time?.slice(0, 5) || "09:00", 30));
      setCalendarId(appointment.calendar_id || defaultCalendarId);
      setAssignedTo(appointment.assigned_to || "");
      setContactId(appointment.contact_id || "");
      setStatus(appointment.status || "confermato");
      setInternalNotes(appointment.internal_notes || "");
      setShowInternalNotes(!!appointment.internal_notes);
      setMeetingProvider(appointment.meeting_provider === "google_meet" || appointment.appointment_type === "videocall" ? "google_meet" : "none");
      setMeetingUrl(appointment.meeting_url || "");
      setMeetingStatus((appointment.meeting_status as "none" | "pending" | "ready" | "error") || (appointment.meeting_url ? "ready" : "none"));
      setCreateFollowUp(false);
      setFollowUpTitle("");
      setFollowUpDueDate("");
      setFollowUpPriority("normale");
      setAddressData({
        address_line: appointment.address_line || "",
        address_city: appointment.address_city || "",
        address_postal_code: appointment.address_postal_code || "",
        address_province: appointment.address_province || "",
        address_country: appointment.address_country || "IT",
        address_notes: appointment.address_notes || "",
        formatted_address: appointment.formatted_address || "",
        lat: appointment.lat ?? null,
        lng: appointment.lng ?? null,
        place_id: appointment.place_id || "",
      });
    } else {
      setActiveTab("appointment");
      setTitle(defaultTitle || "");
      setDescription("");
      const st = defaultTime || "09:00";
      setStartTime(st);
      setEndTime(addMinutesToTime(st, 30));
      setAppointmentDate(defaultDate ? new Date(defaultDate) : new Date());
      setCalendarId(defaultCalendarId);
      setAssignedTo("");
      setContactId(defaultContactId || "");
      setStatus("confermato");
      setInternalNotes("");
      setShowInternalNotes(false);
      setMeetingProvider("none");
      setMeetingUrl("");
      setMeetingStatus("none");
      setCreateFollowUp(false);
      setFollowUpTitle("");
      setFollowUpDueDate("");
      setFollowUpPriority("normale");
      setAddressData(emptyAddress);
    }
  }, [appointment, open, defaultDate, defaultTime, defaultCalendarId, defaultContactId, defaultTitle]);

  useEffect(() => {
    if (!open || isEditing || activeTab === "blocked" || !selectedCalendar) return;
    const nextProvider = selectedCalendar.default_meeting_provider === "google_meet" ? "google_meet" : "none";
    setMeetingProvider(nextProvider);
    setMeetingStatus(nextProvider === "google_meet" ? "pending" : "none");
    setMeetingUrl("");
  }, [activeTab, isEditing, open, selectedCalendar]);

  // Update end time when calendar/duration changes for new appointments.
  useEffect(() => {
    if (!isEditing && calendarId && calendarId !== "none" && startTime) {
      const cal = calendars.find((c) => c.id === calendarId);
      if (cal?.duration_minutes && startTime) {
        setEndTime(addMinutesToTime(startTime, cal.duration_minutes));
      }
    }
  }, [calendarId, calendars, isEditing, startTime]);

  // Contacts search
  const { data: contacts = [] } = useQuery({
    queryKey: ["mkt-apt-contacts", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from("marketing_contacts")
        .select("id, first_name, last_name, email, phone, source, attr_source, attr_medium, attr_campaign, ai_score, ai_score_tier, ai_predicted_value_eur, ai_next_action, lead_score, score, preferred_channel, stato, tags")
        .eq("company_id", companyId)
        .order("last_name")
        .limit(10000);
      return data || [];
    },
    enabled: open && !!companyId,
  });

  const selectedContact = useMemo(() => {
    return contacts.find((c) => c.id === contactId) || null;
  }, [contacts, contactId]);

  const { data: contactOpportunities = [] } = useQuery({
    queryKey: ["mkt-apt-contact-opportunities", companyId, contactId],
    queryFn: async () => {
      if (!companyId || !contactId || contactId === "none") return [];
      const { data, error } = await supabase
        .from("marketing_opportunities")
        .select("id, name, status, value, probability, next_action, next_action_date, expected_close_date, source, updated_at")
        .eq("company_id", companyId)
        .eq("contact_id", contactId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(3);
      if (error) return [];
      return data || [];
    },
    enabled: open && !!companyId && !!contactId && contactId !== "none",
    staleTime: 60 * 1000,
  });

  const selectedOpportunity = useMemo(() => contactOpportunities[0] || null, [contactOpportunities]);
  const selectedStatusMeta = useMemo(() => getMarketingAppointmentStatusMeta(status), [status]);
  const meetingStatusLabel = useMemo(() => {
    if (meetingProvider !== "google_meet") return "Nessuna videocall";
    if (meetingUrl) return "Link Meet pronto";
    if (meetingStatus === "error") return "Meet da rigenerare";
    return "Meet in attesa di sync";
  }, [meetingProvider, meetingStatus, meetingUrl]);

  const copyMeetingUrl = useCallback(async () => {
    if (!meetingUrl) return;
    try {
      await navigator.clipboard.writeText(meetingUrl);
      toast({ title: "Link Meet copiato" });
    } catch {
      toast({ title: "Copia non riuscita", description: "Apri il link e copialo manualmente.", variant: "destructive" });
    }
  }, [meetingUrl]);

  // Distance from calendar base
  const { data: baseDistance } = useQuery({
    queryKey: ["mkt-apt-base-distance", calendarId, addressData.lat, addressData.lng],
    queryFn: async () => {
      if (!selectedCalendar?.base_lat || !selectedCalendar?.base_lng || !addressData.lat || !addressData.lng) return null;
      try {
        const { data, error } = await supabase.functions.invoke("maps-proxy", {
          body: {
            action: "directions",
            waypoints: [
              { lat: selectedCalendar.base_lat, lng: selectedCalendar.base_lng },
              { lat: addressData.lat, lng: addressData.lng },
            ],
          },
        });
        if (error || !data?.legs?.[0]) return null;
        return { duration_text: data.legs[0].duration_text, distance_text: data.legs[0].distance_text };
      } catch {
        return null;
      }
    },
    enabled: open && !!selectedCalendar?.base_lat && !!addressData.lat,
    staleTime: 5 * 60 * 1000,
  });

  // Same-day appointments
  const dateStr = appointmentDate ? format(appointmentDate, "yyyy-MM-dd") : null;
  const { data: sameDayAppointments = [] } = useQuery({
    queryKey: ["mkt-apt-same-day", companyId, calendarId, dateStr],
    queryFn: async () => {
      if (!companyId || !calendarId || !dateStr) return [];
      const { data, error } = await supabase
        .from("appointments")
        .select("id, title, appointment_time, formatted_address, lat, lng")
        .eq("company_id", companyId)
        .eq("calendar_id", calendarId)
        .eq("appointment_date", dateStr)
        .neq("status", "annullato");
      if (error) return [];
      return (data || []).filter((a) => a.id !== appointment?.id);
    },
    enabled: open && !!companyId && !!calendarId && !!dateStr,
    staleTime: 5 * 60 * 1000,
  });

  // Inter-appointment distances (current → each same-day appointment)
  const geocodedSameDay = useMemo(
    () => sameDayAppointments.filter((a) => a.lat != null && a.lng != null),
    [sameDayAppointments]
  );

  // QueryKey stabile: `geocodedSameDay.map(...).join` inline ricreava la
  // stringa a ogni render. Anche se useMemo monta geocodedSameDay solo
  // quando cambia sameDayAppointments, l'expression nel queryKey va
  // ESPLICITAMENTE memoizzata oppure inline si ricrea sempre.
  const geocodedSameDayIdsKey = useMemo(
    () => geocodedSameDay.map((a) => a.id).sort().join(","),
    [geocodedSameDay],
  );

  const { data: interDistances = {}, isFetching: isInterDistLoading } = useQuery<Record<string, { duration_text: string; distance_text: string }>>({
    queryKey: ["mkt-apt-inter-dist", addressData.lat, addressData.lng, geocodedSameDayIdsKey],
    queryFn: async () => {
      if (!addressData.lat || !addressData.lng || geocodedSameDay.length === 0) return {};
      const results: Record<string, { duration_text: string; distance_text: string }> = {};
      await Promise.all(
        geocodedSameDay.map(async (a) => {
          try {
            const { data, error } = await supabase.functions.invoke("maps-proxy", {
              body: {
                action: "directions",
                waypoints: [
                  { lat: addressData.lat, lng: addressData.lng },
                  { lat: a.lat, lng: a.lng },
                ],
              },
            });
            if (!error && data?.legs?.[0]) {
              results[a.id] = { duration_text: data.legs[0].duration_text, distance_text: data.legs[0].distance_text };
            }
          } catch { /* ignore */ }
        })
      );
      return results;
    },
    enabled: open && !!addressData.lat && geocodedSameDay.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  // Calendar suggestions
  const { data: calendarSuggestions = [], isFetching: isSuggestionsLoading } = useQuery<CalendarSuggestion[]>({
    queryKey: ["mkt-apt-suggestions", companyId, addressData.lat, addressData.lng, dateStr],
    queryFn: async () => {
      if (!companyId || !addressData.lat || !addressData.lng || !dateStr) return [];
      try {
        const { data, error } = await supabase.functions.invoke("suggest-calendars", {
          body: {
            company_id: companyId,
            client_lat: addressData.lat,
            client_lng: addressData.lng,
            date: dateStr,
            client_address: addressData.formatted_address || "",
          },
        });
        if (error || !data?.suggestions) return [];
        return data.suggestions as CalendarSuggestion[];
      } catch {
        return [];
      }
    },
    enabled: open && !!companyId && !!addressData.lat && !!addressData.lng && !!dateStr,
    staleTime: 2 * 60 * 1000,
  });

  const handleSuggestionSelect = useCallback((sugCalendarId: string, suggestedTime?: string) => {
    setCalendarId(sugCalendarId);
    if (suggestedTime) {
      setStartTime(suggestedTime);
      // Find calendar duration to set end time
      const cal = calendars.find((c) => c.id === sugCalendarId);
      const duration = cal?.duration_minutes || 60;
      setEndTime(addMinutesToTime(suggestedTime, duration));
    }
  }, [calendars]);

  const handleStatusSelect = useCallback((nextStatus: string) => {
    setStatus(nextStatus);
    const suggestion = getMarketingFollowUpSuggestion(nextStatus);
    if (!suggestion) return;

    const subject = title.trim() ? `: ${title.trim()}` : "";
    setCreateFollowUp(true);
    setFollowUpTitle(`${suggestion.title}${subject}`);
    setFollowUpDueDate(format(addDays(new Date(), suggestion.dueInDays), "yyyy-MM-dd"));
    setFollowUpPriority(suggestion.priority);
  }, [title]);

  const createFollowUpTask = useCallback(async (appointmentId: string) => {
    if (!companyId || !user || !appointmentDate || activeTab === "blocked") return;

    const contactName = selectedContact
      ? `${selectedContact.first_name} ${selectedContact.last_name || ""}`.trim()
      : "";
    const appointmentDay = format(appointmentDate, "dd/MM/yyyy", { locale: it });
    const statusMeta = getMarketingAppointmentStatusMeta(status);
    const notes = [
      "Task generata dal calendario marketing.",
      `Appuntamento: ${title.trim()}`,
      `Data: ${appointmentDay} ${startTime}-${endTime}`,
      `Esito: ${statusMeta.label}`,
      contactName ? `Contatto: ${contactName}` : null,
      selectedOpportunity ? `Opportunita: ${selectedOpportunity.name}` : null,
      `ID appuntamento: ${appointmentId}`,
    ].filter(Boolean).join("\n");

    const { error } = await supabase.from("tasks").insert({
      company_id: companyId,
      title: followUpTitle.trim() || `Follow-up: ${title.trim()}`,
      notes,
      status: "da_fare",
      priority: followUpPriority,
      due_date: followUpDueDate || null,
      assigned_to: assignedTo && assignedTo !== "none" ? assignedTo : user.id,
      contact_id: contactId && contactId !== "none" ? contactId : null,
      opportunity_id: selectedOpportunity?.id || null,
      created_by: user.id,
      category: "commerciale",
    });
    if (error) throw error;

    await Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.list(companyId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.marketing(companyId) }),
    ]);
  }, [
    activeTab,
    appointmentDate,
    assignedTo,
    companyId,
    contactId,
    endTime,
    followUpDueDate,
    followUpPriority,
    followUpTitle,
    queryClient,
    selectedContact,
    selectedOpportunity,
    startTime,
    status,
    title,
    user,
  ]);

  const syncSavedAppointment = useCallback(async (appointmentId: string, mode: "create" | "update") => {
    const tasks: Promise<unknown>[] = [];

    // Chi clicca puo' non avere Google: basta che ce l'abbia il responsabile
    // del calendario o l'account agganciato — lo risolve la edge.
    if (googleSync.hasGoogleConnection || googleSync.hasAnyCompanyGoogleConnection) {
      tasks.push((async () => {
        const mapping = mode === "update" ? await googleSync.checkMapping(appointmentId) : null;
        if (mapping) return googleSync.updateEvent(appointmentId);
        if (googleSync.isGoogleConnected || googleSync.hasAnyCompanyGoogleConnection) return googleSync.pushEvent(appointmentId);
        return undefined;
      })());
    }

    if (appleSync.hasAppleConnection) {
      tasks.push((async () => {
        const mapping = mode === "update" ? await appleSync.checkMapping(appointmentId) : null;
        if (mapping) return appleSync.updateEvent(appointmentId);
        if (appleSync.isAppleConnected) return appleSync.pushEvent(appointmentId);
        return undefined;
      })());
    }

    if (tasks.length > 0) {
      await Promise.allSettled(tasks);
    }
  }, [appleSync, googleSync]);

  const syncDeletedAppointment = useCallback(async (appointmentId: string) => {
    const tasks: Promise<unknown>[] = [];
    if (googleSync.hasGoogleConnection || googleSync.hasAnyCompanyGoogleConnection) tasks.push(googleSync.deleteEvent(appointmentId));
    if (appleSync.hasAppleConnection) tasks.push(appleSync.deleteEvent(appointmentId));
    if (tasks.length > 0) {
      await Promise.allSettled(tasks);
    }
  }, [appleSync, googleSync]);

  const handleSave = async () => {
    if (saving) return; // guard sincrono contro doppio-click prima del re-render
    const isBlocked = activeTab === "blocked";

    if (!calendarId || calendarId === "none") {
      toast({ title: "Seleziona un calendario", variant: "destructive" });
      return;
    }
    if (!title.trim()) {
      toast({ title: "Inserisci un titolo", variant: "destructive" });
      return;
    }
    if (!appointmentDate) {
      toast({ title: "Seleziona una data", variant: "destructive" });
      return;
    }
    if (!startTime || !endTime) {
      toast({ title: "Inserisci orario inizio e fine", variant: "destructive" });
      return;
    }
    if (timeToMin(endTime) <= timeToMin(startTime)) {
      toast({ title: "L'ora di fine deve essere successiva all'ora di inizio", variant: "destructive" });
      return;
    }
    if (!isBlocked && (!contactId || contactId === "none")) {
      toast({ title: "Seleziona un contatto", variant: "destructive" });
      return;
    }
    if (!companyId || !user) return;

    setSaving(true);
    try {
      let savedAppointmentId: string | null = appointment?.id || null;
      let followUpCreated = false;
      let followUpWarning: string | null = null;
      const successTitle = isEditing
        ? isBlocked ? "Tempo bloccato aggiornato" : "Appuntamento aggiornato"
        : isBlocked ? "Tempo bloccato creato" : "Appuntamento prenotato";
      const effectiveMeetingProvider = !isBlocked && meetingProvider === "google_meet" ? "google_meet" : "none";
      const effectiveMeetingUrl = effectiveMeetingProvider === "google_meet" ? meetingUrl.trim() || null : null;

      const payload: Record<string, unknown> = {
        company_id: companyId,
        title: title.trim(),
        description: description.trim() || null,
        appointment_date: format(appointmentDate, "yyyy-MM-dd"),
        appointment_time: startTime + ":00",
        appointment_end_time: endTime + ":00",
        appointment_type: isBlocked ? "blocked" : effectiveMeetingProvider === "google_meet" ? "videocall" : "generico",
        assigned_to: assignedTo && assignedTo !== "none" ? assignedTo : null,
        calendar_id: calendarId,
        contact_id: !isBlocked && contactId && contactId !== "none" ? contactId : null,
        status: isBlocked ? "confermato" : status,
        is_blocked_slot: isBlocked,
        internal_notes: internalNotes.trim() || null,
        order_id: null,
        // Address fields
        address_line: addressData.address_line || null,
        address_city: addressData.address_city || null,
        address_postal_code: addressData.address_postal_code || null,
        address_province: addressData.address_province || null,
        address_country: addressData.address_country || "IT",
        address_notes: addressData.address_notes || null,
        formatted_address: addressData.formatted_address || null,
        lat: addressData.lat ?? null,
        lng: addressData.lng ?? null,
        place_id: addressData.place_id || null,
        meeting_provider: effectiveMeetingProvider,
        meeting_url: effectiveMeetingUrl,
        meeting_status: effectiveMeetingProvider === "google_meet" ? (effectiveMeetingUrl ? "ready" : "pending") : "none",
        meeting_created_at: effectiveMeetingUrl && !appointment?.meeting_created_at ? new Date().toISOString() : appointment?.meeting_created_at || null,
      };

      if (isEditing && appointment?.id) {
        const { error } = await supabase.from("appointments").update(payload).eq("id", appointment.id).eq("company_id", companyId!);
        if (error) throw error;
        savedAppointmentId = appointment.id;
        if (!isBlocked && status === "annullato") {
          void syncDeletedAppointment(appointment.id);
        } else {
          void syncSavedAppointment(appointment.id, "update");
        }
      } else {
        payload.created_by = user.id;
        const { data: created, error } = await supabase
          .from("appointments")
          .insert(payload as any)
          .select("id")
          .single();
        if (error) throw error;
        savedAppointmentId = created?.id || null;
        if (created?.id && (isBlocked || status !== "annullato")) {
          void syncSavedAppointment(created.id, "create");
        }
      }

      if (!isBlocked && createFollowUp && savedAppointmentId) {
        try {
          await createFollowUpTask(savedAppointmentId);
          followUpCreated = true;
        } catch (error) {
          followUpWarning = error instanceof Error ? error.message : "Task follow-up non creata.";
        }
      }

      // Sync address to contact
      const effectiveContactId = !isBlocked && contactId && contactId !== "none" ? contactId : null;
      if (effectiveContactId && addressData.address_line) {
        await supabase
          .from("marketing_contacts")
          .update({
            address: addressData.address_line,
            city: addressData.address_city || null,
            postal_code: addressData.address_postal_code || null,
            province: addressData.address_province || null,
            country: addressData.address_country || "Italia",
          })
          .eq("id", effectiveContactId)
          .eq("company_id", companyId);
      }

      toast({
        title: successTitle,
        description: followUpWarning
          ? `Salvato, ma il follow-up non e stato creato: ${followUpWarning}`
          : followUpCreated
            ? "Task follow-up creata e collegata al contatto."
            : undefined,
        variant: followUpWarning ? "destructive" : undefined,
      });
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Errore", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!appointment?.id || !companyId) return;
    setSaving(true);
    try {
      await syncDeletedAppointment(appointment.id);
      const { error } = await supabase.from("appointments").delete().eq("id", appointment.id).eq("company_id", companyId);
      if (error) throw error;
      toast({ title: "Appuntamento eliminato" });
      onSaved();
      onOpenChange(false);
    } catch (e: unknown) {
      toast({ title: "Errore nell'eliminazione", description: e instanceof Error ? e.message : "Problema temporaneo. Riprova.", variant: "destructive" });
    } finally {
      setSaving(false);
      setDeleteConfirmOpen(false);
    }
  };

  const isBlocked = activeTab === "blocked";

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing
              ? isBlocked ? "Modifica tempo bloccato" : "Modifica appuntamento"
              : isBlocked ? "Aggiungi tempo bloccato" : "Prenota appuntamento"}
          </DialogTitle>
          <DialogDescription>
            {isBlocked
              ? "Blocca un periodo sul calendario per impedire prenotazioni"
              : "Compila i dettagli per prenotare un appuntamento"}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "appointment" | "blocked")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="appointment" className="gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Appuntamento
            </TabsTrigger>
            <TabsTrigger value="blocked" className="gap-1.5">
              <Ban className="h-3.5 w-3.5" />
              Tempo bloccato
            </TabsTrigger>
          </TabsList>

          {/* ── APPOINTMENT TAB ── */}
          <TabsContent value="appointment" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr] gap-6">
              {/* Left column */}
              <div className="space-y-4">
                {calendars.length === 0 && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p className="font-medium">Nessun calendario CRM configurato</p>
                      <p className="text-xs opacity-80">Configura un calendario prima di prenotare appuntamenti o bloccare fasce orarie.</p>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Calendario *</Label>
                  <Select value={calendarId} onValueChange={setCalendarId} disabled={calendars.length === 0}>
                    <SelectTrigger><SelectValue placeholder="Seleziona calendario" /></SelectTrigger>
                    <SelectContent>
                      {calendars.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mkt-title">Titolo dell'appuntamento *</Label>
                  <Input id="mkt-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Es. Consulenza iniziale" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mkt-desc">Descrizione</Label>
                  <Textarea id="mkt-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Dettagli aggiuntivi..." rows={3} />
                </div>

                <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Label className="text-sm font-semibold">Modalità incontro</Label>
                      <p className="mt-0.5 text-xs text-muted-foreground">{meetingStatusLabel}</p>
                    </div>
                    {meetingProvider === "google_meet" && (
                      <Badge variant={meetingUrl ? "default" : "secondary"} className="gap-1">
                        <Video className="h-3.5 w-3.5" />
                        Google Meet
                      </Badge>
                    )}
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => {
                        setMeetingProvider("none");
                        setMeetingStatus("none");
                        setMeetingUrl("");
                      }}
                      className={cn(
                        "rounded-lg border bg-background p-3 text-left text-sm transition hover:border-primary/60 hover:bg-primary/5",
                        meetingProvider === "none" && "border-primary bg-primary/5 ring-1 ring-primary/20",
                      )}
                    >
                      <span className="font-medium">In presenza / telefono</span>
                      <span className="mt-1 block text-xs text-muted-foreground">Usa indirizzo, note o telefonata senza link video.</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMeetingProvider("google_meet");
                        setMeetingStatus(meetingUrl ? "ready" : "pending");
                      }}
                      className={cn(
                        "rounded-lg border bg-background p-3 text-left text-sm transition hover:border-primary/60 hover:bg-primary/5",
                        meetingProvider === "google_meet" && "border-primary bg-primary/5 ring-1 ring-primary/20",
                      )}
                    >
                      <span className="inline-flex items-center gap-1.5 font-medium">
                        <Video className="h-4 w-4 text-primary" />
                        Google Meet
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">Generato dal sync Google Calendar del responsabile.</span>
                    </button>
                  </div>

                  {meetingProvider === "google_meet" && (
                    <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                      {meetingUrl ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="min-w-0 flex-1 truncate">{meetingUrl}</span>
                          <Button type="button" variant="outline" size="sm" className="h-7 gap-1" onClick={copyMeetingUrl}>
                            <Copy className="h-3.5 w-3.5" />
                            Copia
                          </Button>
                          <Button type="button" variant="outline" size="sm" className="h-7 gap-1" asChild>
                            <a href={meetingUrl} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-3.5 w-3.5" />
                              Apri
                            </a>
                          </Button>
                        </div>
                      ) : (
                        "Il link Meet verrà creato appena l'appuntamento viene sincronizzato con Google Calendar."
                      )}
                    </div>
                  )}
                </div>

                {/* Location section */}
                <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                  <AddressAutocomplete value={addressData} onChange={setAddressData} />
                  {addressData.lat != null && addressData.lng != null && (
                    <>
                      <AddressMapPreview
                        lat={addressData.lat}
                        lng={addressData.lng}
                        formattedAddress={addressData.formatted_address}
                      />
                      {baseDistance && (
                        <div className="flex items-center gap-2 text-sm bg-background rounded-md border px-3 py-1.5">
                          <Car className="h-3.5 w-3.5 text-primary" />
                          <span className="font-medium">{baseDistance.duration_text}</span>
                          <span className="text-muted-foreground">- {baseDistance.distance_text}</span>
                          <span className="text-xs text-muted-foreground ml-auto">dalla base calendario</span>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Calendar Suggestions */}
                {addressData.lat != null && addressData.lng != null && appointmentDate && (
                  <CalendarSuggestions
                    suggestions={calendarSuggestions}
                    isLoading={isSuggestionsLoading}
                    onSelect={handleSuggestionSelect}
                    selectedCalendarId={calendarId}
                  />
                )}

                {/* Same-day appointments */}
                {sameDayAppointments.length > 0 && (
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
                    <p className="text-xs font-semibold text-foreground">Altri appuntamenti del giorno</p>
                    {sameDayAppointments.map((a) => {
                      const dist = interDistances[a.id];
                      const hasCoords = a.lat != null && a.lng != null;
                      return (
                        <div key={a.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3 shrink-0" />
                          <span>{a.appointment_time?.substring(0, 5) || "—"}</span>
                          <span className="truncate">{a.title || a.formatted_address || "Appuntamento"}</span>
                          {dist ? (
                            <span className="ml-auto shrink-0 inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[11px] font-medium">
                              <Car className="h-3 w-3" />
                              {dist.duration_text} - {dist.distance_text}
                            </span>
                          ) : hasCoords && addressData.lat && isInterDistLoading ? (
                            <Loader2 className="ml-auto h-3 w-3 animate-spin text-muted-foreground" />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-primary/15 text-primary">
                      <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 9a3 3 0 100-6 3 3 0 000 6zM6 8a4 4 0 118 0 4 4 0 01-8 0zM10 11a5 5 0 00-5 5 1 1 0 001 1h8a1 1 0 001-1 5 5 0 00-5-5z" /></svg>
                    </span>
                    Venditore assegnato
                    <span className="text-[10px] text-muted-foreground font-normal">(staff interno)</span>
                  </Label>
                  <Select value={assignedTo} onValueChange={setAssignedTo}>
                    <SelectTrigger><SelectValue placeholder="Non assegnato" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Non assegnato</SelectItem>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.first_name} {u.last_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">
                    Scegli il commerciale interno che gestirà l'appuntamento.
                  </p>
                </div>

                {/* Date & Time card */}
                <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold">Data e ora</Label>
                    <span className="text-xs text-muted-foreground">Fuso orario: Europe/Rome</span>
                  </div>

                  <div className="space-y-2">
                    <Label>Data *</Label>
                    <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !appointmentDate && "text-muted-foreground")}>
                          <CalendarDays className="mr-2 h-4 w-4" />
                          {appointmentDate ? format(appointmentDate, "EEEE d MMMM yyyy", { locale: it }) : "Seleziona data"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={appointmentDate}
                          onSelect={(d) => { setAppointmentDate(d); setDatePickerOpen(false); }}
                          locale={it}
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="start-time" className="text-xs">Ora inizio *</Label>
                      <Input id="start-time" type="time" step={900} value={startTime} onChange={(e) => {
                        setStartTime(e.target.value);
                        if (e.target.value) {
                          const dur = selectedCalendar?.duration_minutes || 60;
                          setEndTime(addMinutesToTime(e.target.value, dur));
                        }
                      }} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="end-time" className="text-xs">Ora fine *</Label>
                      <Input id="end-time" type="time" step={900} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                    </div>
                  </div>
                  {timeError && (
                    <p className="text-xs font-medium text-destructive">{timeError}</p>
                  )}
                </div>
              </div>

              {/* Right column */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                      <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 9a3 3 0 100-6 3 3 0 000 6zM6 8a4 4 0 118 0 4 4 0 01-8 0zM10 11a5 5 0 00-5 5 1 1 0 001 1h8a1 1 0 001-1 5 5 0 00-5-5z" /></svg>
                    </span>
                    Cliente *
                    <span className="text-[10px] text-muted-foreground font-normal">(contatto CRM)</span>
                  </Label>
                  <div>
                    <Popover open={contactPickerOpen} onOpenChange={setContactPickerOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          role="combobox"
                          aria-expanded={contactPickerOpen}
                          className={cn("w-full justify-between", !selectedContact && "text-muted-foreground")}
                        >
                          <span className="truncate">
                            {selectedContact
                              ? `${selectedContact.first_name} ${selectedContact.last_name || ""}${selectedContact.email ? ` (${selectedContact.email})` : ""}`
                              : "Cerca e seleziona contatto..."}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[min(420px,calc(100vw-2rem))] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Cerca per nome o email..." />
                          <CommandList>
                            <CommandEmpty>Nessun contatto trovato.</CommandEmpty>
                            <CommandGroup>
                              {contacts.map((c) => {
                                const label = `${c.first_name} ${c.last_name || ""}${c.email ? ` ${c.email}` : ""}`.trim();
                                return (
                                  <CommandItem
                                    key={c.id}
                                    value={label}
                                    onSelect={() => {
                                      setContactId(c.id);
                                      setContactPickerOpen(false);
                                    }}
                                  >
                                    <Check className={cn("mr-2 h-4 w-4", contactId === c.id ? "opacity-100" : "opacity-0")} />
                                    <span className="min-w-0 flex-1 truncate">
                                      {c.first_name} {c.last_name || ""}
                                      {c.email && <span className="ml-1 text-muted-foreground">({c.email})</span>}
                                    </span>
                                  </CommandItem>
                                );
                              })}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Persona esterna per cui è l'appuntamento (prospect o cliente).
                  </p>
                </div>

                {selectedContact && (
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="inline-flex items-center gap-1.5 text-sm font-semibold">
                          <Sparkles className="h-3.5 w-3.5 text-primary" />
                          Contesto CRM
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {selectedContact.phone || selectedContact.email || "Nessun recapito salvato"}
                        </p>
                      </div>
                      {(selectedContact.ai_score ?? selectedContact.lead_score ?? selectedContact.score) != null && (
                        <Badge variant="secondary" className="shrink-0">
                          Score {selectedContact.ai_score ?? selectedContact.lead_score ?? selectedContact.score}
                        </Badge>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-md bg-background px-2 py-1.5">
                        <span className="block text-muted-foreground">Origine</span>
                        <span className="font-medium">{selectedContact.attr_source || selectedContact.source || "Non indicata"}</span>
                      </div>
                      <div className="rounded-md bg-background px-2 py-1.5">
                        <span className="block text-muted-foreground">Canale</span>
                        <span className="font-medium">{selectedContact.preferred_channel || selectedContact.attr_medium || "Non indicato"}</span>
                      </div>
                    </div>

                    {selectedContact.attr_campaign && (
                      <p className="text-xs text-muted-foreground">
                        Campagna: <span className="font-medium text-foreground">{selectedContact.attr_campaign}</span>
                      </p>
                    )}

                    {selectedContact.ai_predicted_value_eur != null && (
                      <p className="text-xs text-muted-foreground">
                        Valore previsto: <span className="font-medium text-foreground">{formatEuro(selectedContact.ai_predicted_value_eur)}</span>
                      </p>
                    )}

                    {selectedContact.ai_next_action && (
                      <div className="rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-xs">
                        <span className="font-medium text-primary">Prossima azione AI: </span>
                        {selectedContact.ai_next_action}
                      </div>
                    )}

                    {selectedOpportunity && (
                      <div className="rounded-md border bg-background px-2 py-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium truncate">{selectedOpportunity.name}</span>
                          <Badge variant="outline" className="shrink-0">{selectedOpportunity.status}</Badge>
                        </div>
                        <p className="mt-1 text-muted-foreground">
                          {formatEuro(selectedOpportunity.value)}
                          {selectedOpportunity.probability != null ? ` - ${selectedOpportunity.probability}% probabilita` : ""}
                        </p>
                        {selectedOpportunity.next_action && (
                          <p className="mt-1 text-muted-foreground">Next: {selectedOpportunity.next_action}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="mkt-create-follow-up"
                      checked={createFollowUp}
                      onCheckedChange={(checked) => setCreateFollowUp(Boolean(checked))}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <Label htmlFor="mkt-create-follow-up" className="flex items-center gap-1.5 text-sm font-semibold">
                        <ListChecks className="h-3.5 w-3.5 text-primary" />
                        Crea task follow-up
                      </Label>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Stato: {selectedStatusMeta.label}. {selectedStatusMeta.description}
                      </p>
                    </div>
                  </div>

                  {createFollowUp && (
                    <div className="space-y-2">
                      <Input
                        value={followUpTitle}
                        onChange={(event) => setFollowUpTitle(event.target.value)}
                        placeholder="Titolo task follow-up"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          type="date"
                          value={followUpDueDate}
                          onChange={(event) => setFollowUpDueDate(event.target.value)}
                        />
                        <Select value={followUpPriority} onValueChange={(value) => setFollowUpPriority(value as "bassa" | "normale" | "alta")}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="bassa">Bassa</SelectItem>
                            <SelectItem value="normale">Normale</SelectItem>
                            <SelectItem value="alta">Alta</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {selectedOpportunity && (
                        <p className="text-[10px] text-muted-foreground">
                          La task sara collegata anche all'opportunita "{selectedOpportunity.name}".
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  {!showInternalNotes ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs gap-1 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowInternalNotes(true)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Aggiungi nota interna
                    </Button>
                  ) : (
                    <>
                      <Label htmlFor="mkt-internal-notes">Note interne</Label>
                      <Textarea
                        id="mkt-internal-notes"
                        value={internalNotes}
                        onChange={(e) => setInternalNotes(e.target.value)}
                        placeholder="Visibile solo al team..."
                        rows={4}
                      />
                    </>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ── BLOCKED SLOT TAB ── */}
          <TabsContent value="blocked" className="mt-4">
            <p className="text-sm text-muted-foreground mb-4">
              Vai in vacanza? Devi bloccare del tempo? Aggiungi qui un periodo di blocco per impedire la prenotazione di appuntamenti.
            </p>

            <div className="space-y-4 max-w-md">
              <div className="space-y-2">
                <Label>Calendario *</Label>
                <Select value={calendarId} onValueChange={setCalendarId}>
                  <SelectTrigger><SelectValue placeholder="Seleziona calendario" /></SelectTrigger>
                  <SelectContent>
                    {calendars.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="blocked-title">Titolo *</Label>
                <Input id="blocked-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Es. Ferie, Pausa pranzo..." />
              </div>

              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Data e ora</Label>
                  <span className="text-xs text-muted-foreground">Fuso orario: Europe/Rome</span>
                </div>

                <div className="space-y-2">
                  <Label>Data *</Label>
                  <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !appointmentDate && "text-muted-foreground")}>
                        <CalendarDays className="mr-2 h-4 w-4" />
                        {appointmentDate ? format(appointmentDate, "EEEE d MMMM yyyy", { locale: it }) : "Seleziona data"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={appointmentDate}
                        onSelect={(d) => { setAppointmentDate(d); setDatePickerOpen(false); }}
                        locale={it}
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="blocked-start" className="text-xs">Ora inizio *</Label>
                    <Input id="blocked-start" type="time" step={900} value={startTime} onChange={(e) => {
                      setStartTime(e.target.value);
                      if (e.target.value) setEndTime(addMinutesToTime(e.target.value, 30));
                    }} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="blocked-end" className="text-xs">Ora fine *</Label>
                    <Input id="blocked-end" type="time" step={900} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                  </div>
                </div>
                {timeError && (
                  <p className="text-xs font-medium text-destructive">{timeError}</p>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex-col gap-3 sm:flex-row sm:items-center sm:gap-2 mt-4">
          <div className="flex flex-wrap items-center gap-2 sm:mr-auto">
            {isEditing && (
              <Button variant="destructive" onClick={() => setDeleteConfirmOpen(true)} disabled={saving} size="sm">
                <Trash2 className="h-4 w-4 mr-1" aria-hidden="true" />
                Elimina
              </Button>
            )}

            {!isBlocked && (
              <>
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Stato:</Label>
                <Select value={status} onValueChange={handleStatusSelect}>
                  <SelectTrigger className="h-8 w-[170px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MARKETING_APPOINTMENT_STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <Badge variant={option.variant} className="text-[10px]">
                          {option.label}
                        </Badge>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Annulla
            </Button>
            <Button onClick={handleSave} disabled={saving || calendars.length === 0 || !!timeError} className="gap-2">
              {saving && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
              {saving
                ? "Salvataggio..."
                : isEditing
                  ? "Salva modifiche"
                  : isBlocked
                    ? "Blocca tempo"
                    : "Prenota appuntamento"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Delete confirmation dialog */}
    <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitleComp>Elimina appuntamento</AlertDialogTitleComp>
          <AlertDialogDesc>
            Sei sicuro di voler eliminare questo appuntamento? L'azione non è reversibile.
          </AlertDialogDesc>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Annulla</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={handleDelete}
            disabled={saving}
          >
            {saving ? "Eliminazione..." : "Elimina"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
