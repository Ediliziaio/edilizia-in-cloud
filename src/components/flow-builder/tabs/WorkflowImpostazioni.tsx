import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Save, Users, Mail, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { indirizzoMittenteValido } from "../../../../supabase/functions/_shared/mittenteAutomazione";

interface Props {
  flowId?: string;
}

export function WorkflowImpostazioni({ flowId }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Record<string, any>>({});
  const [isDirty, setIsDirty] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["flow-settings", flowId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("automation_flows")
        .select("company_id, allow_reentry, allow_multiple_opportunities, stop_on_reply, stop_on_won_pipeline_id, timezone, time_window_active, time_window_from, time_window_to, sender_name, sender_email")
        .eq("id", flowId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!flowId,
  });

  // Pipeline dell'azienda del flusso, per «Fermati quando diventa cliente».
  const { data: pipelines = [] } = useQuery({
    queryKey: ["flow-settings-pipelines", settings?.company_id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("marketing_pipelines")
        .select("id, name")
        .eq("company_id", settings!.company_id)
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
    enabled: !!settings?.company_id,
    staleTime: 5 * 60 * 1000,
  });

  const handleChange = (key: string, val: any) => {
    setForm((prev) => ({ ...prev, [key]: val }));
    setIsDirty(true);
  };

  const get = (key: string, fallback: any = false) =>
    key in form ? form[key] : settings?.[key] ?? fallback;

  const salva = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("automation_flows")
        .update(form)
        .eq("id", flowId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["flow-settings", flowId] });
      setForm({});
      setIsDirty(false);
    },
  });

  if (!flowId) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
        Salva il flusso per configurare le impostazioni.
      </div>
    );
  }

  if (isLoading) {
    return <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">Caricamento...</div>;
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Impostazioni Flusso di lavoro</h2>
          <p className="text-sm text-muted-foreground">Configura comportamento, comunicazione e accesso</p>
        </div>
        {isDirty && (
          <Button size="sm" onClick={() => salva.mutate()} disabled={salva.isPending}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {salva.isPending ? "Salvo..." : "Salva modifiche"}
          </Button>
        )}
      </div>

      {/* Contact section */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Contatto</h3>
        </div>
        <div className="space-y-4 pl-6">
          <ToggleSetting
            titolo="Consenti re-iscrizione"
            descrizione="I contatti possono entrare nuovamente nel flusso dopo averlo completato."
            valore={get("allow_reentry", true)}
            onChange={(v) => handleChange("allow_reentry", v)}
          />
          <ToggleSetting
            titolo="Consenti più opportunità"
            descrizione="Un contatto può essere associato a più opportunità contemporaneamente."
            valore={get("allow_multiple_opportunities", true)}
            onChange={(v) => handleChange("allow_multiple_opportunities", v)}
          />
          <ToggleSetting
            titolo="Interrompi su risposta"
            descrizione="Si ferma se il contatto risponde a un'email, o se sposti la sua scheda oltre la prima fase della pipeline: da lì te ne occupi tu (WhatsApp, chiamata, appuntamento)."
            valore={get("stop_on_reply", false)}
            onChange={(v) => handleChange("stop_on_reply", v)}
          />
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Fermati quando diventa cliente</Label>
            <Select
              value={get("stop_on_won_pipeline_id", null) || "__mai__"}
              onValueChange={(v) => handleChange("stop_on_won_pipeline_id", v === "__mai__" ? null : v)}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__mai__">No, continua comunque</SelectItem>
                {pipelines.map((p) => (
                  <SelectItem key={p.id} value={p.id}>Vinta in «{p.name}»</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Il contatto esce dal flusso appena ha un'opportunità vinta in questa pipeline: un cliente non riceve più email di vendita.
            </p>
          </div>
        </div>
      </section>

      {/* Communication section */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Comunicazione</h3>
        </div>
        <div className="space-y-4 pl-6">
          <div className="space-y-1.5">
            <Label className="text-xs">Fuso orario</Label>
            <Select value={get("timezone", "account")} onValueChange={(v) => handleChange("timezone", v)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="account">Fuso orario Account</SelectItem>
                <SelectItem value="contact">Fuso orario Contatto</SelectItem>
                <SelectItem value="Europe/Rome">Europa/Roma (CET)</SelectItem>
                <SelectItem value="America/New_York">America/New York (ET)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Le esecuzioni dei passaggi di attesa seguiranno questo fuso orario.
            </p>
          </div>

          {/* Time window */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Finestra oraria</Label>
              <Switch
                checked={get("time_window_active", false)}
                onCheckedChange={(v) => handleChange("time_window_active", v)}
              />
            </div>
            {get("time_window_active", false) && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Dalle</Label>
                  <Input
                    type="time"
                    value={get("time_window_from", "09:00")}
                    onChange={(e) => handleChange("time_window_from", e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Alle</Label>
                  <Input
                    type="time"
                    value={get("time_window_to", "18:00")}
                    onChange={(e) => handleChange("time_window_to", e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Sender */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
              <Label className="text-xs">Dettagli mittente email</Label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                placeholder="Nome mittente"
                value={get("sender_name", "")}
                onChange={(e) => handleChange("sender_name", e.target.value)}
                className="h-9"
              />
              <Input
                type="email"
                placeholder="Email mittente"
                value={get("sender_email", "")}
                onChange={(e) => handleChange("sender_email", e.target.value)}
                className="h-9"
              />
            </div>
            {String(get("sender_email", "")).trim() && !indirizzoMittenteValido(get("sender_email", "")) ? (
              <p className="text-[11px] font-medium text-destructive">
                Indirizzo non valido: le email partiranno dall'indirizzo dell'azienda.
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Vale per le email che non hanno un mittente sul passo. Con il solo nome, partono dall'indirizzo dell'azienda con questo nome.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function ToggleSetting({
  titolo,
  descrizione,
  valore,
  onChange,
}: {
  titolo: string;
  descrizione: string;
  valore: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <Switch checked={valore} onCheckedChange={onChange} className="mt-0.5" />
      <div>
        <p className="text-sm font-medium">{titolo}</p>
        <p className="text-xs text-muted-foreground">{descrizione}</p>
      </div>
    </div>
  );
}
