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

export interface CalendarFormData {
  name: string;
  description: string;
  owner_id: string;
  duration_minutes: number;
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
  });

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
        ?.filter((r) => r.role === "company_admin" || r.role === "company_staff")
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
      });
      setShowDescription(!!(initialData.description));
      setDurationUnit(isHours ? "hours" : "minutes");
      setDurationValue(isHours ? mins / 60 : mins);
    } else {
      setForm({ name: "", description: "", owner_id: "", duration_minutes: 30 });
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
