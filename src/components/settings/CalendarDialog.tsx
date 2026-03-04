import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info, Plus, Minus, Settings2 } from "lucide-react";
import AddressAutocomplete, { type AddressData, emptyAddress } from "@/components/shared/AddressAutocomplete";
import AddressMapPreview from "@/components/shared/AddressMapPreview";

export interface CalendarFormData {
  name: string;
  description: string;
  owner_id: string;
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
}

interface CalendarDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CalendarFormData) => void;
  onAdvancedSettings?: () => void;
  initialData?: Partial<CalendarFormData> | null;
  isLoading?: boolean;
}

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
  const [showDescription, setShowDescription] = useState(false);
  const [durationUnit, setDurationUnit] = useState<"minutes" | "hours">("minutes");
  const [durationValue, setDurationValue] = useState(30);

  const [form, setForm] = useState<CalendarFormData>({
    name: "",
    description: "",
    owner_id: "",
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

  // Fetch team members (admin + staff)
  const { data: teamMembers = [] } = useQuery({
    queryKey: ["company-team-members", effectiveCompany?.id],
    queryFn: async () => {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .eq("company_id", effectiveCompany!.id);
      if (error) throw error;

      const userIds = profiles.map((p) => p.id);
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds);

      const validUserIds = roles
        ?.filter((r) => ["company_admin", "company_staff", "salesperson", "call_center"].includes(r.role))
        .map((r) => r.user_id) || [];

      return profiles
        .filter((p) => validUserIds.includes(p.id))
        .map((p) => ({ id: p.id, name: `${p.first_name} ${p.last_name}` }));
    },
    enabled: !!effectiveCompany?.id && open,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (initialData) {
      const mins = initialData.duration_minutes || 30;
      const isHours = mins >= 60 && mins % 60 === 0;
      setForm({
        name: initialData.name || "",
        description: initialData.description || "",
        owner_id: initialData.owner_id || "",
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
      });
      setShowDescription(!!(initialData.description));
      setDurationUnit(isHours ? "hours" : "minutes");
      setDurationValue(isHours ? mins / 60 : mins);
    } else {
      setForm({ name: "", description: "", owner_id: "", duration_minutes: 30, max_daily_km: null, base_address_line: "", base_address_city: "", base_address_postal_code: "", base_address_province: "", base_address_country: "IT", base_formatted_address: "", base_lat: null, base_lng: null, base_place_id: "" });
      setShowDescription(false);
      setDurationUnit("minutes");
      setDurationValue(30);
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initialData ? "Modifica calendario" : "Nuovo calendario"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Nome del calendario */}
          <div className="space-y-2">
            <Label htmlFor="cal-name" className="flex items-center">
              Nome del calendario
              <InfoTooltip text="Inserisci un nome descrittivo per il tuo calendario. Questo verrà mostrato ai tuoi clienti." />
            </Label>
            <Input
              id="cal-name"
              value={form.name}
              onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="(es.) Portata in uscita"
              required
            />
          </div>

          {/* Toggle descrizione */}
          <button
            type="button"
            onClick={() => {
              setShowDescription(!showDescription);
              if (showDescription) setForm(f => ({ ...f, description: "" }));
            }}
            className="flex items-center gap-1 text-sm text-primary hover:underline font-medium"
          >
            {showDescription ? (
              <><Minus className="h-3.5 w-3.5" /> Rimuovi descrizione</>
            ) : (
              <><Plus className="h-3.5 w-3.5" /> Aggiungi descrizione</>
            )}
          </button>

          {/* Descrizione (collapsabile) */}
          {showDescription && (
            <div className="space-y-2">
              <Textarea
                value={form.description}
                onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Scrivi descrizione"
                rows={3}
              />
            </div>
          )}

          {/* Seleziona membro del team */}
          <div className="space-y-2">
            <Label className="flex items-center">
              Seleziona membro del team
              <InfoTooltip text="Seleziona il membro del team responsabile di questo calendario." />
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
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Durata dell'incontro */}
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
          </div>

          {/* Km massimi giornalieri */}
          <div className="space-y-2">
            <Label className="flex items-center">
              Km massimi giornalieri A/R
              <InfoTooltip text="Limite km giornalieri per questo calendario. Lascia vuoto per usare il valore globale dalle preferenze." />
            </Label>
            <Input
              type="number"
              min={1}
              value={form.max_daily_km ?? ""}
              onChange={(e) => setForm(f => ({ ...f, max_daily_km: e.target.value ? parseInt(e.target.value) : null }))}
              placeholder="Usa default globale"
            />
          </div>

          {/* Indirizzo base */}
          <div className="space-y-2">
            <Label className="flex items-center">
              Indirizzo base del calendario
              <InfoTooltip text="L'indirizzo da cui partono i calcoli di percorrenza (es. sede, ufficio, casa)" />
            </Label>
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
          </div>

          {/* Nota informativa */}
          <p className="text-xs text-muted-foreground">
            Per personalizzare ulteriormente il tuo orario di lavoro, vai alle impostazioni avanzate.
          </p>

          {/* Footer */}
          <DialogFooter className="flex !justify-between items-center">
            <button
              type="button"
              onClick={onAdvancedSettings}
              className="flex items-center gap-1 text-sm text-primary hover:underline font-medium"
            >
              <Settings2 className="h-3.5 w-3.5" /> Impostazioni avanzate
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
