import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useUserAvailability, useSaveUserAvailability } from "@/hooks/useUserAvailability";
import type { AvailabilitySlot, AvailabilityException } from "@/hooks/useUserAvailability";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Trash2, Clock, CalendarOff, Globe, Zap, Save } from "lucide-react";

const DAYS = [
  { id: 1, label: "Lunedì", short: "Lun" },
  { id: 2, label: "Martedì", short: "Mar" },
  { id: 3, label: "Mercoledì", short: "Mer" },
  { id: 4, label: "Giovedì", short: "Gio" },
  { id: 5, label: "Venerdì", short: "Ven" },
  { id: 6, label: "Sabato", short: "Sab" },
  { id: 7, label: "Domenica", short: "Dom" },
];

const TIMEZONES = [
  { value: "Europe/Rome", label: "Roma (UTC+1/+2)" },
  { value: "Europe/London", label: "Londra (UTC+0/+1)" },
  { value: "Europe/Paris", label: "Parigi (UTC+1/+2)" },
  { value: "Europe/Berlin", label: "Berlino (UTC+1/+2)" },
  { value: "America/New_York", label: "New York (UTC-5/-4)" },
  { value: "America/Los_Angeles", label: "Los Angeles (UTC-8/-7)" },
  { value: "America/Chicago", label: "Chicago (UTC-6/-5)" },
  { value: "Asia/Dubai", label: "Dubai (UTC+4)" },
  { value: "Asia/Tokyo", label: "Tokyo (UTC+9)" },
  { value: "UTC", label: "UTC" },
];

const PRESETS: { label: string; slots: AvailabilitySlot[] }[] = [
  {
    label: "Lun–Ven 9–18",
    slots: [1, 2, 3, 4, 5].flatMap((d) => [
      { day_of_week: d, start_time: "09:00", end_time: "13:00" },
      { day_of_week: d, start_time: "14:00", end_time: "18:00" },
    ]),
  },
  {
    label: "Lun–Sab 9–18",
    slots: [1, 2, 3, 4, 5, 6].flatMap((d) => [
      { day_of_week: d, start_time: "09:00", end_time: "13:00" },
      { day_of_week: d, start_time: "14:00", end_time: "18:00" },
    ]),
  },
  {
    label: "Lun–Ven 8–17",
    slots: [1, 2, 3, 4, 5].map((d) => ({
      day_of_week: d, start_time: "08:00", end_time: "17:00",
    })),
  },
  {
    label: "24/7",
    slots: [1, 2, 3, 4, 5, 6, 7].map((d) => ({
      day_of_week: d, start_time: "00:00", end_time: "23:59",
    })),
  },
];

export function UserAvailabilityTab() {
  const { userId } = useParams<{ userId: string }>();
  const { effectiveCompany } = useAuth();
  const companyId = (effectiveCompany as any)?.id as string | undefined;
  const { toast } = useToast();

  const { data, isLoading } = useUserAvailability(userId);
  const saveMutation = useSaveUserAvailability(userId, companyId);

  const [timezone, setTimezone] = useState("Europe/Rome");
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([]);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (data && !initialized) {
      setTimezone(data.timezone);
      setSlots(data.slots);
      setExceptions(data.exceptions);
      setInitialized(true);
    }
  }, [data, initialized]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const getSlotsForDay = (day: number) => slots.filter((s) => s.day_of_week === day);
  const isDayEnabled = (day: number) => getSlotsForDay(day).length > 0;

  const toggleDay = (day: number, enabled: boolean) => {
    if (enabled) {
      setSlots((prev) => [
        ...prev,
        { day_of_week: day, start_time: "09:00", end_time: "18:00" },
      ]);
    } else {
      setSlots((prev) => prev.filter((s) => s.day_of_week !== day));
    }
  };

  const addSlotToDay = (day: number) => {
    const existing = getSlotsForDay(day);
    const lastEnd = existing[existing.length - 1]?.end_time || "09:00";
    setSlots((prev) => [
      ...prev,
      { day_of_week: day, start_time: lastEnd, end_time: "18:00" },
    ]);
  };

  const updateSlot = (day: number, index: number, field: "start_time" | "end_time", value: string) => {
    const daySlots = getSlotsForDay(day);
    const slotToUpdate = daySlots[index];
    setSlots((prev) => prev.map((s) => (s === slotToUpdate ? { ...s, [field]: value } : s)));
  };

  const removeSlotFromDay = (day: number, index: number) => {
    const daySlots = getSlotsForDay(day);
    const slotToRemove = daySlots[index];
    setSlots((prev) => prev.filter((s) => s !== slotToRemove));
  };

  const applyPreset = (presetSlots: AvailabilitySlot[]) => {
    setSlots(presetSlots);
  };

  const addException = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setExceptions((prev) => [
      ...prev,
      { exception_date: tomorrow.toISOString().split("T")[0], is_day_off: true },
    ]);
  };

  const updateException = (index: number, updates: Partial<AvailabilityException>) => {
    setExceptions((prev) => prev.map((e, i) => (i === index ? { ...e, ...updates } : e)));
  };

  const removeException = (index: number) => {
    setExceptions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    try {
      await saveMutation.mutateAsync({ timezone, slots, exceptions });
      toast({ title: "Disponibilità salvata", description: "Gli orari sono stati aggiornati." });
    } catch {
      toast({ title: "Errore", description: "Impossibile salvare la disponibilità.", variant: "destructive" });
    }
  };

  // Calculate total weekly hours
  const totalWeeklyMinutes = slots.reduce((sum, slot) => {
    const [sh, sm] = slot.start_time.split(":").map(Number);
    const [eh, em] = slot.end_time.split(":").map(Number);
    return sum + (eh * 60 + em) - (sh * 60 + sm);
  }, 0);
  const totalHours = Math.floor(totalWeeklyMinutes / 60);
  const totalMins = totalWeeklyMinutes % 60;
  const activeDaysCount = new Set(slots.map(s => s.day_of_week)).size;

  return (
    <div className="space-y-6">
      {/* Weekly Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold text-primary">{totalHours}h{totalMins > 0 ? ` ${totalMins}m` : ""}</p>
            <p className="text-xs text-muted-foreground mt-1">Ore settimanali</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold text-primary">{activeDaysCount}/7</p>
            <p className="text-xs text-muted-foreground mt-1">Giorni attivi</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold text-primary">{exceptions.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Eccezioni</p>
          </CardContent>
        </Card>
      </div>

      {/* Timezone + Presets row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Fuso Orario
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Preset Rapidi
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((preset) => (
                <Badge
                  key={preset.label}
                  variant="outline"
                  className="cursor-pointer hover:bg-accent transition-colors px-3 py-1.5"
                  onClick={() => applyPreset(preset.slots)}
                >
                  {preset.label}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Weekly Schedule */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Orari Settimanali
          </CardTitle>
          <CardDescription>Configura gli orari di disponibilità per ogni giorno.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-0">
          {DAYS.map((day, idx) => {
            const dayEnabled = isDayEnabled(day.id);
            const daySlots = getSlotsForDay(day.id);
            return (
              <div key={day.id}>
                {idx > 0 && <Separator />}
                <div className="py-3">
                  <div className="flex items-start gap-4">
                    <div className="flex items-center gap-3 w-36 shrink-0 pt-1">
                      <Switch
                        checked={dayEnabled}
                        onCheckedChange={(v) => toggleDay(day.id, v)}
                      />
                      <span className={`text-sm font-medium ${!dayEnabled ? "text-muted-foreground" : ""}`}>
                        {day.label}
                      </span>
                    </div>

                    {!dayEnabled ? (
                      <span className="text-sm text-muted-foreground pt-1">Non disponibile</span>
                    ) : (
                      <div className="flex-1 space-y-2">
                        {daySlots.map((slot, slotIdx) => (
                          <div key={slotIdx} className="flex items-center gap-2">
                            <Input
                              type="time"
                              value={slot.start_time}
                              onChange={(e) => updateSlot(day.id, slotIdx, "start_time", e.target.value)}
                              className="w-32"
                            />
                            <span className="text-muted-foreground">–</span>
                            <Input
                              type="time"
                              value={slot.end_time}
                              onChange={(e) => updateSlot(day.id, slotIdx, "end_time", e.target.value)}
                              className="w-32"
                            />
                            {daySlots.length > 1 && (
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeSlotFromDay(day.id, slotIdx)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        ))}
                        <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => addSlotToDay(day.id)}>
                          <Plus className="h-3 w-3 mr-1" />
                          Aggiungi pausa
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Exceptions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarOff className="h-4 w-4" />
              <div>
                <CardTitle>Eccezioni</CardTitle>
                <CardDescription>Giorni liberi o orari speciali per date specifiche.</CardDescription>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={addException}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Aggiungi
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {exceptions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nessuna eccezione configurata.
            </p>
          ) : (
            <div className="space-y-3">
              {exceptions.map((exc, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <Input
                        type="date"
                        value={exc.exception_date}
                        onChange={(e) => updateException(idx, { exception_date: e.target.value })}
                        className="w-40"
                      />
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={exc.is_day_off}
                          onCheckedChange={(v) => updateException(idx, {
                            is_day_off: v,
                            start_time: v ? null : "09:00",
                            end_time: v ? null : "18:00",
                          })}
                        />
                        <span className="text-sm">{exc.is_day_off ? "Giorno libero" : "Orari custom"}</span>
                      </div>
                      {!exc.is_day_off && (
                        <div className="flex items-center gap-2">
                          <Input
                            type="time"
                            value={exc.start_time || ""}
                            onChange={(e) => updateException(idx, { start_time: e.target.value })}
                            className="w-32"
                          />
                          <span className="text-muted-foreground">–</span>
                          <Input
                            type="time"
                            value={exc.end_time || ""}
                            onChange={(e) => updateException(idx, { end_time: e.target.value })}
                            className="w-32"
                          />
                        </div>
                      )}
                    </div>
                    <Input
                      placeholder="Motivo (opzionale)"
                      value={exc.reason || ""}
                      onChange={(e) => updateException(idx, { reason: e.target.value })}
                      className="max-w-xs h-8 text-sm"
                    />
                  </div>
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive shrink-0" onClick={() => removeException(idx)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Salva Disponibilità
        </Button>
      </div>
    </div>
  );
}
