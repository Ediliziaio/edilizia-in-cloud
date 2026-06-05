/**
 * SilvioProgrammatePanel — "Attività programmate" di Silvio.
 * Promemoria/follow-up datati (silvio_reminders). Funzioni: crea (preset data +
 * nota + RICORRENZA), completa, posticipa (snooze), modifica inline, undo, e tab
 * STORICO con ripristino. Le RICORRENTI, alla scadenza, vengono riprogrammate
 * dal cron alla prossima occorrenza (restano pending). Company-scoped via RLS.
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { CalendarClock, Check, X, Plus, Loader2, AlertTriangle, Clock, Pencil, RotateCcw, MoreVertical, Repeat, Flag, Users } from "lucide-react";

interface Reminder {
  id: string;
  title: string;
  note: string | null;
  remind_on: string;
  status: string;
  recurrence: string | null;
  severity: string | null;
  user_id: string | null;
  remind_at: string | null;
}

interface ColCompany {
  id: string;
  first_name: string | null;
  last_name: string | null;
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
const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });

const PRESETS: { label: string; days: number }[] = [
  { label: "Oggi", days: 0 },
  { label: "Domani", days: 1 },
  { label: "+3 giorni", days: 3 },
  { label: "Settimana", days: 7 },
  { label: "Mese", days: 30 },
];
const SNOOZE: { label: string; days: number }[] = [
  { label: "Domani", days: 1 },
  { label: "Tra 3 giorni", days: 3 },
  { label: "Tra 1 settimana", days: 7 },
];
const RECURRENCE_OPTS: { value: string; label: string }[] = [
  { value: "none", label: "Mai" },
  { value: "daily", label: "Ogni giorno" },
  { value: "weekly", label: "Ogni settimana" },
  { value: "monthly", label: "Ogni mese" },
  { value: "yearly", label: "Ogni anno" },
];
const recLabel = (r?: string | null) => RECURRENCE_OPTS.find((o) => o.value === r)?.label ?? "";
const PRIORITA_OPTS: { value: string; label: string; dot: string }[] = [
  { value: "warning", label: "Normale", dot: "bg-slate-300" },
  { value: "critical", label: "Urgente", dot: "bg-rose-500" },
];
const isUrgente = (s?: string | null) => s === "critical";
const stepDate = (d: Date, rec: string) => {
  if (rec === "daily") d.setDate(d.getDate() + 1);
  else if (rec === "weekly") d.setDate(d.getDate() + 7);
  else if (rec === "monthly") d.setMonth(d.getMonth() + 1);
  else if (rec === "yearly") d.setFullYear(d.getFullYear() + 1);
};
const nextOccurrence = (iso: string, rec: string) => {
  const d = new Date(`${iso}T00:00:00`);
  const today = todayISO();
  let guard = 0;
  do {
    stepDate(d, rec);
    guard++;
  } while (d.toISOString().slice(0, 10) <= today && guard < 120 && rec !== "none");
  return d.toISOString().slice(0, 10);
};

export function SilvioProgrammatePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const qc = useQueryClient();
  const [titolo, setTitolo] = useState("");
  const [nota, setNota] = useState("");
  const [data, setData] = useState("");
  const [ricorrenza, setRicorrenza] = useState("none");
  const [priorita, setPriorita] = useState("warning");
  const [ora, setOra] = useState("");
  const [assegnatario, setAssegnatario] = useState("");
  const [tab, setTab] = useState<"todo" | "done">("todo");
  const [editId, setEditId] = useState<string | null>(null);
  const [eTitle, setETitle] = useState("");
  const [eNote, setENote] = useState("");
  const [eDate, setEDate] = useState("");

  const invalidaTutto = () => {
    qc.invalidateQueries({ queryKey: ["silvio-reminders", companyId] });
    qc.invalidateQueries({ queryKey: ["silvio-reminders-done", companyId] });
    qc.invalidateQueries({ queryKey: ["silvio-reminders-count"] });
  };

  const { data: reminders = [], isLoading } = useQuery({
    queryKey: ["silvio-reminders", companyId],
    enabled: !!companyId && open,
    staleTime: 30_000,
    queryFn: async (): Promise<Reminder[]> => {
      const { data, error } = await supabase
        .from("silvio_reminders" as never)
        .select("id, title, note, remind_on, status, recurrence, severity, user_id, remind_at")
        .eq("company_id", companyId).eq("status", "pending")
        .order("remind_on", { ascending: true }).limit(100);
      if (error) return [];
      return (data ?? []) as unknown as Reminder[];
    },
  });

  const { data: storico = [], isLoading: loadingStorico } = useQuery({
    queryKey: ["silvio-reminders-done", companyId],
    enabled: !!companyId && open && tab === "done",
    staleTime: 30_000,
    queryFn: async (): Promise<Reminder[]> => {
      const { data, error } = await supabase
        .from("silvio_reminders" as never)
        .select("id, title, note, remind_on, status, recurrence, severity, user_id, remind_at")
        .eq("company_id", companyId).in("status", ["done", "cancelled", "promoted"])
        .order("remind_on", { ascending: false }).limit(60);
      if (error) return [];
      return (data ?? []) as unknown as Reminder[];
    },
  });

  // Colleghi dell'azienda (per assegnare un promemoria a qualcun altro).
  const { data: colleghi = [] } = useQuery({
    queryKey: ["company-users-mini", companyId],
    enabled: !!companyId && open,
    staleTime: 300_000,
    queryFn: async (): Promise<ColCompany[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .eq("company_id", companyId)
        .order("first_name", { ascending: true });
      if (error) return [];
      return (data ?? []) as unknown as ColCompany[];
    },
  });
  const nomeUtente = (id?: string | null) => {
    if (!id) return "";
    const p = colleghi.find((c) => c.id === id);
    if (!p) return "";
    return [p.first_name, p.last_name].filter(Boolean).join(" ") || "Collega";
  };

  const groups = useMemo(() => {
    const overdue: Reminder[] = [], today: Reminder[] = [], upcoming: Reminder[] = [];
    for (const r of reminders) {
      const d = daysFromToday(r.remind_on);
      if (d < 0) overdue.push(r); else if (d === 0) today.push(r); else upcoming.push(r);
    }
    // Le urgenti in cima a ogni gruppo (sort stabile → preserva l'ordine per data).
    const urgPrima = (a: Reminder, b: Reminder) => (isUrgente(b.severity) ? 1 : 0) - (isUrgente(a.severity) ? 1 : 0);
    overdue.sort(urgPrima); today.sort(urgPrima); upcoming.sort(urgPrima);
    return { overdue, today, upcoming };
  }, [reminders]);

  const createMut = useMutation({
    mutationFn: async () => {
      const assignee = assegnatario || user?.id || null;
      const { data: res, error } = await supabase.rpc("silvio_tool_crea_promemoria" as never, {
        p_company_id: companyId, p_user_id: assignee,
        p_title: titolo.trim(), p_note: nota.trim() || null, p_remind_on: data || null,
      } as never);
      if (error) throw error;
      // Campi extra via UPDATE (RLS company_update). created_by sempre = creatore
      // (così resta visibile anche se assegnato ad altri). remind_at = data + ora.
      const newId = (res as { reminder_id?: string } | null)?.reminder_id;
      const patch: Record<string, unknown> = { created_by: user?.id ?? null };
      if (ricorrenza !== "none") patch.recurrence = ricorrenza;
      if (priorita !== "warning") patch.severity = priorita;
      if (ora && data) { try { patch.remind_at = new Date(`${data}T${ora}:00`).toISOString(); } catch { /* ora non valida: ignora */ } }
      if (newId) {
        await supabase.from("silvio_reminders" as never).update(patch as never).eq("id", newId);
      }
    },
    onSuccess: () => {
      setTitolo(""); setNota(""); setData(""); setRicorrenza("none"); setPriorita("warning"); setOra(""); setAssegnatario("");
      invalidaTutto();
      toast.success("Promemoria creato");
    },
    onError: (e: Error) => toast.error("Creazione fallita", { description: e.message }),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from("silvio_reminders" as never).update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidaTutto,
    onError: (e: Error) => toast.error("Operazione fallita", { description: e.message }),
  });

  const setStatus = (id: string, status: string, opts?: { undo?: boolean; label?: string }) => {
    updateMut.mutate({ id, patch: { status } });
    if (opts?.undo) {
      toast.success(opts.label ?? "Fatto", {
        action: { label: "Annulla", onClick: () => updateMut.mutate({ id, patch: { status: "pending" } }) },
      });
    }
  };
  const snooze = (id: string, days: number) => {
    const iso = addDaysISO(days);
    updateMut.mutate({ id, patch: { remind_on: iso, status: "pending" } });
    toast.success(`Posticipato a ${relLabel(iso).toLowerCase()}`);
  };
  // "Fatto": se ricorrente → riprogramma alla prossima occorrenza (resta pending); altrimenti chiude.
  const completa = (r: Reminder) => {
    if (r.recurrence && r.recurrence !== "none") {
      const next = nextOccurrence(r.remind_on, r.recurrence);
      updateMut.mutate({ id: r.id, patch: { remind_on: next } });
      toast.success(`Fatto · prossima ${relLabel(next).toLowerCase()}`, {
        action: { label: "Annulla", onClick: () => updateMut.mutate({ id: r.id, patch: { remind_on: r.remind_on } }) },
      });
    } else {
      setStatus(r.id, "done", { undo: true, label: "Segnato come fatto" });
    }
  };

  const startEdit = (r: Reminder) => { setEditId(r.id); setETitle(r.title); setENote(r.note ?? ""); setEDate(r.remind_on); };
  const cancelEdit = () => setEditId(null);
  const saveEdit = () => {
    if (!editId || !eTitle.trim() || !eDate) return;
    updateMut.mutate({ id: editId, patch: { title: eTitle.trim(), note: eNote.trim() || null, remind_on: eDate } });
    setEditId(null);
  };

  const canAdd = !!titolo.trim() && !!data && !createMut.isPending;
  const submit = () => { if (canAdd) createMut.mutate(); };

  const riga = (r: Reminder, tone: "overdue" | "today" | "upcoming" | "done") => {
    if (editId === r.id) {
      return (
        <div key={r.id} className="space-y-2 rounded-xl border border-orange-200 bg-orange-50/30 p-3">
          <Input value={eTitle} onChange={(e) => setETitle(e.target.value)} placeholder="Titolo" />
          <Input value={eNote} onChange={(e) => setENote(e.target.value)} placeholder="Nota (opzionale)" className="text-sm" />
          <div className="flex gap-2">
            <Input type="date" value={eDate} onChange={(e) => setEDate(e.target.value)} className="flex-1" />
            <Button size="sm" disabled={!eTitle.trim() || !eDate} onClick={saveEdit}>Salva</Button>
            <Button size="sm" variant="ghost" onClick={cancelEdit}>Annulla</Button>
          </div>
        </div>
      );
    }
    const done = tone === "done";
    const isRec = !!r.recurrence && r.recurrence !== "none";
    return (
      <div key={r.id} className={cn("rounded-xl border p-3", tone === "overdue" ? "border-rose-200 bg-rose-50/40" : "border-slate-200", done && "opacity-70")}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className={cn("text-sm font-medium text-slate-800", r.status === "cancelled" && "line-through")}>{r.title}</div>
            {r.note && <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{r.note}</div>}
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className={cn(
                "inline-flex items-center gap-1 text-[11px] font-medium",
                done ? "text-slate-400" : tone === "overdue" ? "text-rose-600" : tone === "today" ? "text-orange-600" : "text-slate-500",
              )}>
                {tone === "overdue" ? <AlertTriangle className="h-3 w-3" /> : <CalendarClock className="h-3 w-3" />}
                {done
                  ? `${r.status === "cancelled" ? "Annullato" : r.status === "promoted" ? "Notificato" : "Fatto"} · ${fmtDate(r.remind_on)}`
                  : relLabel(r.remind_on) + (r.remind_at ? ` · ${new Date(r.remind_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}` : "")}
              </span>
              {isRec && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-violet-600">
                  <Repeat className="h-3 w-3" /> {recLabel(r.recurrence)}
                </span>
              )}
              {isUrgente(r.severity) && (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                  <Flag className="h-2.5 w-2.5" /> Urgente
                </span>
              )}
              {r.user_id && r.user_id !== user?.id && nomeUtente(r.user_id) && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                  <Users className="h-2.5 w-2.5" /> {nomeUtente(r.user_id)}
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {done ? (
              <button onClick={() => setStatus(r.id, "pending")} title="Ripristina"
                className="rounded-md p-1 text-slate-400 transition hover:bg-orange-50 hover:text-orange-600"><RotateCcw className="h-4 w-4" /></button>
            ) : (
              <>
                <button onClick={() => completa(r)} title="Segna come fatto"
                  className="rounded-md p-1 text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-600"><Check className="h-4 w-4" /></button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button title="Altre azioni" className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel className="flex items-center gap-1.5 text-xs"><Clock className="h-3.5 w-3.5" /> Posticipa</DropdownMenuLabel>
                    {SNOOZE.map((s) => (
                      <DropdownMenuItem key={s.days} onClick={() => snooze(r.id, s.days)}>{s.label}</DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => startEdit(r)} className="gap-2"><Pencil className="h-3.5 w-3.5" /> Modifica</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setStatus(r.id, "cancelled", { undo: true, label: "Annullato" })} className="gap-2 text-rose-600">
                      <X className="h-3.5 w-3.5" /> Annulla promemoria
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  const sezione = (t: string, items: Reminder[], tone: "overdue" | "today" | "upcoming", accent?: string) =>
    items.length === 0 ? null : (
      <div className="space-y-1.5">
        <div className={cn("px-1 text-[11px] font-semibold uppercase tracking-wide", accent ?? "text-slate-400")}>{t} · {items.length}</div>
        {items.map((r) => riga(r, tone))}
      </div>
    );

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4 text-orange-500" /> Attività programmate
            {reminders.length > 0 && <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{reminders.length}</span>}
            {groups.overdue.length > 0 && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">{groups.overdue.length} in ritardo</span>}
          </SheetTitle>
        </SheetHeader>
        <p className="mt-1 text-xs text-muted-foreground">Promemoria e follow-up datati. Alla scadenza riappaiono come avviso (campanella + briefing); le ricorrenti si rinnovano da sole.</p>

        {/* Nuovo promemoria */}
        <div className="mt-4 space-y-2 rounded-xl border border-slate-200 p-3">
          <div className="text-xs font-medium text-slate-600">Nuovo promemoria</div>
          <Input value={titolo} onChange={(e) => setTitolo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} placeholder="Es. Ricontrollare pagamento Rossi" />
          <Input value={nota} onChange={(e) => setNota(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} placeholder="Nota (opzionale) — es. fattura 2025/128, € 4.500" className="text-sm" />
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => {
              const iso = addDaysISO(p.days);
              const active = data === iso;
              return (
                <button key={p.label} type="button" onClick={() => setData(iso)}
                  className={cn("rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                    active ? "border-orange-300 bg-orange-50 text-orange-700" : "border-slate-200 text-slate-600 hover:bg-slate-50")}>
                  {p.label}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-500"><Repeat className="h-3 w-3" /> Ripeti:</span>
            {RECURRENCE_OPTS.map((o) => (
              <button key={o.value} type="button" onClick={() => setRicorrenza(o.value)}
                className={cn("rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                  ricorrenza === o.value ? "border-violet-300 bg-violet-50 text-violet-700" : "border-slate-200 text-slate-600 hover:bg-slate-50")}>
                {o.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-500"><Flag className="h-3 w-3" /> Priorità:</span>
            {PRIORITA_OPTS.map((o) => (
              <button key={o.value} type="button" onClick={() => setPriorita(o.value)}
                className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                  priorita === o.value
                    ? (o.value === "critical" ? "border-rose-300 bg-rose-50 text-rose-700" : "border-slate-300 bg-slate-100 text-slate-700")
                    : "border-slate-200 text-slate-600 hover:bg-slate-50")}>
                <span className={cn("h-2 w-2 rounded-full", o.dot)} /> {o.label}
              </button>
            ))}
          </div>
          {colleghi.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-slate-500"><Users className="h-3 w-3" /> Assegna a:</span>
              <select
                value={assegnatario}
                onChange={(e) => setAssegnatario(e.target.value)}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-orange-300"
              >
                <option value="">Io</option>
                {colleghi.filter((c) => c.id !== user?.id).map((c) => (
                  <option key={c.id} value={c.id}>{[c.first_name, c.last_name].filter(Boolean).join(" ") || "Collega"}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex gap-2">
            <Input type="date" value={data} min={todayISO()} onChange={(e) => setData(e.target.value)} className="flex-1" />
            <Input type="time" value={ora} onChange={(e) => setOra(e.target.value)} className="w-28" title="Ora (opzionale)" aria-label="Ora (opzionale)" />
            <Button className="gap-1.5" disabled={!canAdd} onClick={submit}>
              {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Aggiungi
            </Button>
          </div>
        </div>

        {/* Tab Da fare / Storico */}
        <div className="mt-4 flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
          {([["todo", "Da fare"], ["done", "Storico"]] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={cn("flex-1 rounded-md px-3 py-1.5 font-medium transition", tab === key ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
              {label}{key === "todo" && reminders.length > 0 ? ` (${reminders.length})` : ""}
            </button>
          ))}
        </div>

        {/* Lista */}
        <div className="mt-3 flex-1 space-y-4 overflow-y-auto pb-2">
          {tab === "todo" ? (
            isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : reminders.length === 0 ? (
              <div className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
                Nessuna attività da fare. Aggiungi un promemoria o chiedi a Silvio "ricordami…".
              </div>
            ) : (
              <>
                {sezione("In ritardo", groups.overdue, "overdue", "text-rose-500")}
                {sezione("Oggi", groups.today, "today", "text-orange-500")}
                {sezione("Prossimi", groups.upcoming, "upcoming")}
              </>
            )
          ) : loadingStorico ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : storico.length === 0 ? (
            <div className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">Nessuna attività passata.</div>
          ) : (
            <div className="space-y-1.5">{storico.map((r) => riga(r, "done"))}</div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default SilvioProgrammatePanel;
