import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PLATFORM_ADMIN_COMPANY_ID } from "@/lib/adminConstants";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertCircle,
  BriefcaseBusiness,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Globe2,
  Info,
  MapPin,
  Minus,
  Plus,
  Settings2,
  Users,
  Video,
} from "lucide-react";
import AddressAutocomplete, { type AddressData } from "@/components/shared/AddressAutocomplete";
import AddressMapPreview from "@/components/shared/AddressMapPreview";
import { buildBookingUrl, normalizeBookingSlug } from "@/lib/bookingLinks";
import { CALENDAR_COLOR_PRESETS } from "@/lib/marketingCalendarConstants";
import { CalendarioEsternoPicker, type SceltaCalendarioEsterno } from "./CalendarioEsternoPicker";
import { cn } from "@/lib/utils";

export interface CalendarFormData {
  name: string;
  description: string;
  color: string;
  owner_id: string;
  calendar_type: string;
  booking_slug: string;
  duration_minutes: number;
  max_daily_km: number | null;
  base_address_line: string;
  base_address_city: string;
  base_address_postal_code: string;
  base_address_province: string;
  base_address_country: string;
  base_formatted_address: string;
  base_lat: number | null;
  base_lng: number | null;
  base_place_id: string;
  default_meeting_provider: "none" | "google_meet";
  default_meeting_enabled: boolean;
  buffer_before_min: number;
  buffer_after_min: number;
  min_notice_minutes: number;
  max_per_day: number | null;
  reminder_24h: boolean;
  reminder_1h: boolean;
  /** Dove finiscono su Google/Outlook/Apple gli appuntamenti di QUESTO calendario. */
  external_provider: "google" | "outlook" | "apple" | null;
  external_connection_id: string | null;
  external_calendar_id: string | null;
  external_calendar_name: string | null;
  /** Link fisso della videochiamata (Meet, Zoom…): va in conferma, promemoria ed evento. */
  link_videochiamata: string;
  /** Numero WhatsApp Locale da cui partono conferma e promemoria (solo piattaforma). */
  whatsapp_numero_id: string | null;
  /** Il WhatsApp «siamo già collegati» pochi minuti prima. */
  promemoria_5min: boolean;
  /** Da quando conferma e promemoria valgono anche per gli appuntamenti fissati a mano (null = no). */
  messaggi_crm_dal: string | null;
  firma_messaggi: string;
  /** Righe «cosa preparare» della conferma, una per riga. */
  cosa_preparare: string;
  /** Mittente delle email dell'appuntamento: vale solo su un dominio verificato. */
  mittente_nome: string;
  mittente_email: string;
}

// Un solo modulo vuoto: prima il «nuovo calendario» ripartiva da un oggetto
// senza margini, preavviso e promemoria, e il preavviso si salvava a 0.
const FORM_VUOTO: CalendarFormData = {
  name: "",
  description: "",
  color: "",
  owner_id: "",
  calendar_type: "personal",
  booking_slug: "",
  duration_minutes: 30,
  buffer_before_min: 0,
  buffer_after_min: 0,
  min_notice_minutes: 120,
  max_per_day: null,
  reminder_24h: true,
  reminder_1h: true,
  external_provider: null,
  external_connection_id: null,
  external_calendar_id: null,
  external_calendar_name: null,
  max_daily_km: null,
  base_address_line: "",
  base_address_city: "",
  base_address_postal_code: "",
  base_address_province: "",
  base_address_country: "IT",
  base_formatted_address: "",
  base_lat: null,
  base_lng: null,
  base_place_id: "",
  default_meeting_provider: "none",
  default_meeting_enabled: false,
  link_videochiamata: "",
  whatsapp_numero_id: null,
  promemoria_5min: false,
  messaggi_crm_dal: null,
  firma_messaggi: "",
  cosa_preparare: "",
  mittente_nome: "",
  mittente_email: "",
};

/** «meet.google.com/abc» → «https://meet.google.com/abc». */
function linkCompleto(link: string): string {
  const l = link.trim();
  if (!l) return "";
  return /^https?:\/\//i.test(l) ? l : `https://${l}`;
}

interface CalendarDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CalendarFormData) => void;
  onAdvancedSettings?: () => void;
  initialData?: Partial<CalendarFormData> | null;
  isLoading?: boolean;
}

const CALENDAR_TYPE_OPTIONS = [
  {
    value: "personal",
    label: "Singolo commerciale",
    description: "Link personale per un consulente o venditore.",
    icon: BriefcaseBusiness,
  },
  {
    value: "team",
    label: "Team / reparto",
    description: "Per distribuire richieste a un gruppo o reparto.",
    icon: Users,
  },
  {
    value: "event",
    label: "Evento specifico",
    description: "Open day, webinar, sopralluoghi dedicati o campagne.",
    icon: CalendarClock,
  },
] as const;

function InfoTooltip({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help inline ml-1" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function CalendarDialog({ open, onOpenChange, onSubmit, onAdvancedSettings, initialData, isLoading }: CalendarDialogProps) {
  const { effectiveCompany } = useAuth();
  const isEditing = !!initialData;
  const canOpenAdvancedSettings = isEditing && !!onAdvancedSettings;
  const [showDescription, setShowDescription] = useState(false);
  const [durationUnit, setDurationUnit] = useState<"minutes" | "hours">("minutes");
  const [durationValue, setDurationValue] = useState(30);
  const [slugTouched, setSlugTouched] = useState(false);

  const [form, setForm] = useState<CalendarFormData>(FORM_VUOTO);
  // «Link fisso» è una modalità a sé: si sceglie e poi si scrive il link.
  const [modoLink, setModoLink] = useState(false);
  const dellaPiattaforma = effectiveCompany?.id === PLATFORM_ADMIN_COMPANY_ID;

  // I numeri WhatsApp Locale: solo la piattaforma ne ha.
  const { data: numeriWhatsapp = [] } = useQuery({
    queryKey: ["calendario-numeri-whatsapp-locale"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("openwa_numbers")
        .select("id, display_name, numero, stato")
        .is("deleted_at", null)
        .order("display_name");
      if (error) throw error;
      return (data ?? []) as { id: string; display_name: string | null; numero: string | null; stato: string }[];
    },
    enabled: open && dellaPiattaforma,
    staleTime: 60 * 1000,
  });

  const addressValue: AddressData = {
    address_line: form.base_address_line,
    address_city: form.base_address_city,
    address_postal_code: form.base_address_postal_code,
    address_province: form.base_address_province,
    address_country: form.base_address_country,
    address_notes: "",
    formatted_address: form.base_formatted_address,
    lat: form.base_lat,
    lng: form.base_lng,
    place_id: form.base_place_id,
  };

  const handleAddressChange = (data: AddressData) => {
    setForm(f => ({
      ...f,
      base_address_line: data.address_line,
      base_address_city: data.address_city,
      base_address_postal_code: data.address_postal_code,
      base_address_province: data.address_province,
      base_address_country: data.address_country,
      base_formatted_address: data.formatted_address,
      base_lat: data.lat,
      base_lng: data.lng,
      base_place_id: data.place_id,
    }));
  };

  const { data: teamMembers = [] } = useCompanyStaffUsers(open ? effectiveCompany?.id : null);
  const bookingPreviewUrl = buildBookingUrl(form.booking_slug);
  const selectedType = CALENDAR_TYPE_OPTIONS.find((option) => option.value === form.calendar_type) || CALENDAR_TYPE_OPTIONS[0];
  const SelectedTypeIcon = selectedType.icon;
  const readinessChecks = [
    { label: "Nome pubblico", ok: !!form.name.trim() },
    { label: "Link prenotazione", ok: !!form.booking_slug.trim() },
    { label: "Durata appuntamento", ok: form.duration_minutes > 0 },
    { label: "Responsabile", ok: !!form.owner_id },
    // Senza questa riga il calendario esterno era l'unica scelta del modulo
    // che non compariva nel riepilogo: si sceglieva e non se ne aveva conferma.
    { label: "Calendario esterno", ok: !!form.external_calendar_id },
    { label: "Sede base", ok: !!form.base_formatted_address || !!form.base_address_city },
  ];
  const completedChecks = readinessChecks.filter((check) => check.ok).length;

  useEffect(() => {
    if (initialData) {
      const mins = initialData.duration_minutes || 30;
      const isHours = mins >= 60 && mins % 60 === 0;
      setForm({
        name: initialData.name || "",
        description: initialData.description || "",
        color: initialData.color || "",
        owner_id: initialData.owner_id || "",
        calendar_type: initialData.calendar_type || "personal",
        booking_slug: normalizeBookingSlug(initialData.booking_slug || initialData.name || ""),
        duration_minutes: mins,
        buffer_before_min: initialData.buffer_before_min ?? 0,
        buffer_after_min: initialData.buffer_after_min ?? 0,
        min_notice_minutes: initialData.min_notice_minutes ?? 120,
        max_per_day: initialData.max_per_day ?? null,
        reminder_24h: initialData.reminder_24h !== false,
        reminder_1h: initialData.reminder_1h !== false,
        external_provider: initialData.external_provider ?? null,
        external_connection_id: initialData.external_connection_id ?? null,
        external_calendar_id: initialData.external_calendar_id ?? null,
        external_calendar_name: initialData.external_calendar_name ?? null,
        max_daily_km: initialData.max_daily_km ?? null,
        base_address_line: initialData.base_address_line || "",
        base_address_city: initialData.base_address_city || "",
        base_address_postal_code: initialData.base_address_postal_code || "",
        base_address_province: initialData.base_address_province || "",
        base_address_country: initialData.base_address_country || "IT",
        base_formatted_address: initialData.base_formatted_address || "",
        base_lat: initialData.base_lat ?? null,
        base_lng: initialData.base_lng ?? null,
        base_place_id: initialData.base_place_id || "",
        default_meeting_provider: initialData.default_meeting_provider || "none",
        default_meeting_enabled: initialData.default_meeting_provider === "google_meet" || !!initialData.default_meeting_enabled,
        link_videochiamata: initialData.link_videochiamata || "",
        whatsapp_numero_id: initialData.whatsapp_numero_id ?? null,
        promemoria_5min: !!initialData.promemoria_5min,
        messaggi_crm_dal: initialData.messaggi_crm_dal ?? null,
        firma_messaggi: initialData.firma_messaggi || "",
        cosa_preparare: initialData.cosa_preparare || "",
        mittente_nome: initialData.mittente_nome || "",
        mittente_email: initialData.mittente_email || "",
      });
      setModoLink(!!initialData.link_videochiamata);
      setShowDescription(!!(initialData.description));
      setDurationUnit(isHours ? "hours" : "minutes");
      setDurationValue(isHours ? mins / 60 : mins);
      setSlugTouched(!!initialData.booking_slug);
    } else {
      setForm(FORM_VUOTO);
      setModoLink(false);
      setShowDescription(false);
      setDurationUnit("minutes");
      setDurationValue(30);
      setSlugTouched(false);
    }
  }, [initialData, open]);

  // Sync duration value + unit back to form
  useEffect(() => {
    const mins = durationUnit === "hours" ? durationValue * 60 : durationValue;
    setForm(f => ({ ...f, duration_minutes: mins }));
  }, [durationValue, durationUnit]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Link fisso e Meet automatico si escludono: vale la modalità scelta.
    const link = modoLink ? linkCompleto(form.link_videochiamata) : "";
    onSubmit({
      ...form,
      link_videochiamata: link,
      default_meeting_provider: link ? "none" : form.default_meeting_provider,
      default_meeting_enabled: link ? false : form.default_meeting_enabled,
      // Senza link non c'è nulla a cui essere «già collegati».
      promemoria_5min: !!link && !!form.whatsapp_numero_id && form.promemoria_5min,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader className="space-y-2">
          <DialogTitle>{isEditing ? "Modifica calendario" : "Nuovo calendario"}</DialogTitle>
          <DialogDescription>
            Configura in un unico flusso cosa vede il cliente, chi riceve l'appuntamento e come condividere il link.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-4">
              <section className="rounded-lg border bg-background p-4">
                <div className="mb-4 flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">1</div>
                  <div>
                    <h3 className="text-sm font-semibold">Dettagli pubblici</h3>
                    <p className="text-xs text-muted-foreground">Nome, descrizione e link che userai nelle campagne.</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="cal-name" className="flex items-center">
                      Nome del calendario
                      <InfoTooltip text="Inserisci un nome descrittivo per il tuo calendario. Questo verra' mostrato ai tuoi clienti." />
                    </Label>
                    <Input
                      id="cal-name"
                      value={form.name}
                      onChange={(e) => {
                        const nextName = e.target.value;
                        setForm(f => ({
                          ...f,
                          name: nextName,
                          booking_slug: slugTouched ? f.booking_slug : normalizeBookingSlug(nextName),
                        }));
                      }}
                      placeholder="(es.) Sopralluogo infissi Milano"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center">
                      Colore calendario
                      <InfoTooltip text="Colore con cui gli appuntamenti di questo calendario vengono mostrati nel calendario marketing. Lascia su 'Automatico' per assegnarlo in base alla posizione." />
                    </Label>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, color: "" }))}
                        className={cn(
                          "flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors",
                          !form.color ? "border-primary bg-primary/10 font-medium text-primary" : "border-border text-muted-foreground hover:bg-muted/50"
                        )}
                        aria-pressed={!form.color}
                      >
                        Automatico
                      </button>
                      {CALENDAR_COLOR_PRESETS.map((preset) => {
                        const selected = form.color === preset.token;
                        return (
                          <button
                            key={preset.token}
                            type="button"
                            onClick={() => setForm((f) => ({ ...f, color: preset.token }))}
                            title={preset.label}
                            aria-label={preset.label}
                            aria-pressed={selected}
                            className={cn(
                              "h-7 w-7 rounded-full border-2 transition-transform hover:scale-110",
                              selected ? "ring-2 ring-offset-2 ring-offset-background" : "border-transparent"
                            )}
                            style={{ backgroundColor: preset.swatch, ...(selected ? { borderColor: preset.swatch } : {}) }}
                          >
                            {selected && <CheckCircle2 className="mx-auto h-3.5 w-3.5 text-white" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center">
                      Link pubblico
                      <InfoTooltip text="Slug del link da inviare ai clienti o embeddare nel sito." />
                    </Label>
                    <div className="flex overflow-hidden rounded-md border bg-muted/40">
                      <span className="inline-flex items-center border-r px-2 text-xs text-muted-foreground">/prenota/</span>
                      <Input
                        value={form.booking_slug}
                        onChange={(e) => {
                          setSlugTouched(true);
                          setForm(f => ({ ...f, booking_slug: normalizeBookingSlug(e.target.value) }));
                        }}
                        className="h-10 rounded-none border-0 bg-background focus-visible:ring-0"
                        placeholder="link-calendario"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setShowDescription(!showDescription);
                      if (showDescription) setForm(f => ({ ...f, description: "" }));
                    }}
                    className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                  >
                    {showDescription ? (
                      <><Minus className="h-3.5 w-3.5" /> Rimuovi descrizione</>
                    ) : (
                      <><Plus className="h-3.5 w-3.5" /> Aggiungi descrizione</>
                    )}
                  </button>

                  {showDescription && (
                    <Textarea
                      value={form.description}
                      onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="Spiega cosa prenota il cliente e cosa deve preparare prima dell'appuntamento."
                      rows={3}
                    />
                  )}
                </div>
              </section>

              <section className="rounded-lg border bg-background p-4">
                <div className="mb-4 flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">2</div>
                  <div>
                    <h3 className="text-sm font-semibold">Tipo e assegnazione</h3>
                    <p className="text-xs text-muted-foreground">Scegli se il link e' personale, di team o legato a un evento.</p>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  {CALENDAR_TYPE_OPTIONS.map((option) => {
                    const OptionIcon = option.icon;
                    const selected = form.calendar_type === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, calendar_type: option.value }))}
                        className={`rounded-lg border p-3 text-left transition hover:border-primary/60 hover:bg-primary/5 ${
                          selected ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "bg-background"
                        }`}
                      >
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <OptionIcon className="h-4 w-4 text-primary" />
                          {option.label}
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{option.description}</p>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 space-y-2">
                  <Label className="flex items-center">
                    Responsabile
                    <InfoTooltip text="Seleziona chi ricevera' l'appuntamento quando il cliente prenota." />
                  </Label>
                  <Select
                    value={form.owner_id || "none"}
                    onValueChange={(v) => setForm(f => ({ ...f, owner_id: v === "none" ? "" : v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleziona un membro" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nessuna assegnazione</SelectItem>
                      {teamMembers.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {[m.first_name, m.last_name].filter(Boolean).join(" ") || "Senza nome"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </section>

              {/* 08/09/2026: l'associazione al calendario esterno sta QUI, dentro
                  il calendario che stai configurando. Prima era in un'altra
                  pagina, valeva per tutti i calendari dello stesso responsabile
                  e mostrava l'id grezzo del calendario Google. */}
              <section className="rounded-lg border bg-background p-4">
                <div className="mb-4 flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">3</div>
                  <div>
                    <h3 className="text-sm font-semibold">Calendario esterno</h3>
                    <p className="text-xs text-muted-foreground">
                      In quale calendario di Google, Outlook o Apple finiscono gli appuntamenti di questo calendario.
                    </p>
                  </div>
                </div>
                <CalendarioEsternoPicker
                  value={{
                    external_provider: form.external_provider,
                    external_connection_id: form.external_connection_id,
                    external_calendar_id: form.external_calendar_id,
                    external_calendar_name: form.external_calendar_name,
                  }}
                  onChange={(next: SceltaCalendarioEsterno) => setForm(f => ({ ...f, ...next }))}
                />
              </section>

              <section className="rounded-lg border bg-background p-4">
                <div className="mb-4 flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">4</div>
                  <div>
                    <h3 className="text-sm font-semibold">Regole operative</h3>
                    <p className="text-xs text-muted-foreground">Durata e limiti usati dal calendario marketing.</p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
                  <div className="space-y-2">
                    <Label className="flex items-center">
                      Durata dell'incontro
                      <InfoTooltip text="Imposta la durata predefinita per gli appuntamenti in questo calendario." />
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        min={1}
                        value={durationValue}
                        onChange={(e) => setDurationValue(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-24"
                      />
                      <Select value={durationUnit} onValueChange={(v) => setDurationUnit(v as "minutes" | "hours")}>
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="minutes">Minuti</SelectItem>
                          <SelectItem value="hours">Ore</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {[30, 45, 60, 90, 120].map((mins) => (
                        <Button
                          key={mins}
                          type="button"
                          variant={form.duration_minutes === mins ? "default" : "outline"}
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => {
                            setDurationUnit(mins >= 60 && mins % 60 === 0 ? "hours" : "minutes");
                            setDurationValue(mins >= 60 && mins % 60 === 0 ? mins / 60 : mins);
                            setForm(f => ({ ...f, duration_minutes: mins }));
                          }}
                        >
                          {mins < 60 ? `${mins} min` : `${mins / 60}h`}
                        </Button>
                      ))}
                    </div>

                  {/* Regole di agenda: erano colonne che nessuno leggeva. */}
                  <div className="space-y-3 rounded-lg border p-3">
                    <Label className="flex items-center">
                      Regole di agenda
                      <InfoTooltip text="Margini fra un appuntamento e l'altro, preavviso minimo per prenotare e tetto di appuntamenti al giorno." />
                    </Label>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Margine prima (min)</Label>
                        <Input type="number" min={0} max={240} value={form.buffer_before_min}
                          onChange={(e) => setForm(f => ({ ...f, buffer_before_min: Math.max(0, parseInt(e.target.value) || 0) }))} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Margine dopo (min)</Label>
                        <Input type="number" min={0} max={240} value={form.buffer_after_min}
                          onChange={(e) => setForm(f => ({ ...f, buffer_after_min: Math.max(0, parseInt(e.target.value) || 0) }))} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Preavviso minimo (min)</Label>
                        <Input type="number" min={0} max={20160} value={form.min_notice_minutes}
                          onChange={(e) => setForm(f => ({ ...f, min_notice_minutes: Math.max(0, parseInt(e.target.value) || 0) }))} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Max al giorno</Label>
                        <Input type="number" min={1} placeholder="nessun limite"
                          value={form.max_per_day ?? ""}
                          onChange={(e) => setForm(f => ({ ...f, max_per_day: e.target.value.trim() ? Math.max(1, parseInt(e.target.value) || 1) : null }))} />
                      </div>
                    </div>
                    <div className="space-y-1.5 text-sm">
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={form.reminder_24h}
                          onChange={(e) => setForm(f => ({ ...f, reminder_24h: e.target.checked }))} />
                        Promemoria al cliente il giorno prima
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={form.reminder_1h}
                          onChange={(e) => setForm(f => ({ ...f, reminder_1h: e.target.checked }))} />
                        Promemoria un'ora prima
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={!!form.messaggi_crm_dal}
                          onChange={(e) => setForm(f => ({ ...f, messaggi_crm_dal: e.target.checked ? (f.messaggi_crm_dal ?? new Date().toISOString()) : null }))} />
                        Conferma e promemoria anche per gli appuntamenti fissati a mano
                        <InfoTooltip text="Chi viene fissato al telefono riceve gli stessi messaggi di chi prenota dal link. Vale per gli appuntamenti creati da adesso in poi." />
                      </label>
                    </div>
                    {dellaPiattaforma && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">WhatsApp di conferma e promemoria</Label>
                          <Select
                            value={form.whatsapp_numero_id ?? "__solo_email__"}
                            onValueChange={(v) => setForm(f => ({
                              ...f,
                              whatsapp_numero_id: v === "__solo_email__" ? null : v,
                              promemoria_5min: v === "__solo_email__" ? false : f.promemoria_5min,
                            }))}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__solo_email__">Nessuno: solo email</SelectItem>
                              {numeriWhatsapp.map((n) => (
                                <SelectItem key={n.id} value={n.id}>
                                  {[n.display_name, n.numero].filter(Boolean).join(" · ") || "Numero senza nome"}
                                  {n.stato !== "connected" ? " (non collegato)" : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <label className="flex items-center gap-2 self-end pb-2 text-sm">
                          <input type="checkbox"
                            disabled={!form.whatsapp_numero_id || !modoLink || !form.link_videochiamata.trim()}
                            checked={form.promemoria_5min && !!form.whatsapp_numero_id && modoLink && !!form.link_videochiamata.trim()}
                            onChange={(e) => setForm(f => ({ ...f, promemoria_5min: e.target.checked }))} />
                          «Siamo già collegati» 5 minuti prima
                          <InfoTooltip text="Un WhatsApp col link della videochiamata poco prima dell'inizio. Serve il link fisso del calendario." />
                        </label>
                      </div>
                    )}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Firma dei messaggi</Label>
                        <Input value={form.firma_messaggi} maxLength={120}
                          placeholder={`Il team di ${effectiveCompany?.name || "…"}`}
                          onChange={(e) => setForm(f => ({ ...f, firma_messaggi: e.target.value }))} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Cosa preparare (nella conferma, uno per riga)</Label>
                        <Textarea rows={3} value={form.cosa_preparare} maxLength={1000}
                          placeholder={"come fate oggi i preventivi\ndove segnate ore e materiali"}
                          onChange={(e) => setForm(f => ({ ...f, cosa_preparare: e.target.value }))} />
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Nome del mittente</Label>
                        <Input value={form.mittente_nome} maxLength={80}
                          placeholder={effectiveCompany?.name || "Nome che legge il cliente"}
                          onChange={(e) => setForm(f => ({ ...f, mittente_nome: e.target.value }))} />
                      </div>
                      <div className="space-y-1">
                        <Label className="flex items-center text-xs text-muted-foreground">
                          Indirizzo del mittente
                          <InfoTooltip text="Solo su un dominio verificato (Impostazioni → Dominio email). Vuoto, o su un dominio non verificato: le email partono dal mittente della piattaforma." />
                        </Label>
                        <Input type="email" value={form.mittente_email} maxLength={160}
                          placeholder="nome@tuodominio.it"
                          onChange={(e) => setForm(f => ({ ...f, mittente_email: e.target.value }))} />
                      </div>
                    </div>
                  </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center">
                      Km massimi A/R
                      <InfoTooltip text="Limite km giornalieri per questo calendario. Lascia vuoto per usare il valore globale dalle preferenze." />
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      value={form.max_daily_km ?? ""}
                      onChange={(e) => setForm(f => ({ ...f, max_daily_km: e.target.value ? parseInt(e.target.value) : null }))}
                      placeholder="Default globale"
                    />
                  </div>
                </div>
              </section>

              <section className="rounded-lg border bg-background p-4">
                <div className="mb-4 flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">4</div>
                  <div>
                    <h3 className="text-sm font-semibold">Modalità incontro</h3>
                    <p className="text-xs text-muted-foreground">In presenza, con un link fisso sempre uguale o con un Google Meet diverso per ogni appuntamento.</p>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => {
                      setModoLink(false);
                      setForm(f => ({ ...f, default_meeting_provider: "none", default_meeting_enabled: false }));
                    }}
                    className={`rounded-lg border p-3 text-left transition hover:border-primary/60 hover:bg-primary/5 ${
                      !modoLink && form.default_meeting_provider === "none" ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "bg-background"
                    }`}
                  >
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <MapPin className="h-4 w-4 text-primary" />
                      In presenza / telefono
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      L'appuntamento resta senza link video. Puoi aggiungere un indirizzo o note operative.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setModoLink(true);
                      setForm(f => ({ ...f, default_meeting_provider: "none", default_meeting_enabled: false }));
                    }}
                    className={`rounded-lg border p-3 text-left transition hover:border-primary/60 hover:bg-primary/5 ${
                      modoLink ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "bg-background"
                    }`}
                  >
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Video className="h-4 w-4 text-primary" />
                      Link fisso
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      Sempre lo stesso link (Meet, Zoom…): arriva al cliente in conferma, promemoria ed evento.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setModoLink(false);
                      setForm(f => ({ ...f, default_meeting_provider: "google_meet", default_meeting_enabled: true }));
                    }}
                    className={`rounded-lg border p-3 text-left transition hover:border-primary/60 hover:bg-primary/5 ${
                      !modoLink && form.default_meeting_provider === "google_meet" ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "bg-background"
                    }`}
                  >
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Video className="h-4 w-4 text-primary" />
                      Google Meet automatico
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      Quando il calendario Google è collegato, EiC crea il link Meet e lo salva sull'appuntamento.
                    </p>
                  </button>
                </div>

                {modoLink && (
                  <div className="mt-3 space-y-1">
                    <Label htmlFor="cal-link-video" className="text-xs text-muted-foreground">Link della videochiamata</Label>
                    <Input id="cal-link-video" value={form.link_videochiamata} maxLength={500}
                      placeholder="https://meet.google.com/abc-defg-hij"
                      onChange={(e) => setForm(f => ({ ...f, link_videochiamata: e.target.value }))} />
                  </div>
                )}

                {!modoLink && form.default_meeting_provider === "google_meet" && (
                  <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                    Serve il collegamento Google Calendar del responsabile. Se manca, l'appuntamento resta in attesa e il link verrà creato al primo sync utile.
                  </div>
                )}
              </section>

              <section className="rounded-lg border bg-background p-4">
                <div className="mb-4 flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">5</div>
                  <div>
                    <h3 className="text-sm font-semibold">Base operativa</h3>
                    <p className="text-xs text-muted-foreground">Serve per percorsi, distanze e appuntamenti sul territorio.</p>
                  </div>
                </div>

                <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                  <AddressAutocomplete value={addressValue} onChange={handleAddressChange} />
                  {form.base_lat != null && form.base_lng != null && (
                    <AddressMapPreview
                      lat={form.base_lat}
                      lng={form.base_lng}
                      formattedAddress={form.base_formatted_address}
                    />
                  )}
                </div>
              </section>
            </div>

            <aside className="space-y-3 lg:sticky lg:top-0 lg:self-start">
              <div className="rounded-lg border bg-muted/20 p-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
                    <SelectedTypeIcon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{form.name || "Nome calendario"}</p>
                    <p className="text-xs text-muted-foreground">{selectedType.label}</p>
                  </div>
                </div>

                <div className="mt-4 space-y-2 rounded-lg border bg-background p-3 text-xs">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock3 className="h-3.5 w-3.5" />
                    <span>{form.duration_minutes || 30} min</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Globe2 className="h-3.5 w-3.5" />
                    <span className="truncate">{bookingPreviewUrl || "Link generato dal nome"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    <span className="truncate">{form.base_formatted_address || form.base_address_city || "Sede non configurata"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Video className="h-3.5 w-3.5" />
                    <span className="truncate">
                      {modoLink && form.link_videochiamata.trim()
                        ? linkCompleto(form.link_videochiamata)
                        : form.default_meeting_provider === "google_meet" ? "Google Meet automatico" : "Nessun link video automatico"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">
                      {form.external_calendar_id
                        ? `Appuntamenti in "${form.external_calendar_name || "calendario collegato"}"`
                        : "Nessun calendario esterno collegato"}
                    </span>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">Pronto al booking</span>
                    <span className="text-muted-foreground">{completedChecks}/{readinessChecks.length}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${(completedChecks / readinessChecks.length) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {readinessChecks.map((check) => (
                    <div key={check.label} className="flex items-center gap-2 text-xs">
                      {check.ok ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                      )}
                      <span className={check.ok ? "text-foreground" : "text-muted-foreground"}>{check.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
                <p className="font-medium">Dopo il salvataggio</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Apri disponibilità per impostare giorni e orari, poi condividi link diretto o codice embed.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full gap-2"
                  onClick={onAdvancedSettings}
                  disabled={!canOpenAdvancedSettings}
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  {canOpenAdvancedSettings ? "Disponibilita'" : "Salva prima il calendario"}
                </Button>
              </div>
            </aside>
          </div>

          <DialogFooter className="flex !justify-between items-center">
            <button
              type="button"
              onClick={onAdvancedSettings}
              disabled={!canOpenAdvancedSettings}
              className="flex items-center gap-1 text-sm text-primary hover:underline font-medium"
            >
              <Settings2 className="h-3.5 w-3.5" /> {canOpenAdvancedSettings ? "Impostazioni avanzate" : "Avanzate dopo il salvataggio"}
            </button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
              <Button type="submit" disabled={!form.name.trim() || isLoading}>
                {isLoading ? "Salvataggio..." : "Conferma"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
