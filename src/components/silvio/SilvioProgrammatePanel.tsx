/**
 * SilvioProgrammatePanel — "Attività programmate" di Silvio.
 * Promemoria/follow-up datati (silvio_reminders, status='pending'): crea (con
 * preset data + nota), completa, annulla. Alla scadenza il cron li promuove ad
 * alert (campanella + briefing). Raggruppati per urgenza (In ritardo / Oggi /
 * Prossimi) con date relative. Company-scoped via RLS; create via RPC SECURITY DEFINER.
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { CalendarClock, Check, X, Plus, Loader2, AlertTriangle } from "lucide-react";

interface Reminder {
  id: string;
  title: string;
  note: string | null;
  remind_on: string;
  status: string;
}

const todayISO = () => new Date().toISOString().slice(0, 10);
const addDaysISO = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const daysFromToday = (iso: string) => {
  const a = new Date(`${iso}T00:00:00`).getTime();
  const b = new Date(`${todayISO()}T00:00:00`).getTime();
  return Math.round((a - b) / 86_400_000);
};
const relLabel = (iso: string) => {
  const d = daysFromToday(iso);
  if (d < 0) return `In ritardo di ${-d} ${-d === 1 ? "giorno" : "giorni"}`;
  if (d === 0) return "Oggi";
  if (d === 1) return "Domani";
  if (d <= 7) return `Tra ${d} giorni`;
  return new Date(`${iso}T00:00:00`).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
};

const PRESETS: { label: string; days: number }[] = [
  { label: "Oggi", days: 0 },
  { label: "Domani", days: 1 },
  { label: "+3 giorni", days: 3 },
  { label: "Settimana", days: 7 },
  { label: "Mese", days: 30 },
];

export function SilvioProgrammatePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const qc = useQueryClient();
  const [titolo, setTitolo] = useState("");
  const [nota, setNota] = useState("");
  const [data, setData] = useState("");

  const { data: reminders = [], isLoading } = useQuery({
    queryKey: ["silvio-reminders", companyId],
    enabled: !!companyId && open,
    staleTime: 30_000,
    queryFn: async (): Promise<Reminder[]> => {
      const { data, error } = await supabase
        .from("silvio_reminders" as never)
        .select("id, title, note, remind_on, status")
        .eq("company_id", companyId)
        .eq("status", "pending")
        .order("remind_on", { ascending: true })
        .limit(100);
      if (error) return [];
      return (data ?? []) as unknown as Reminder[];
    },
  });

  const groups = useMemo(() => {
    const overdue: Reminder[] = [];
    const today: Reminder[] = [];
    const upcoming: Reminder[] = [];
    for (const r of reminders) {
      const d = daysFromToday(r.remind_on);
      if (d < 0) overdue.push(r);
      else if (d === 0) today.push(r);
      else upcoming.push(r);
    }
    return { overdue, today, upcoming };
  }, [reminders]);

  const createMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("silvio_tool_crea_promemoria" as never, {
        p_company_id: companyId,
        p_user_id: user?.id ?? null,
        p_title: titolo.trim(),
        p_note: nota.trim() || null,
        p_remind_on: data || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      setTitolo("");
      setNota("");
      setData("");
      qc.invalidateQueries({ queryKey: ["silvio-reminders", companyId] });
      qc.invalidateQueries({ queryKey: ["silvio-reminders-count"] });
      toast.success("Promemoria creato");
    },
    onError: (e: Error) => toast.error("Creazione fallita", { description: e.message }),
  });

  const statusMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("silvio_reminders" as never).update({ status } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["silvio-reminders", companyId] });
      qc.invalidateQueries({ queryKey: ["silvio-reminders-count"] });
    },
    onError: (e: Error) => toast.error("Operazione fallita", { description: e.message }),
  });

  const canAdd = !!titolo.trim() && !!data && !createMut.isPending;
  const submit = () => { if (canAdd) createMut.mutate(); };

  const Riga = ({ r, tone }: { r: Reminder; tone: "overdue" | "today" | "upcoming" }) => (
    <div className={cn("rounded-xl border p-3", tone === "overdue" ? "border-rose-200 bg-rose-50/40" : "border-slate-200")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-800">{r.title}</div>
          {r.note && <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{r.note}</div>}
          <div
            className={cn(
              "mt-1 inline-flex items-center gap-1 text-[11px] font-medium",
              tone === "overdue" ? "text-rose-600" : tone === "today" ? "text-orange-600" : "text-slate-500",
            )}
          >
            {tone === "overdue" ? <AlertTriangle className="h-3 w-3" /> : <CalendarClock className="h-3 w-3" />}
            {relLabel(r.remind_on)}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button onClick={() => statusMut.mutate({ id: r.id, status: "done" })} title="Segna come fatto"
            className="rounded-md p-1 text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-600"><Check className="h-4 w-4" /></button>
          <button onClick={() => statusMut.mutate({ id: r.id, status: "cancelled" })} title="Annulla"
            className="rounded-md p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"><X className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  );

  const Sezione = ({ titolo: t, items, tone, accent }: { titolo: string; items: Reminder[]; tone: "overdue" | "today" | "upcoming"; accent?: string }) =>
    items.length === 0 ? null : (
      <div className="space-y-1.5">
        <div className={cn("px-1 text-[11px] font-semibold uppercase tracking-wide", accent ?? "text-slate-400")}>
          {t} · {items.length}
        </div>
        {items.map((r) => <Riga key={r.id} r={r} tone={tone} />)}
      </div>
    );

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4 text-orange-500" /> Attività programmate
            {reminders.length > 0 && (
              <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                {reminders.length}
              </span>
            )}
            {groups.overdue.length > 0 && (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                {groups.overdue.length} in ritardo
              </span>
            )}
          </SheetTitle>
        </SheetHeader>
        <p className="mt-1 text-xs text-muted-foreground">
          Promemoria e follow-up datati. Alla scadenza riappaiono come avviso (campanella + briefing).
        </p>

        {/* Nuovo promemoria */}
        <div className="mt-4 space-y-2 rounded-xl border border-slate-200 p-3">
          <div className="text-xs font-medium text-slate-600">Nuovo promemoria</div>
          <Input
            value={titolo}
            onChange={(e) => setTitolo(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            placeholder="Es. Ricontrollare pagamento Rossi"
          />
          <Input
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            placeholder="Nota (opzionale) — es. fattura 2025/128, € 4.500"
            className="text-sm"
          />
          {/* Preset rapidi di data */}
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => {
              const iso = addDaysISO(p.days);
              const active = data === iso;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setData(iso)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                    active ? "border-orange-300 bg-orange-50 text-orange-700" : "border-slate-200 text-slate-600 hover:bg-slate-50",
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <Input type="date" value={data} min={todayISO()} onChange={(e) => setData(e.target.value)} className="flex-1" />
            <Button className="gap-1.5" disabled={!canAdd} onClick={submit}>
              {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Aggiungi
            </Button>
          </div>
        </div>

        {/* Lista raggruppata */}
        <div className="mt-4 flex-1 space-y-4 overflow-y-auto pb-2">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : reminders.length === 0 ? (
            <div className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
              Nessuna attività programmata. Aggiungi un promemoria o chiedi a Silvio "ricordami…".
            </div>
          ) : (
            <>
              <Sezione titolo="In ritardo" items={groups.overdue} tone="overdue" accent="text-rose-500" />
              <Sezione titolo="Oggi" items={groups.today} tone="today" accent="text-orange-500" />
              <Sezione titolo="Prossimi" items={groups.upcoming} tone="upcoming" />
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default SilvioProgrammatePanel;
