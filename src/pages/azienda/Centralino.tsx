import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useSoftphoneOptional } from "@/components/telephony/SoftphoneProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PhoneCall, Phone, Delete, Loader2, ArrowUpRight, ArrowDownLeft, Settings2, History } from "lucide-react";
import { cn } from "@/lib/utils";

interface CallLog {
  id: string;
  direction: string;
  to_number: string | null;
  from_number: string | null;
  status: string;
  duration_seconds: number;
  started_at: string;
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
        .select("id, direction, to_number, from_number, status, duration_seconds, started_at")
        .eq("company_id", companyId!)
        .order("started_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as CallLog[];
    },
  });

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
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4 text-muted-foreground" /> Storico chiamate
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : logs.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-muted-foreground">
                Nessuna chiamata ancora. Le chiamate effettuate dal Centralino compaiono qui.
              </div>
            ) : (
              <ul className="divide-y">
                {logs.map((l) => {
                  const outbound = l.direction !== "inbound";
                  const num = outbound ? l.to_number : l.from_number;
                  return (
                    <li key={l.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                        outbound ? "bg-blue-50 text-blue-600" : "bg-emerald-50 text-emerald-600"
                      )}>
                        {outbound ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-sm font-medium">{num || "—"}</p>
                        <p className="text-xs text-muted-foreground">{fmtDate(l.started_at)}</p>
                      </div>
                      <div className="text-right">
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
