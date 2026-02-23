import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";

export function AutomationSettingsTab() {
  const [enableReenrollment, setEnableReenrollment] = useState(false);
  const [allowMultipleOpportunities, setAllowMultipleOpportunities] = useState(false);
  const [stopOnReply, setStopOnReply] = useState(true);
  const [timeWindow, setTimeWindow] = useState(false);
  const [markAsRead, setMarkAsRead] = useState(false);

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
            <Switch checked={enableReenrollment} onCheckedChange={setEnableReenrollment} />
          </div>

          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 flex-1">
              <Label className="text-sm font-medium">Consenti più opportunità</Label>
              <p className="text-xs text-muted-foreground">
                Permetti al flusso di lavoro di gestire più opportunità per lo stesso contatto simultaneamente.{" "}
                <button className="text-primary hover:underline text-xs">Scopri Più</button>
              </p>
            </div>
            <Switch checked={allowMultipleOpportunities} onCheckedChange={setAllowMultipleOpportunities} />
          </div>

          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 flex-1">
              <Label className="text-sm font-medium">Interrompi la risposta</Label>
              <p className="text-xs text-muted-foreground">
                Interrompi automaticamente il flusso di lavoro quando il contatto risponde al messaggio.{" "}
                <button className="text-primary hover:underline text-xs">Scopri Più</button>
              </p>
            </div>
            <Switch checked={stopOnReply} onCheckedChange={setStopOnReply} />
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
            <Select defaultValue="europe_rome">
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
            <Switch checked={timeWindow} onCheckedChange={setTimeWindow} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Da Nome</Label>
              <Input placeholder="Nome mittente" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Da Email</Label>
              <Input type="email" placeholder="email@esempio.com" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Da numero</Label>
            <Select>
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
            <Switch checked={markAsRead} onCheckedChange={setMarkAsRead} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
