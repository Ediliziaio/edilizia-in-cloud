import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useEffect } from "react";
import { Save, Loader2 } from "lucide-react";

interface FlowSettings {
  enable_reenrollment?: boolean;
  allow_multiple_opportunities?: boolean;
  stop_on_reply?: boolean;
  time_window?: boolean;
  mark_as_read?: boolean;
  timezone?: string;
  from_name?: string;
  from_email?: string;
  from_number?: string;
}

interface AutomationSettingsTabProps {
  initialSettings?: FlowSettings;
  onSave?: (settings: FlowSettings) => void;
  isSaving?: boolean;
}

const defaultSettings: FlowSettings = {
  enable_reenrollment: false,
  allow_multiple_opportunities: false,
  stop_on_reply: true,
  time_window: false,
  mark_as_read: false,
  timezone: "europe_rome",
  from_name: "",
  from_email: "",
  from_number: "",
};

export function AutomationSettingsTab({ initialSettings, onSave, isSaving }: AutomationSettingsTabProps) {
  const [settings, setSettings] = useState<FlowSettings>(() => ({
    ...defaultSettings,
    ...initialSettings,
  }));

  useEffect(() => {
    if (initialSettings) {
      setSettings(prev => ({ ...defaultSettings, ...initialSettings }));
    }
  }, [initialSettings]);

  const update = (key: keyof FlowSettings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    onSave?.(settings);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-3xl space-y-6">
      {/* Contatto */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Contatto</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 flex-1">
              <Label className="text-sm font-medium">Abilita reinserimento</Label>
              <p className="text-xs text-muted-foreground">
                Consenti ai contatti di essere reinseriti nel flusso di lavoro dopo averlo completato o essere stati rimossi.{" "}
                <button className="text-primary hover:underline text-xs">Scopri Più</button>
              </p>
            </div>
            <Switch checked={!!settings.enable_reenrollment} onCheckedChange={v => update("enable_reenrollment", v)} />
          </div>

          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 flex-1">
              <Label className="text-sm font-medium">Consenti più opportunità</Label>
              <p className="text-xs text-muted-foreground">
                Permetti al flusso di lavoro di gestire più opportunità per lo stesso contatto simultaneamente.{" "}
                <button className="text-primary hover:underline text-xs">Scopri Più</button>
              </p>
            </div>
            <Switch checked={!!settings.allow_multiple_opportunities} onCheckedChange={v => update("allow_multiple_opportunities", v)} />
          </div>

          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 flex-1">
              <Label className="text-sm font-medium">Interrompi la risposta</Label>
              <p className="text-xs text-muted-foreground">
                Interrompi automaticamente il flusso di lavoro quando il contatto risponde al messaggio.{" "}
                <button className="text-primary hover:underline text-xs">Scopri Più</button>
              </p>
            </div>
            <Switch checked={!!settings.stop_on_reply} onCheckedChange={v => update("stop_on_reply", v)} />
          </div>
        </CardContent>
      </Card>

      {/* Comunicazione */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Comunicazione</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm">Fuso orario</Label>
            <Select value={settings.timezone || "europe_rome"} onValueChange={v => update("timezone", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="europe_rome">Europe/Rome (CET +01:00)</SelectItem>
                <SelectItem value="europe_london">Europe/London (GMT +00:00)</SelectItem>
                <SelectItem value="america_new_york">America/New_York (EST -05:00)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 flex-1">
              <Label className="text-sm font-medium">Periodo di tempo - Dati specifici</Label>
              <p className="text-xs text-muted-foreground">
                Invia comunicazioni solo durante un periodo di tempo specifico.
              </p>
            </div>
            <Switch checked={!!settings.time_window} onCheckedChange={v => update("time_window", v)} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Da Nome</Label>
              <Input placeholder="Nome mittente" value={settings.from_name || ""} onChange={e => update("from_name", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Da Email</Label>
              <Input type="email" placeholder="email@esempio.com" value={settings.from_email || ""} onChange={e => update("from_email", e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Da numero</Label>
            <Select value={settings.from_number || ""} onValueChange={v => update("from_number", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Seleziona numero" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Numero predefinito</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Conversazioni */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Conversazioni</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 flex-1">
              <Label className="text-sm font-medium">Segna come letto</Label>
              <p className="text-xs text-muted-foreground">
                Segna automaticamente le conversazioni come lette quando il contatto viene inserito nel flusso.
              </p>
            </div>
            <Switch checked={!!settings.mark_as_read} onCheckedChange={v => update("mark_as_read", v)} />
          </div>
        </CardContent>
      </Card>

      {/* Salva */}
      {onSave && (
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
            Salva impostazioni
          </Button>
        </div>
      )}
    </div>
  );
}
