import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
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

export interface CalendarFormData {
  name: string;
  description: string;
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

  const [form, setForm] = useState<CalendarFormData>({
    name: "",
    description: "",
    owner_id: "",
    calendar_type: "personal",
    booking_slug: "",
    duration_minutes: 30,
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
        owner_id: initialData.owner_id || "",
        calendar_type: initialData.calendar_type || "personal",
        booking_slug: normalizeBookingSlug(initialData.booking_slug || initialData.name || ""),
        duration_minutes: mins,
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
      });
      setShowDescription(!!(initialData.description));
      setDurationUnit(isHours ? "hours" : "minutes");
      setDurationValue(isHours ? mins / 60 : mins);
      setSlugTouched(!!initialData.booking_slug);
    } else {
      setForm({ name: "", description: "", owner_id: "", calendar_type: "personal", booking_slug: "", duration_minutes: 30, max_daily_km: null, base_address_line: "", base_address_city: "", base_address_postal_code: "", base_address_province: "", base_address_country: "IT", base_formatted_address: "", base_lat: null, base_lng: null, base_place_id: "", default_meeting_provider: "none", default_meeting_enabled: false });
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
    onSubmit(form);
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

              <section className="rounded-lg border bg-background p-4">
                <div className="mb-4 flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">3</div>
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
                    <p className="text-xs text-muted-foreground">Decidi se gli appuntamenti nascono in presenza o con link Google Meet automatico.</p>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, default_meeting_provider: "none", default_meeting_enabled: false }))}
                    className={`rounded-lg border p-3 text-left transition hover:border-primary/60 hover:bg-primary/5 ${
                      form.default_meeting_provider === "none" ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "bg-background"
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
                    onClick={() => setForm(f => ({ ...f, default_meeting_provider: "google_meet", default_meeting_enabled: true }))}
                    className={`rounded-lg border p-3 text-left transition hover:border-primary/60 hover:bg-primary/5 ${
                      form.default_meeting_provider === "google_meet" ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "bg-background"
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

                {form.default_meeting_provider === "google_meet" && (
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
                    <span>{form.default_meeting_provider === "google_meet" ? "Google Meet automatico" : "Nessun link video automatico"}</span>
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
                  Apri disponibilita' per impostare giorni e orari, poi condividi link diretto o codice embed.
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
