import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Clock, Loader2, Save } from "lucide-react";

/**
 * Configura la finestra d'invio del dispatcher cold (platform_settings →
 * key `outreach_send_window`, JSON {days,startHour,endHour,timeZone}). Il
 * dispatcher la legge a ogni tick; fuori finestra non spedisce. Default
 * Lun-Ven 8-19 Europe/Rome.
 */

const KEY = "outreach_send_window";
const DAYS = [
  { n: 1, l: "Lun" }, { n: 2, l: "Mar" }, { n: 3, l: "Mer" }, { n: 4, l: "Gio" },
  { n: 5, l: "Ven" }, { n: 6, l: "Sab" }, { n: 0, l: "Dom" },
];
interface WindowCfg { days: number[]; startHour: number; endHour: number; timeZone: string }
const DEFAULT: WindowCfg = { days: [1, 2, 3, 4, 5], startHour: 8, endHour: 19, timeZone: "Europe/Rome" };

function parseInitial(raw: string | undefined): WindowCfg {
  if (!raw) return DEFAULT;
  try {
    const o = JSON.parse(raw);
    return {
      days: Array.isArray(o.days) ? o.days.filter((d: unknown) => Number.isInteger(d)) : DEFAULT.days,
      startHour: Number.isInteger(o.startHour) ? o.startHour : DEFAULT.startHour,
      endHour: Number.isInteger(o.endHour) ? o.endHour : DEFAULT.endHour,
      timeZone: typeof o.timeZone === "string" && o.timeZone ? o.timeZone : DEFAULT.timeZone,
    };
  } catch {
    return DEFAULT;
  }
}

export function OutreachSendWindowCard() {
  const q = useQuery({
    queryKey: ["outreach-send-window"],
    queryFn: async () => {
      const { data } = await supabase.from("platform_settings").select("value").eq("key", KEY).maybeSingle();
      return (data?.value as string | null) ?? "";
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-5 w-5 text-orange-500" /> Finestra d'invio
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Il dispatcher invia solo dentro questa finestra: niente cold di notte o nel weekend → meno spam, più risposte.
        </p>
        {q.isLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          // key sui dati caricati: il form si re-inizializza dai valori salvati (niente setState in effect)
          <WindowForm key={q.data || "default"} initial={parseInitial(q.data)} />
        )}
      </CardContent>
    </Card>
  );
}

function WindowForm({ initial }: { initial: WindowCfg }) {
  const [days, setDays] = useState<number[]>(initial.days);
  const [startHour, setStartHour] = useState(initial.startHour);
  const [endHour, setEndHour] = useState(initial.endHour);
  const [tz, setTz] = useState(initial.timeZone);
  const [saving, setSaving] = useState(false);

  function toggleDay(n: number) {
    setDays((d) => (d.includes(n) ? d.filter((x) => x !== n) : [...d, n].sort((a, b) => a - b)));
  }

  async function save() {
    if (startHour >= endHour) { toast.error("L'ora di inizio dev'essere prima di quella di fine"); return; }
    if (days.length === 0) { toast.error("Seleziona almeno un giorno"); return; }
    setSaving(true);
    try {
      const value = JSON.stringify({ days, startHour, endHour, timeZone: tz.trim() || "Europe/Rome" });
      const { error } = await supabase.from("platform_settings").upsert({ key: KEY, value }, { onConflict: "key" });
      if (error) throw error;
      toast.success("Finestra d'invio salvata");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">Giorni di invio</Label>
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map((d) => (
            <Button key={d.n} type="button" size="sm" variant={days.includes(d.n) ? "default" : "outline"}
              className="h-8 w-12" onClick={() => toggleDay(d.n)}>{d.l}</Button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-24 space-y-1"><Label className="text-xs">Dalle (h)</Label>
          <Input type="number" min={0} max={23} value={startHour} onChange={(e) => setStartHour(Number(e.target.value))} className="h-9" /></div>
        <div className="w-24 space-y-1"><Label className="text-xs">Alle (h)</Label>
          <Input type="number" min={1} max={24} value={endHour} onChange={(e) => setEndHour(Number(e.target.value))} className="h-9" /></div>
        <div className="min-w-[160px] flex-1 space-y-1"><Label className="text-xs">Fuso orario</Label>
          <Input value={tz} onChange={(e) => setTz(e.target.value)} placeholder="Europe/Rome" className="h-9" /></div>
      </div>
      <Button size="sm" className="h-9 gap-2" disabled={saving} onClick={save}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salva finestra
      </Button>
    </div>
  );
}
