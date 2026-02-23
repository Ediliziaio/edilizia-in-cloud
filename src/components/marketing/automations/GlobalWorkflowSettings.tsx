import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { Mail, Plus, RotateCcw, Trash2, CalendarClock } from "lucide-react";

interface PauseSchedule {
  id: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  workflows: string[];
  annually: boolean;
}

export function GlobalWorkflowSettings() {
  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const [notifyUser, setNotifyUser] = useState("");
  const [notifySubAdmins, setNotifySubAdmins] = useState(false);
  const [notifySubUsers, setNotifySubUsers] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [pauseSchedules, setPauseSchedules] = useState<PauseSchedule[]>([
    { id: crypto.randomUUID(), startDate: "", startTime: "00:00", endDate: "", endTime: "23:59", workflows: [], annually: false },
  ]);

  const addSchedule = () => {
    if (pauseSchedules.length >= 15) {
      toast({ title: "Limite raggiunto", description: "Massimo 15 date di sospensione.", variant: "destructive" });
      return;
    }
    setPauseSchedules(prev => [...prev, {
      id: crypto.randomUUID(), startDate: "", startTime: "00:00", endDate: "", endTime: "23:59", workflows: [], annually: false,
    }]);
  };

  const removeSchedule = (id: string) => {
    setPauseSchedules(prev => prev.filter(s => s.id !== id));
  };

  const updateSchedule = (id: string, field: keyof PauseSchedule, value: any) => {
    setPauseSchedules(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const handleSaveReminders = () => {
    toast({ title: "Impostazioni promemoria salvate" });
  };

  const handleSavePause = () => {
    const invalid = pauseSchedules.some(s => !s.startDate || !s.endDate);
    if (invalid) {
      toast({ title: "Errore", description: "Compila tutte le date di inizio e fine.", variant: "destructive" });
      return;
    }
    toast({ title: "Impostazioni sospensione salvate" });
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Promemoria */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Promemoria</CardTitle>
            <Switch checked={remindersEnabled} onCheckedChange={setRemindersEnabled} />
          </div>
        </CardHeader>
        {remindersEnabled && (
          <CardContent className="space-y-4">
            <Card className="border-dashed">
              <CardContent className="pt-4 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Mail className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-medium text-sm">Notifica Email</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Invia notifiche email agli utenti selezionati quando un flusso di lavoro richiede attenzione.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Seleziona Utente</Label>
                  <Select value={notifyUser} onValueChange={setNotifyUser}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Seleziona Utente" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tutti gli utenti</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox checked={notifySubAdmins} onCheckedChange={(v) => setNotifySubAdmins(!!v)} />
                    <Label className="text-xs font-normal">Amministratori di account secondari</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox checked={notifySubUsers} onCheckedChange={(v) => setNotifySubUsers(!!v)} />
                    <Label className="text-xs font-normal">Utenti di account secondari</Label>
                  </div>
                </div>

                <Button size="sm" onClick={handleSaveReminders}>Salva</Button>
              </CardContent>
            </Card>
          </CardContent>
        )}
      </Card>

      {/* Salvataggio automatico */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Salvataggio automatico</CardTitle>
              <CardDescription className="text-xs mt-1">
                Salva automaticamente le modifiche durante la modifica della bozza del flusso di lavoro.
                Quando abilitato, tutte le modifiche apportate ai flussi in stato bozza verranno salvate automaticamente.
              </CardDescription>
            </div>
            <Switch checked={autoSaveEnabled} onCheckedChange={setAutoSaveEnabled} />
          </div>
        </CardHeader>
      </Card>

      {/* Sospendi Flusso di lavoro */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle className="text-base">Sospendi il Flusso di lavoro</CardTitle>
              <CardDescription className="text-xs mt-1">
                Metti temporaneamente in pausa i flussi di lavoro selezionati durante periodi specifici (es. festività, manutenzione).
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Quando sospendere il Flusso di lavoro?</Label>
            <span className="text-xs text-muted-foreground">
              Sospendi le date: {pauseSchedules.length}/15
            </span>
          </div>

          <div className="space-y-3">
            {pauseSchedules.map((schedule, idx) => (
              <div key={schedule.id} className="flex items-end gap-2 p-3 border rounded-lg bg-muted/20">
                <div className="grid grid-cols-2 gap-2 flex-1">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Data inizio</Label>
                    <Input
                      type="date"
                      value={schedule.startDate}
                      onChange={e => updateSchedule(schedule.id, "startDate", e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Ora inizio</Label>
                    <Input
                      type="time"
                      value={schedule.startTime}
                      onChange={e => updateSchedule(schedule.id, "startTime", e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Data fine</Label>
                    <Input
                      type="date"
                      value={schedule.endDate}
                      onChange={e => updateSchedule(schedule.id, "endDate", e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Ora fine</Label>
                    <Input
                      type="time"
                      value={schedule.endTime}
                      onChange={e => updateSchedule(schedule.id, "endTime", e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
                <div className="flex flex-col items-center gap-1.5 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <Checkbox
                      checked={schedule.annually}
                      onCheckedChange={(v) => updateSchedule(schedule.id, "annually", !!v)}
                    />
                    <span className="text-xs">Annualmente</span>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => updateSchedule(schedule.id, "startDate", "")}>
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeSchedule(schedule.id)} disabled={pauseSchedules.length <= 1}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <Button variant="outline" size="sm" onClick={addSchedule}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Aggiungi data
          </Button>

          <Separator />

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">• La differenza massima tra data di inizio e fine è di 15 giorni.</p>
            <p className="text-xs text-muted-foreground">• Le date di sospensione non possono sovrapporsi.</p>
          </div>

          <Button size="sm" onClick={handleSavePause}>Salva</Button>
        </CardContent>
      </Card>
    </div>
  );
}
