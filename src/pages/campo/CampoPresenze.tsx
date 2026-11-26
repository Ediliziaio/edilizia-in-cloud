/**
 * Presenze dell'operaio — calendario mensile con stato giornaliero.
 * Mostra solo le presenze dell'utente loggato da hr_timbrature + campo_timbrature.
 */
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  getDay, addMonths, subMonths, isSameDay, isToday, isBefore,
} from "date-fns";
import { ChevronLeft, ChevronRight, Clock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMyHrProfilo } from "@/hooks/useTimbratura";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { shiftWorkDay, workDayStart } from "@/lib/campo/workDay";
import { aggiungiOreRapportini, type GiornoPresenza, type OreRapportino } from "@/lib/campo/presenzeDaRapportini";
import { oreBrevi } from "@/lib/campo/numeriItaliani";
import { dateFnsCampo, useT } from "@/lib/campo/lingua/LinguaCampo";
import { OreApprovateMese } from "@/components/campo/OreApprovateMese";

const GIORNI_SETTIMANA = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

const STATUS_COLORS: Record<string, string> = {
  presente: "bg-green-500",
  assente: "bg-red-400",
  ferie: "bg-blue-400",
  permesso: "bg-amber-400",
  malattia: "bg-orange-400",
  smart_working: "bg-sky-400",
  trasferta: "bg-teal-500",
  festivita: "bg-sky-300",
  infortunio: "bg-red-600",
};

const STATUS_LABELS: Record<string, string> = {
  presente: "Presente",
  assente: "Assente",
  ferie: "Ferie",
  permesso: "Permesso",
  malattia: "Malattia",
  smart_working: "Smart Working",
  trasferta: "Trasferta",
  festivita: "Festivita",
  infortunio: "Infortunio",
};

export default function CampoPresenze() {
  const tr = useT();
  const { user } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  // Il mese va da mezzanotte di Roma a mezzanotte di Roma: scritto come data senza fuso il database lo legge in UTC e le
  // timbrature delle prime due ore del primo giorno finivano nel mese prima.
  const meseDa = workDayStart(format(monthStart, "yyyy-MM-dd")).toISOString();
  const meseA = workDayStart(shiftWorkDay(format(monthEnd, "yyyy-MM-dd"), 1)).toISOString();

  const { data: hrProfilo } = useMyHrProfilo();
  const profiloId = hrProfilo?.id ?? null;

  // Timbrature del mese: campo_timbrature UNITE a hr_timbrature (quelle
  // inserite/corrette dall'ufficio vivono solo lì — il commento del file
  // le prometteva ma la query non le leggeva). Dedup per tipo+minuto:
  // la copia HR della stessa timbratura non deve contare doppio.
  const { data: timbrature = [], isLoading, isError } = useQuery({
    queryKey: ["campo-presenze", user?.id, profiloId, format(monthStart, "yyyy-MM")],
    queryFn: async () => {
      const [campoRes, hrRes] = await Promise.all([
        supabase
          .from("campo_timbrature")
          .select("*")
          .eq("user_id", user!.id)
          .gte("timestamp_evento", meseDa)
          .lt("timestamp_evento", meseA)
          .order("timestamp_evento", { ascending: true }),
        profiloId
          ? supabase
              .from("hr_timbrature")
              .select("tipo, timestamp")
              .eq("profilo_id", profiloId)
              .gte("timestamp", meseDa)
              .lt("timestamp", meseA)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (campoRes.error) throw campoRes.error;
      if (hrRes.error) throw hrRes.error;

      const unite: Array<{ tipo: string; timestamp_evento: string }> = [
        ...((campoRes.data ?? []) as Array<{ tipo: string; timestamp_evento: string }>),
        ...(((hrRes.data ?? []) as Array<{ tipo: string; timestamp: string }>).map(h => ({
          tipo: h.tipo,
          timestamp_evento: h.timestamp,
        }))),
      ];
      const visti = new Set<string>();
      return unite
        .filter(t => {
          const key = `${t.tipo}|${String(t.timestamp_evento).slice(0, 16)}`;
          if (visti.has(key)) return false;
          visti.add(key);
          return true;
        })
        .sort((a, b) => String(a.timestamp_evento).localeCompare(String(b.timestamp_evento)));
    },
    enabled: !!user?.id,
  });

  // Richieste approvate (ferie/permessi/malattia)
  const { data: richieste = [] } = useQuery({
    queryKey: ["campo-richieste-approvate", user?.id, format(monthStart, "yyyy-MM")],
    queryFn: async () => {
      const { data } = await supabase
        .from("hr_richieste")
        .select("*")
        .eq("user_id", user!.id)
        .eq("stato", "approvata")
        .gte("data_fine", format(monthStart, "yyyy-MM-dd"))
        .lte("data_inizio", format(monthEnd, "yyyy-MM-dd"));
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  // Rapportini del mese: nei giorni senza timbrature le ore vengono da qui (vedi presenzeDaRapportini).
  // Il client legge dalla vista campo_rapportini_visibili (protectedOrderRequests): solo i propri.
  const { data: rapportini = [] } = useQuery({
    queryKey: ["campo-presenze-rapportini", user?.id, format(monthStart, "yyyy-MM")],
    queryFn: async (): Promise<OreRapportino[]> => {
      const { data, error } = await supabase
        .from("campo_rapportini")
        .select("data_lavoro, ore_lavorate, ore_straordinario, stato, annullato_at")
        .eq("user_id", user!.id)
        .gte("data_lavoro", format(monthStart, "yyyy-MM-dd"))
        .lte("data_lavoro", format(monthEnd, "yyyy-MM-dd"));
      if (error) throw error;
      return (data ?? []) as OreRapportino[];
    },
    enabled: !!user?.id,
  });

  // Mappa giorno → stato
  const dayStatusMap = useMemo(() => {
    const map: Record<string, GiornoPresenza> = {};

    // Raggruppa timbrature per giorno
    const perGiorno: Record<string, any[]> = {};
    for (const t of timbrature as any[]) {
      const key = format(new Date(t.timestamp_evento), "yyyy-MM-dd");
      if (!perGiorno[key]) perGiorno[key] = [];
      perGiorno[key].push(t);
    }

    // Calcola stato, ore, entrata e uscita per ogni giorno
    for (const [key, timbs] of Object.entries(perGiorno)) {
      timbs.sort((a: any, b: any) => new Date(a.timestamp_evento).getTime() - new Date(b.timestamp_evento).getTime());
      const entrata = timbs.find((t: any) => t.tipo === "entrata");
      const uscita = [...timbs].reverse().find((t: any) => t.tipo === "uscita");

      // Calcola ore lavorate
      let totaleMs = 0;
      let ultimaEntrata: Date | null = null;
      for (const t of timbs) {
        const ts = new Date(t.timestamp_evento);
        if (t.tipo === "entrata" || t.tipo === "pausa_fine") ultimaEntrata = ts;
        else if ((t.tipo === "uscita" || t.tipo === "pausa_inizio") && ultimaEntrata) {
          totaleMs += ts.getTime() - ultimaEntrata.getTime();
          ultimaEntrata = null;
        }
      }
      const ore = Math.round((totaleMs / 3600000) * 10) / 10;

      map[key] = {
        status: "presente",
        ore,
        entrata: entrata ? format(new Date(entrata.timestamp_evento), "HH:mm") : undefined,
        uscita: uscita ? format(new Date(uscita.timestamp_evento), "HH:mm") : undefined,
      };
    }

    // Richieste approvate
    for (const r of richieste as any[]) {
      const start = new Date(r.data_inizio);
      const end = new Date(r.data_fine);
      const days = eachDayOfInterval({ start, end });
      for (const d of days) {
        const key = format(d, "yyyy-MM-dd");
        // La richiesta approvata vince se quel giorno non ha ore lavorate
        // vere: una timbratura vuota non deve nascondere ferie/malattia.
        if (!map[key] || (map[key].ore ?? 0) === 0) {
          map[key] = { status: r.tipo || "permesso" };
        }
      }
    }

    return aggiungiOreRapportini(map, rapportini);
  }, [timbrature, richieste, rapportini]);

  // Giorni del calendario
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPadding = (getDay(monthStart) + 6) % 7; // Lunedi = 0

  // KPI
  const giorniPresente = Object.values(dayStatusMap).filter(d => d.status === "presente").length;
  const oreTotali = Object.values(dayStatusMap).reduce((sum, d) => sum + (d.ore ?? 0), 0);
  const giorniFerie = Object.values(dayStatusMap).filter(d => d.status === "ferie").length;
  const giorniMalattia = Object.values(dayStatusMap).filter(d => d.status === "malattia").length;

  const selectedDayData = selectedDay ? dayStatusMap[format(selectedDay, "yyyy-MM-dd")] : null;

  return (
    <div className="space-y-4 md:space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-lg md:text-xl font-semibold tracking-tight">{tr("Le mie presenze")}</h1>
        <p className="text-xs md:text-sm text-muted-foreground mt-0.5">{tr("I giorni e le ore che hai lavorato")}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3">
        {[
          { label: tr("Giorni presente"), value: giorniPresente, color: "text-green-600" },
          { label: tr("Ore totali"), value: oreBrevi(oreTotali), color: "text-primary" },
          { label: tr("Giorni ferie"), value: giorniFerie, color: "text-blue-500" },
          { label: tr("Giorni malattia"), value: giorniMalattia, color: "text-orange-500" },
        ].map(kpi => (
          <Card key={kpi.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
              <p className={cn("text-2xl font-bold mt-1", kpi.color)}>{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Le ore del registro dell'ufficio, con lo stato (piano campo completo 1.3). */}
      <OreApprovateMese mese={currentMonth} />

      {/* Calendario */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <button onClick={() => setCurrentMonth(m => subMonths(m, 1))} className="p-2 hover:bg-muted active:bg-muted rounded-lg">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <CardTitle className="text-base capitalize">
              {format(currentMonth, "MMMM yyyy", { locale: dateFnsCampo() })}
            </CardTitle>
            <button onClick={() => setCurrentMonth(m => addMonths(m, 1))} className="p-2 hover:bg-muted active:bg-muted rounded-lg">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </CardHeader>
        <CardContent>
          {isError ? (
            <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-4 text-center text-sm text-destructive">
              {tr("Non riesco a caricare le presenze. Controlla la connessione e riapri la pagina.")}
            </p>
          ) : isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Header giorni */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {GIORNI_SETTIMANA.map(g => (
                  <div key={g} className="text-center text-xs font-medium text-muted-foreground py-1">{tr(g)}</div>
                ))}
              </div>

              {/* Griglia giorni */}
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: startPadding }).map((_, i) => (
                  <div key={`pad-${i}`} />
                ))}
                {days.map(day => {
                  const key = format(day, "yyyy-MM-dd");
                  const data = dayStatusMap[key];
                  const isSelected = selectedDay && isSameDay(day, selectedDay);
                  const isCurrentDay = isToday(day);
                  const isFuture = !isBefore(day, new Date()) && !isCurrentDay;

                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedDay(day)}
                      className={cn(
                        "aspect-square rounded-lg flex flex-col items-center justify-center text-sm relative transition-all",
                        isSelected ? "ring-2 ring-primary" : "",
                        isCurrentDay ? "font-bold" : "",
                        isFuture ? "text-muted-foreground/50" : "text-foreground",
                      )}
                    >
                      <span>{format(day, "d")}</span>
                      {data && (
                        <div className={cn("w-2 h-2 rounded-full mt-0.5", STATUS_COLORS[data.status] || "bg-gray-300")} />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Legenda */}
              <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-border">
                {Object.entries(STATUS_LABELS).slice(0, 5).map(([key, label]) => (
                  <div key={key} className="flex items-center gap-1.5">
                    <div className={cn("w-2.5 h-2.5 rounded-full", STATUS_COLORS[key])} />
                    <span className="text-xs text-muted-foreground">{tr(label)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Dettaglio giorno selezionato */}
      {selectedDay && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-semibold text-foreground capitalize mb-2">
              {format(selectedDay, "EEEE d MMMM yyyy", { locale: dateFnsCampo() })}
            </p>
            {selectedDayData ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge className={cn("text-white text-xs", STATUS_COLORS[selectedDayData.status])}>
                    {STATUS_LABELS[selectedDayData.status] ? tr(STATUS_LABELS[selectedDayData.status]) : selectedDayData.status}
                  </Badge>
                </div>
                {selectedDayData.entrata && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    <span>{tr("Entrata: {ora}", { ora: selectedDayData.entrata?.slice(0, 5) ?? "" })}</span>
                    {selectedDayData.uscita && <span>{tr("— Uscita: {ora}", { ora: selectedDayData.uscita.slice(0, 5) })}</span>}
                  </div>
                )}
                {selectedDayData.ore != null && (
                  <p className="text-sm text-muted-foreground">
                    {tr("Ore lavorate:")} <span className="text-primary font-semibold">{oreBrevi(selectedDayData.ore)}</span>
                    {selectedDayData.daRapportino && <span> · {tr("dal rapportino (non hai timbrato)")}</span>}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{tr("Nessun dato per questo giorno")}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
