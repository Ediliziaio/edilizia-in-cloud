import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useSoftphoneOptional } from "@/components/telephony/SoftphoneProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PhoneCall, Phone, Delete, Loader2, ArrowUpRight, ArrowDownLeft, Settings2, History, User, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface CallLog {
  id: string;
  direction: string;
  to_number: string | null;
  from_number: string | null;
  status: string;
  duration_seconds: number;
  started_at: string;
  user_name: string | null;
  contact_name: string | null;
  contact_id: string | null;
  recording_url: string | null;
}

const PAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

function fmtDur(s: number) {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

export default function Centralino() {
  const companyId = useEffectiveCompanyId();
  const softphone = useSoftphoneOptional();
  const [number, setNumber] = useState("");

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["human-call-logs", companyId],
    enabled: !!companyId,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("human_call_logs" as never)
        .select("id, direction, to_number, from_number, status, duration_seconds, started_at, user_name, contact_name, contact_id, recording_url")
        .eq("company_id", companyId!)
        .order("started_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as CallLog[];
    },
  });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const stats = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let totalSec = 0, todayCount = 0, completed = 0;
    for (const l of logs) {
      totalSec += l.duration_seconds || 0;
      if (l.status === "completed") completed++;
      if (new Date(l.started_at) >= today) todayCount++;
    }
    return { total: logs.length, todayCount, completed, totalSec };
  }, [logs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((l) => {
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (!q) return true;
      return (l.to_number || "").toLowerCase().includes(q)
        || (l.contact_name || "").toLowerCase().includes(q)
        || (l.user_name || "").toLowerCase().includes(q);
    });
  }, [logs, search, statusFilter]);

  const callBusy = softphone?.status && softphone.status !== "idle";
  const canCall = !!number.trim() && !callBusy;

  const press = (d: string) => setNumber((n) => (n + d).slice(0, 20));
  const backspace = () => setNumber((n) => n.slice(0, -1));
  const call = () => {
    const n = number.trim();
    if (!n) return;
    softphone?.startCall(n);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <PhoneCall className="h-5 w-5 text-primary" />
            Centralino
          </h1>
          <p className="text-sm text-muted-foreground">
            Chiama e parla direttamente dal gestionale, col numero aziendale. Storico chiamate incluso.
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link to="/azienda/agenti-ai?tab=telefonia">
            <Settings2 className="h-4 w-4" /> Numeri & agenti
          </Link>
        </Button>
      </div>

      {!softphone && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="py-3 text-sm text-amber-900">
            La centralina non è attiva in questo contesto. Apri il Centralino dall'area azienda.
          </CardContent>
        </Card>
      )}

      {/* Statistiche */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Chiamate", value: String(stats.total) },
          { label: "Oggi", value: String(stats.todayCount) },
          { label: "Completate", value: String(stats.completed) },
          { label: "Tempo totale", value: fmtDur(stats.totalSec) },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="py-3">
              <p className="text-2xl font-bold tabular-nums">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-[320px_1fr]">
        {/* Dialer */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Tastierino</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Input
                value={number}
                onChange={(e) => setNumber(e.target.value.replace(/[^\d+*#]/g, "").slice(0, 20))}
                placeholder="+39…"
                className="text-center text-lg font-mono tracking-wide"
                inputMode="tel"
                onKeyDown={(e) => { if (e.key === "Enter" && canCall) call(); }}
              />
              <Button variant="ghost" size="icon" onClick={backspace} disabled={!number} aria-label="Cancella">
                <Delete className="h-5 w-5" />
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {PAD.map((d) => (
                <Button
                  key={d}
                  variant="outline"
                  className="h-12 text-lg font-medium"
                  onClick={() => press(d)}
                >
                  {d}
                </Button>
              ))}
            </div>

            <Button className="h-12 w-full gap-2 text-base" onClick={call} disabled={!canCall}>
              {callBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Phone className="h-5 w-5" />}
              {callBusy ? "Chiamata in corso" : "Chiama"}
            </Button>
          </CardContent>
        </Card>

        {/* Storico */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-4 w-4 text-muted-foreground" /> Storico chiamate
              </CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cerca numero, contatto, operatore…"
                    className="h-8 w-48 pl-8 text-xs"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutti gli esiti</SelectItem>
                    <SelectItem value="completed">Completate</SelectItem>
                    <SelectItem value="active">In corso</SelectItem>
                    <SelectItem value="failed">Fallite</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <ul className="divide-y">
                {Array.from({ length: 6 }).map((_, i) => (
                  <li key={i} className="flex items-center gap-3 px-4 py-2.5">
                    <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-2/5" />
                      <Skeleton className="h-3 w-3/5" />
                    </div>
                    <Skeleton className="h-5 w-16 shrink-0" />
                  </li>
                ))}
              </ul>
            ) : filtered.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-muted-foreground">
                {logs.length === 0
                  ? "Nessuna chiamata ancora. Le chiamate effettuate dal Centralino compaiono qui."
                  : "Nessun risultato per i filtri selezionati."}
              </div>
            ) : (
              <ul className="divide-y">
                {filtered.map((l) => {
                  const outbound = l.direction !== "inbound";
                  const num = outbound ? l.to_number : l.from_number;
                  const title = l.contact_name || num || "—";
                  return (
                    <li key={l.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                        outbound ? "bg-blue-50 text-blue-600" : "bg-emerald-50 text-emerald-600"
                      )}>
                        {outbound ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{title}</p>
                        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                          {l.contact_name && num && <span className="font-mono">{num}</span>}
                          {l.user_name && (
                            <span className="inline-flex items-center gap-0.5"><User className="h-3 w-3" />{l.user_name}</span>
                          )}
                          <span>{fmtDate(l.started_at)}</span>
                        </p>
                      </div>
                      {l.recording_url && (
                        <audio controls preload="none" src={l.recording_url} className="h-8 w-36 shrink-0" />
                      )}
                      <div className="shrink-0 text-right">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px]",
                            l.status === "completed" && "border-emerald-200 text-emerald-700",
                            l.status === "active" && "border-blue-200 text-blue-700",
                            l.status === "failed" && "border-destructive/30 text-destructive",
                          )}
                        >
                          {l.status === "completed" ? "Completata" : l.status === "active" ? "In corso" : l.status === "failed" ? "Fallita" : l.status}
                        </Badge>
                        <p className="mt-0.5 text-xs text-muted-foreground">{fmtDur(l.duration_seconds)}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
