import { useState, useMemo } from "react";
import { useCentralinoCalls } from "@/hooks/useCentralinoCalls";
import { Link } from "react-router-dom";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useSoftphoneOptional } from "@/components/telephony/SoftphoneProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Phone, Delete, Loader2, ArrowUpRight, ArrowDownLeft, Settings2, History, User, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { CentralinoCallHistory } from "@/components/telephony/CentralinoCallHistory";
import { DisponibilitaOperatore } from "@/components/telephony/DisponibilitaOperatore";

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

  const { data: logs = [] } = useCentralinoCalls();

  const stats = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let totalSec = 0, todayCount = 0, completed = 0;
    for (const l of logs) {
      totalSec += l.seconds || 0;
      if (["completed","completata"].includes(l.status)) completed++;
      if (new Date(l.date) >= today) todayCount++;
    }
    return { total: logs.length, todayCount, completed, totalSec };
  }, [logs]);

  const callBusy = softphone?.status && softphone.status !== "idle";
  const canCall = !!softphone && !!number.trim() && !callBusy;

  const press = (d: string) => setNumber((n) => (n + d).slice(0, 20));
  const backspace = () => setNumber((n) => n.slice(0, -1));
  const call = () => {
    const n = number.trim();
    if (!n) return;
    softphone?.startCall(n);
  };

  return (
    // Telefono: il centralino si usa (disponibilità, tastierino, storico);
    // numeri e agenti si impostano da computer o tablet.
    // Da 768 a tutta larghezza come le altre pagine: a 1440 la colonna da
    // 1024px centrata lasciava due fasce vuote e il titolo fuori allineamento.
    <div className="mx-auto max-w-5xl space-y-6 md:max-w-none max-md:space-y-3">
      {/* Header — titolo e «Numeri & agenti» sulla stessa riga: la frase sotto
          il titolo (e l'icona) a 1024 mandava il bottone a capo, a sinistra. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold max-md:text-lg">Centralino</h1><p className="mt-1 text-sm text-muted-foreground">Persone e agenti AI, con lo stesso storico e le anagrafiche del gestionale.</p>
        </div>
        <Button asChild variant="outline" size="sm" className="gap-1.5 max-md:hidden">
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
      {/* Telefono: i quattro numeri su una riga sola, con «Durata» al posto di
          «Tempo totale» che nella casella stretta verrebbe tagliato. */}
      <div className="grid grid-cols-4 gap-3 max-md:gap-1.5">
        {[
          { label: "Chiamate recenti", value: String(stats.total) },
          { label: "Oggi", value: String(stats.todayCount) },
          { label: "Completate", value: String(stats.completed) },
          { label: "Tempo totale", breve: "Durata", value: fmtDur(stats.totalSec) },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="py-3 max-md:px-2 max-md:py-1.5">
              <p className="text-2xl font-bold tabular-nums max-md:text-base">{s.value}</p>
              <p className="text-xs text-muted-foreground max-md:truncate max-md:text-[11px]">
                {s.breve ? (
                  <>
                    <span className="max-md:hidden">{s.label}</span>
                    <span className="md:hidden">{s.breve}</span>
                  </>
                ) : (
                  s.label
                )}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-[320px_1fr] max-md:grid-cols-1 max-md:gap-3">
        <div className="space-y-6 max-md:space-y-3">
        {/* Disponibilità: decide se l'assistente può passare una chiamata a una persona */}
        <DisponibilitaOperatore />

        {/* Dialer */}
        <Card>
          <CardHeader className="pb-2 max-md:p-3 max-md:pb-1">
            <CardTitle className="text-base max-md:text-sm">Tastierino</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 max-md:space-y-2.5 max-md:p-3 max-md:pt-0">
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
                  className="h-12 text-lg font-medium max-md:h-11"
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
        </div>

        <Card className="min-w-0"><CardContent className="p-5 max-md:p-3"><CentralinoCallHistory /></CardContent></Card>
      </div>
    </div>
  );
}
