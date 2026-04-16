/**
 * Timbratura GPS per operai e subappaltatori.
 * Flusso: Entrata → Pausa inizio → Pausa fine → Uscita
 * Storico ultimi 14 giorni.
 */
import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, differenceInMinutes, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import {
  LogIn, LogOut, Coffee,
  CheckCircle, Loader2, AlertCircle, Navigation, PauseCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useGPS } from "@/hooks/useGPS";
import { useMyHrProfilo } from "@/hooks/useTimbratura";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type TipoTimbratura = "entrata" | "uscita" | "pausa_inizio" | "pausa_fine";

interface Timbratura {
  id: string;
  tipo: TipoTimbratura;
  timestamp_evento: string;
  lat?: number;
  lng?: number;
  indirizzo?: string;
  fonte: string;
}

export default function CampoTimbratura() {
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const companyId = (profile as any)?.company_id ?? null;
  const { lat, lng, accuracy, address, status: gpsStatus, requestPosition } = useGPS(companyId);
  // Profilo HR — usato per sincronizzare la timbratura anche in hr_timbrature
  const { data: hrProfilo } = useMyHrProfilo();
  const profiloId = hrProfilo?.id ?? null;

  // Request GPS on mount — requestPosition è useCallback con dep [companyId].
  // Depend solo su companyId per evitare ri-chiamate a ogni re-render.
  useEffect(() => {
    if (companyId) requestPosition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  // Today's timbrature
  const today = format(new Date(), "yyyy-MM-dd");

  const { data: timbratureOggi = [], isLoading: loadingOggi } = useQuery({
    queryKey: ["campo-timbrature-oggi", user?.id, today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campo_timbrature")
        .select("*")
        .eq("user_id", user!.id)
        .gte("timestamp_evento", `${today}T00:00:00`)
        .lte("timestamp_evento", `${today}T23:59:59`)
        .order("timestamp_evento", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Timbratura[];
    },
    enabled: !!user?.id,
  });

  // Storico 14 giorni
  const { data: storico = [] } = useQuery({
    queryKey: ["campo-timbrature-storico", user?.id],
    queryFn: async () => {
      const from = new Date();
      from.setDate(from.getDate() - 14);
      const { data, error } = await supabase
        .from("campo_timbrature")
        .select("*")
        .eq("user_id", user!.id)
        .gte("timestamp_evento", from.toISOString())
        .order("timestamp_evento", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Timbratura[];
    },
    enabled: !!user?.id,
  });

  // Determine current state
  const lastTimbro = timbratureOggi[timbratureOggi.length - 1];
  const isInPausa = lastTimbro?.tipo === "pausa_inizio";
  const isActive = lastTimbro?.tipo === "entrata" || lastTimbro?.tipo === "pausa_fine";
  const isUscito = lastTimbro?.tipo === "uscita";

  // Compute ore lavorate
  let oreLavorate = 0;
  let minutiPausa = 0;
  for (let i = 0; i < timbratureOggi.length - 1; i++) {
    const curr = timbratureOggi[i];
    const next = timbratureOggi[i + 1];
    if (curr.tipo === "pausa_inizio" && next.tipo === "pausa_fine") {
      minutiPausa += differenceInMinutes(
        parseISO(next.timestamp_evento),
        parseISO(curr.timestamp_evento)
      );
    }
  }
  const entrata = timbratureOggi.find(t => t.tipo === "entrata");
  const uscita = timbratureOggi.find(t => t.tipo === "uscita");
  if (entrata) {
    const end = uscita ? parseISO(uscita.timestamp_evento) : new Date();
    oreLavorate = Math.max(0, differenceInMinutes(end, parseISO(entrata.timestamp_evento)) - minutiPausa) / 60;
  }

  const timbraMutation = useMutation({
    mutationFn: async (tipo: TipoTimbratura) => {
      const gpsReady = gpsStatus === "success";
      const now = new Date().toISOString();
      const { error } = await supabase.from("campo_timbrature").insert({
        user_id: user!.id,
        company_id: companyId,
        tipo,
        timestamp_evento: now,
        gps_lat: gpsReady ? lat : null,
        gps_lng: gpsReady ? lng : null,
        gps_accuracy: gpsReady ? Math.round(accuracy) : null,
        note: address ? `GPS: ${address}` : null,
        fonte: "app",
      });
      if (error) throw error;

      // Sincronizzazione NON BLOCCANTE con hr_timbrature (se l'operaio ha un profilo HR)
      if (profiloId && companyId) {
        try {
          await supabase.from("hr_timbrature").insert({
            company_id: companyId,
            profilo_id: profiloId,
            tipo: tipo as any,
            timestamp: now,
            data_evento: now.slice(0, 10),
            ora_evento: now.slice(11, 19),
            lat: gpsReady ? lat : null,
            lng: gpsReady ? lng : null,
            fonte: "app",
            note: address ? `GPS: ${address}` : null,
          } as any);
        } catch (hrErr) {
          // Non bloccante: la timbratura campo è già avvenuta
          console.warn("[CampoTimbratura] hr_timbrature sync failed:", hrErr);
        }
      }
    },
    onSuccess: (_, tipo) => {
      const labels: Record<TipoTimbratura, string> = {
        entrata: "Entrata registrata",
        uscita: "Uscita registrata",
        pausa_inizio: "Pausa iniziata",
        pausa_fine: "Pausa terminata",
      };
      toast.success(labels[tipo]);
      qc.invalidateQueries({ queryKey: ["campo-timbrature-oggi"] });
      qc.invalidateQueries({ queryKey: ["campo-timbrature-storico"] });
    },
    onError: () => toast.error("Errore durante la timbratura"),
  });

  const getNextAction = (): { tipo: TipoTimbratura; label: string; icon: typeof LogIn; color: string } | null => {
    if (!lastTimbro || lastTimbro.tipo === "uscita") {
      if (!entrata) return { tipo: "entrata", label: "TIMBRA ENTRATA", icon: LogIn, color: "bg-green-500" };
      return null;
    }
    if (lastTimbro.tipo === "entrata" || lastTimbro.tipo === "pausa_fine") {
      return { tipo: "pausa_inizio", label: "INIZIA PAUSA", icon: Coffee, color: "bg-primary" };
    }
    if (lastTimbro.tipo === "pausa_inizio") {
      return { tipo: "pausa_fine", label: "FINE PAUSA", icon: PauseCircle, color: "bg-primary" };
    }
    return null;
  };

  const nextAction = getNextAction();
  const canExit = (isActive || isInPausa) && !isUscito;

  // Group storico by day
  const storicoByDay: Record<string, Timbratura[]> = {};
  storico.forEach(t => {
    const day = format(parseISO(t.timestamp_evento), "yyyy-MM-dd");
    if (!storicoByDay[day]) storicoByDay[day] = [];
    storicoByDay[day].push(t);
  });

  return (
    <div className="flex flex-col h-full pb-24">
      {/* GPS Status bar */}
      <div className={cn(
        "flex items-center gap-2 px-4 py-2 text-xs",
        gpsStatus === "success" ? "bg-green-50 text-green-600" :
        gpsStatus === "loading" ? "bg-muted text-muted-foreground" :
        gpsStatus === "denied" ? "bg-red-50 text-red-600" :
        "bg-muted text-muted-foreground"
      )}>
        <Navigation className="w-3.5 h-3.5" />
        {gpsStatus === "success" && <span>GPS attivo — precisione {Math.round(accuracy)}m{address ? ` · ${address}` : ""}</span>}
        {gpsStatus === "loading" && <span>Acquisizione GPS...</span>}
        {gpsStatus === "denied" && <span>GPS negato — timbratura senza posizione</span>}
        {gpsStatus === "idle" && <span>GPS non attivo</span>}
        {gpsStatus === "error" && <span>Errore GPS — timbratura senza posizione</span>}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

        {/* Ore lavorate oggi */}
        <div className="bg-muted border border-border rounded-2xl p-5">
          <p className="text-xs text-muted-foreground mb-1">Oggi — {format(new Date(), "EEEE d MMMM", { locale: it })}</p>
          <div className="flex items-end gap-2">
            <span className="text-4xl font-bold text-foreground">{oreLavorate.toFixed(1)}</span>
            <span className="text-lg text-muted-foreground mb-1">h lavorate</span>
          </div>
          {minutiPausa > 0 && (
            <p className="text-xs text-muted-foreground mt-1">{minutiPausa} min pausa</p>
          )}

          {/* Timeline oggi */}
          {timbratureOggi.length > 0 && (
            <div className="mt-4 space-y-2">
              {timbratureOggi.map((t) => (
                <div key={t.id} className="flex items-center gap-3">
                  <div className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    t.tipo === "entrata" ? "bg-green-400" :
                    t.tipo === "uscita" ? "bg-red-400" :
                    "bg-primary"
                  )} />
                  <div className="flex-1 flex items-center justify-between">
                    <span className="text-sm text-foreground capitalize">
                      {t.tipo.replace("_", " ")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {format(parseISO(t.timestamp_evento), "HH:mm")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Azioni principali */}
        <div className="space-y-3">
          {/* Azione principale (entrata / pausa) */}
          {nextAction && !isUscito && (
            <button
              onClick={() => timbraMutation.mutate(nextAction.tipo)}
              disabled={timbraMutation.isPending}
              className={cn(
                "w-full py-5 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 active:scale-[0.98] transition-transform",
                nextAction.color,
                nextAction.tipo === "entrata" ? "text-white" : "text-primary-foreground"
              )}
            >
              {timbraMutation.isPending ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                <nextAction.icon className="w-6 h-6" />
              )}
              {nextAction.label}
            </button>
          )}

          {/* Uscita */}
          {canExit && (
            <button
              onClick={() => timbraMutation.mutate("uscita")}
              disabled={timbraMutation.isPending}
              className="w-full py-4 rounded-2xl font-bold text-base bg-red-600 text-white flex items-center justify-center gap-3 active:scale-[0.98] transition-transform"
            >
              <LogOut className="w-5 h-5" />
              TIMBRA USCITA
            </button>
          )}

          {isUscito && (
            <div className="flex items-center justify-center gap-2 py-4 bg-muted border border-border rounded-2xl">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <p className="text-green-600 font-semibold">Giornata completata</p>
            </div>
          )}

          {!lastTimbro && (
            <div className="flex items-center gap-2 p-3 bg-primary/10 border border-primary/20 rounded-xl">
              <AlertCircle className="w-4 h-4 text-primary shrink-0" />
              <p className="text-xs text-primary">Timbra l'entrata per iniziare la giornata</p>
            </div>
          )}
        </div>

        {/* Storico */}
        <div>
          <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wide">Storico ultimi 14 giorni</p>
          <div className="space-y-3">
            {Object.entries(storicoByDay)
              .filter(([day]) => day !== today)
              .map(([day, items]) => {
                // Compute ore for this day
                let mins = 0;
                let pauseMins = 0;
                for (let i = 0; i < items.length - 1; i++) {
                  if (items[i].tipo === "pausa_inizio" && items[i + 1].tipo === "pausa_fine") {
                    pauseMins += differenceInMinutes(
                      parseISO(items[i + 1].timestamp_evento),
                      parseISO(items[i].timestamp_evento)
                    );
                  }
                }
                const ent = items.find(t => t.tipo === "entrata");
                const usc = items.find(t => t.tipo === "uscita");
                if (ent && usc) {
                  mins = Math.max(0, differenceInMinutes(
                    parseISO(usc.timestamp_evento),
                    parseISO(ent.timestamp_evento)
                  ) - pauseMins);
                }
                const ore = (mins / 60).toFixed(1);

                return (
                  <div key={day} className="bg-muted border border-border rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-foreground">
                        {format(parseISO(day), "EEE d MMM", { locale: it })}
                      </p>
                      <span className="text-sm text-primary font-semibold">{ore}h</span>
                    </div>
                    <div className="flex gap-3">
                      {ent && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <LogIn className="w-3 h-3 text-green-600" />
                          {format(parseISO(ent.timestamp_evento), "HH:mm")}
                        </span>
                      )}
                      {usc && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <LogOut className="w-3 h-3 text-red-600" />
                          {format(parseISO(usc.timestamp_evento), "HH:mm")}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}
