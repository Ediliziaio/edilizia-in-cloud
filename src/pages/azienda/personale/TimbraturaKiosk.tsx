import { useState, useEffect } from "react";
import { useMyHrProfilo, useMyTodayTimbrature, useTimbra } from "@/hooks/useTimbratura";
import { useGPS } from "@/hooks/useGPS";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { LogIn, LogOut, Coffee, Play, MapPin, Loader2, Clock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type { TimbraturaTipo } from "@/types/hr";

function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const time = now.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const date = now.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="text-center">
      <p className="text-4xl font-mono font-bold tracking-wider">{time}</p>
      <p className="text-sm text-muted-foreground capitalize mt-1">{date}</p>
    </div>
  );
}

type KioskState = "not_clocked" | "working" | "on_break";

export default function TimbraturaKiosk() {
  const companyId = useEffectiveCompanyId();
  const { data: profilo, isLoading: loadingProfilo } = useMyHrProfilo();
  const { data: timbrature = [], isLoading: loadingTimb } = useMyTodayTimbrature(profilo?.id);
  const gps = useGPS(companyId);
  const timbraMutation = useTimbra();

  // Determine state from today's timbrature
  const lastTimbratura = timbrature[timbrature.length - 1];
  const state: KioskState = !lastTimbratura
    ? "not_clocked"
    : lastTimbratura.tipo === "uscita"
    ? "not_clocked"
    : lastTimbratura.tipo === "pausa_inizio" || lastTimbratura.tipo === "inizio_pausa"
    ? "on_break"
    : "working";

  const firstEntry = timbrature.find((t) => t.tipo === "entrata");

  // Calculate worked hours
  const [workedMinutes, setWorkedMinutes] = useState(0);
  useEffect(() => {
    if (!firstEntry || state === "not_clocked") {
      setWorkedMinutes(0);
      return;
    }
    const calc = () => {
      const start = new Date(firstEntry.timestamp).getTime();
      const now = Date.now();
      // Subtract pause time
      let pauseMs = 0;
      for (let i = 0; i < timbrature.length; i++) {
        const t = timbrature[i];
        if (t.tipo === "pausa_inizio" || t.tipo === "inizio_pausa") {
          const end = timbrature.slice(i + 1).find(
            (x) => x.tipo === "pausa_fine" || x.tipo === "fine_pausa"
          );
          if (end) {
            pauseMs += new Date(end.timestamp).getTime() - new Date(t.timestamp).getTime();
          } else if (state === "on_break") {
            pauseMs += now - new Date(t.timestamp).getTime();
          }
        }
      }
      setWorkedMinutes(Math.max(0, Math.floor((now - start - pauseMs) / 60000)));
    };
    calc();
    const interval = setInterval(calc, 60000);
    return () => clearInterval(interval);
  }, [firstEntry, timbrature, state]);

  const handleTimbra = async (tipo: TimbraturaTipo) => {
    if (!profilo || !companyId) return;

    // Request GPS
    await gps.requestPosition();

    await timbraMutation.mutateAsync({
      companyId,
      profiloId: profilo.id,
      tipo,
      gps: gps.status === "success" ? gps : null,
    });

    // Feedback
    const labels: Record<string, string> = {
      entrata: "Entrata registrata",
      uscita: "Uscita registrata",
      pausa_inizio: "Pausa iniziata",
      inizio_pausa: "Pausa iniziata",
      pausa_fine: "Pausa terminata",
      fine_pausa: "Pausa terminata",
    };
    toast.success(labels[tipo] || "Timbratura registrata", {
      description: gps.in_sede
        ? `📍 ${gps.sede_nome}`
        : gps.status === "success"
        ? "⚠️ Posizione fuori sede"
        : undefined,
    });

    if ("vibrate" in navigator) navigator.vibrate([100, 50, 100]);
  };

  const hoursStr = `${Math.floor(workedMinutes / 60)}h ${workedMinutes % 60}m`;

  if (loadingProfilo || loadingTimb) {
    return (
      <div className="mx-auto w-full max-w-md space-y-4 py-6">
        <div className="flex flex-col items-center gap-3">
          <Skeleton className="h-16 w-16 rounded-full" />
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-28" />
        </div>
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-14 w-full rounded-xl" />
      </div>
    );
  }

  if (!profilo) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-3">
        <AlertTriangle className="h-12 w-12 text-amber-500" />
        <h2 className="text-lg font-semibold">Profilo HR non trovato</h2>
        <p className="text-sm text-muted-foreground">Il tuo account non è collegato a un profilo HR attivo.</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-6 py-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg"
          style={{ backgroundColor: (profilo as any).colore_avatar || "#0EA5E9" }}
        >
          {(profilo as any).nome?.[0]}{(profilo as any).cognome?.[0]}
        </div>
        <div>
          <p className="font-semibold">Ciao, {(profilo as any).nome}!</p>
          <p className="text-sm text-muted-foreground">{(profilo as any).mansione || "Dipendente"}</p>
        </div>
      </div>

      {/* Clock */}
      <Card>
        <CardContent className="py-8">
          <LiveClock />
        </CardContent>
      </Card>

      {/* Main Action Card */}
      <Card className="border-2">
        <CardContent className="py-6 space-y-4">
          {state === "not_clocked" && (
            <>
              <div className="text-center space-y-2">
                <Clock className="h-12 w-12 mx-auto text-muted-foreground/50" />
                {firstEntry ? (
                  <p className="text-sm text-muted-foreground">
                    Giornata completata — Ore lavorate: <strong>{hoursStr}</strong>
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">Pronto per iniziare la giornata</p>
                )}
              </div>
              <Button
                className="w-full h-24 md:h-16 text-xl md:text-lg"
                size="lg"
                onClick={() => handleTimbra("entrata")}
                disabled={timbraMutation.isPending}
              >
                {timbraMutation.isPending ? (
                  <Loader2 className="h-6 w-6 mr-2 animate-spin" />
                ) : (
                  <LogIn className="h-6 w-6 mr-2" />
                )}
                Timbra Entrata
              </Button>
            </>
          )}

          {state === "working" && (
            <>
              <div className="text-center space-y-1">
                <Badge variant="outline" className="text-emerald-600 border-emerald-300">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
                  In Lavoro
                </Badge>
                {firstEntry && (
                  <p className="text-sm text-muted-foreground">
                    Entrata alle {firstEntry.ora_evento?.slice(0, 5)}
                  </p>
                )}
                <p className="text-3xl font-bold">{hoursStr}</p>
                <p className="text-xs text-muted-foreground">
                  su {(profilo as any).ore_giornaliere || 8}h previste
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="destructive"
                  className="h-20 md:h-14 text-base md:text-sm"
                  onClick={() => handleTimbra("uscita")}
                  disabled={timbraMutation.isPending}
                >
                  <LogOut className="h-5 w-5 mr-2" />
                  Timbra Uscita
                </Button>
                <Button
                  variant="outline"
                  className="h-20 md:h-14 text-base md:text-sm"
                  onClick={() => handleTimbra("pausa_inizio")}
                  disabled={timbraMutation.isPending}
                >
                  <Coffee className="h-5 w-5 mr-2" />
                  Inizia Pausa
                </Button>
              </div>
            </>
          )}

          {state === "on_break" && (
            <>
              <div className="text-center space-y-1">
                <Badge variant="outline" className="text-amber-600 border-amber-300">
                  <Coffee className="h-3 w-3 mr-1" />
                  In Pausa
                </Badge>
                <p className="text-sm text-muted-foreground mt-2">
                  Pausa iniziata alle{" "}
                  {timbrature
                    .filter((t) => t.tipo === "pausa_inizio" || t.tipo === "inizio_pausa")
                    .pop()
                    ?.ora_evento?.slice(0, 5)}
                </p>
              </div>
              <Button
                className="w-full h-20 md:h-14 text-base md:text-sm"
                onClick={() => handleTimbra("pausa_fine")}
                disabled={timbraMutation.isPending}
              >
                <Play className="h-5 w-5 mr-2" />
                Fine Pausa — Riprendi
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* GPS Status */}
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <MapPin className="h-3 w-3" />
        {gps.status === "loading" && "Rilevazione GPS in corso..."}
        {gps.status === "success" && gps.in_sede && `📍 ${gps.sede_nome}`}
        {gps.status === "success" && !gps.in_sede && `⚠️ Fuori sede${gps.address ? ` — ${gps.address}` : ""}`}
        {gps.status === "denied" && "GPS non disponibile"}
        {gps.status === "error" && "Errore GPS"}
        {gps.status === "idle" && "GPS pronto"}
      </div>

      {/* Today Summary */}
      {timbrature.length > 0 && (
        <Card>
          <CardContent className="py-3">
            <p className="text-xs font-semibold text-muted-foreground mb-2">TIMBRATURE OGGI</p>
            <div className="space-y-1">
              {timbrature.map((t) => (
                <div key={t.id} className="flex items-center justify-between text-sm">
                  <span className="capitalize">{t.tipo.replace("_", " ")}</span>
                  <span className="text-muted-foreground">{t.ora_evento?.slice(0, 5)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
