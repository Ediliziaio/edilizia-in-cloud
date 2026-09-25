/**
 * Timbratura GPS per operai e subappaltatori.
 * Flusso: Entrata → Pausa inizio → Pausa fine → Uscita
 * Storico ultimi 14 giorni.
 */
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import {
  LogIn, LogOut,
  Loader2, Navigation, HardHat, MapPin,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useGPS } from "@/hooks/useGPS";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useCampoDayTime } from "@/hooks/campo/useCampoDayTime";
import { campoDayWindow, campoReportHours, campoPunchOrderId, canRecordCampoPunch, summarizeCampoTime } from "@/lib/campo/timeSummary";
import { refreshCampoTimeQueries } from "@/lib/campo/refreshTimeQueries";
import { useCampoAssignments } from "@/hooks/campo/useCampoAssignments";
import { CampoPunchActions } from "@/components/campo/CampoPunchActions";
import { campoWorkDay, reportDayAllowed } from "@/lib/campo/workDay";

type TipoTimbratura = "entrata" | "uscita" | "pausa_inizio" | "pausa_fine";

interface Timbratura {
  id: string;
  tipo: TipoTimbratura;
  timestamp_evento: string;
  order_id: string | null;
  lat?: number;
  lng?: number;
  indirizzo?: string;
  fonte: string;
}

export default function CampoTimbratura() {
  const { user, profile } = useAuth();
  const [params] = useSearchParams();
  return <CampoTimbraturaEditor key={`${profile?.company_id}:${user?.id}:${params.get("order_id")}`} />;
}

function CampoTimbraturaEditor() {
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [lastExit, setLastExit] = useState<{ orderId: string; day: string } | null>(null);
  const [searchParams] = useSearchParams();
  const companyId = profile?.company_id ?? null;
  const dayTime = useCampoDayTime(user?.id, companyId);
  const assignments = useCampoAssignments();
  const [entryChoice, setEntryChoice] = useState<string | null>(null);
  const hasOpenSession = dayTime.summary.state === "working" || dayTime.summary.state === "paused";
  const choice = entryChoice ?? searchParams.get("order_id") ?? (hasOpenSession ? dayTime.summary.activeOrderId ?? "__unassigned__" : "");
  const selectedOrderId = choice && choice !== "__unassigned__" ? choice : null;
  const selectedAssignment = assignments.data?.find(a => a.order_id === selectedOrderId);
  const canStartHere = choice === "__unassigned__" || (assignments.isSuccess && !!selectedAssignment);
  const fallbackOrderCode = searchParams.get("order_code");
  const fallbackOrderTitle = searchParams.get("order_title");
  const fallbackOrderAddress = searchParams.get("order_address");
  const { lat, lng, accuracy, address, status: gpsStatus, requestPosition } = useGPS(companyId);
  // Profilo HR — usato per sincronizzare la timbratura anche in hr_timbrature

  // Request GPS on mount — requestPosition è useCallback con dep [companyId].
  // Depend solo su companyId per evitare ri-chiamate a ogni re-render.
  useEffect(() => {
    if (companyId) requestPosition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  // Today's timbrature
  const today = campoWorkDay(dayTime.now);

  const { data: selectedOrder, isLoading: selectedOrderLoading } = useQuery({
    queryKey: ["campo-timbratura-order", selectedOrderId, companyId],
    queryFn: async () => {
      return await Promise.race([
        supabase
          .from("orders")
          .select("id, order_code, description, indirizzo_lavori")
          .eq("id", selectedOrderId!)
          .eq("company_id", companyId!)
          .maybeSingle()
          .then(({ data, error }) => {
            if (error) throw error;
            return data;
          }),
        new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 3500)),
      ]);
    },
    enabled: !!selectedOrderId && !!companyId,
    staleTime: 60_000,
  });

  const fallbackSelectedOrder = selectedOrderId && selectedOrderId === searchParams.get("order_id") && (fallbackOrderCode || fallbackOrderTitle || fallbackOrderAddress)
    ? {
        id: selectedOrderId,
        order_code: fallbackOrderCode ?? "Cantiere selezionato",
        description: fallbackOrderTitle,
        indirizzo_lavori: fallbackOrderAddress,
      }
    : null;
  const selectedOrderContext = selectedAssignment?.order ?? selectedOrder ?? fallbackSelectedOrder;

  const timbratureOggi = dayTime.todayPunches;
  // Storico 14 giorni
  const { data: storico = [] } = useQuery({
    queryKey: ["campo-timbrature-storico", companyId, user?.id],
    queryFn: async () => {
      const from = new Date();
      from.setDate(from.getDate() - 14);
      const { data, error } = await supabase
        .from("campo_timbrature")
        .select("*")
        .eq("user_id", user!.id)
        .eq("company_id", companyId!)
        .gte("timestamp_evento", from.toISOString())
        .order("timestamp_evento", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Timbratura[];
    },
    enabled: !!user?.id && !!companyId,
  });

  const isInPausa = dayTime.summary.state === "paused";
  const isActive = dayTime.summary.state === "working";
  const minutiPausa = Math.round(dayTime.summary.pauseMinutes);
  const oreLavorate = campoReportHours(dayTime.summary.workMinutes);
  const activeElsewhere = (isActive || isInPausa) && selectedOrderId !== dayTime.summary.activeOrderId;
  const selectedSiteMinutes = selectedOrderId ? dayTime.summary.byOrder.get(selectedOrderId)?.workMinutes ?? 0 : null;
  const timbraMutation = useMutation({
    mutationFn: async (tipo: TipoTimbratura) => {
      if (!companyId || !user || !dayTime.isSuccess) throw new Error("Timbrature non disponibili, ricarica la pagina");
      if (!canRecordCampoPunch(dayTime.summary.state, tipo)) throw new Error("Sequenza non valida: aggiorna le timbrature");
      if (tipo === "entrata" && !canStartHere) throw new Error("Scegli un cantiere assegnato oppure ore da attribuire");
      const orderId = campoPunchOrderId(tipo, dayTime.summary.activeOrderId, selectedOrderId);
      const gpsReady = gpsStatus === "success";
      const now = new Date().toISOString();
      const note = [
        orderId ? `Cantiere: ${orderId === selectedOrderId ? selectedOrderContext?.order_code ?? orderId : orderId}` : null,
        address ? `GPS: ${address}` : null,
      ].filter(Boolean).join(" · ") || null;
      const { error } = await supabase.from("campo_timbrature").insert({
        user_id: user!.id,
        company_id: companyId,
        order_id: orderId,
        tipo,
        timestamp_evento: now,
        gps_lat: gpsReady ? lat : null,
        gps_lng: gpsReady ? lng : null,
        gps_accuracy: gpsReady ? Math.round(accuracy) : null,
        note,
        fonte: "app",
      });
      if (error) throw error;
      return { orderId, day: campoWorkDay(new Date(now)) };
      // La copia sul registro HR la fa il trigger DB trg_mirror_campo_timbratura,
      // dentro questa stessa transazione: prima erano due insert separati che
      // potevano lasciare la timbratura fuori dal registro (e quindi fuori dalle
      // ore del cedolino) senza che nessuno se ne accorgesse.
    },
    onSuccess: async (result, tipo) => {
      const labels: Record<TipoTimbratura, string> = {
        entrata: "Entrata registrata",
        uscita: "Uscita registrata",
        pausa_inizio: "Pausa iniziata",
        pausa_fine: "Pausa terminata",
      };
      toast.success(labels[tipo]);
      if (tipo === "uscita" && result?.orderId) setLastExit(result);
      await refreshCampoTimeQueries(qc);
      // La timbratura è appena entrata anche nel registro HR: le viste
      // dell'ufficio e le presenze devono rileggerle, non restare indietro.
      qc.invalidateQueries({ queryKey: ["hr-timbrature"] });
      qc.invalidateQueries({ queryKey: ["hr-my-timbrature-today"] });
      qc.invalidateQueries({ queryKey: ["hr-live-status"] });
      qc.invalidateQueries({ queryKey: ["hr-giornate"] });
    },
    onError: error => toast.error(error instanceof Error ? error.message : "Errore durante la timbratura"),
  });

  // Group storico by day
  const storicoByDay: Record<string, Timbratura[]> = {};
  storico.forEach(t => {
    const day = campoWorkDay(parseISO(t.timestamp_evento));
    if (!storicoByDay[day]) storicoByDay[day] = [];
    storicoByDay[day].push(t);
  });

  // Niente h-full + scroll interno: il <main> della shell è l'unico scroller
  // mobile (il suo pb-28 dà già aria sopra la bottom nav).
  return (
    <div className="flex flex-col">
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

      <div className="px-4 py-4 space-y-4">
        {dayTime.summary.state === "out" && <div className="space-y-2 rounded-2xl border bg-background p-4">
          <label htmlFor="campo-punch-site" className="text-sm font-semibold">Dove inizi a lavorare?</label>
          <select id="campo-punch-site" value={choice} disabled={timbraMutation.isPending}
            onChange={e => setEntryChoice(e.target.value)}
            className="min-h-12 w-full min-w-0 rounded-xl border bg-background px-3 text-base">
            <option value="" disabled>Scegli il cantiere</option>
            {selectedOrderId && !selectedAssignment && <option value={selectedOrderId} disabled>Cantiere da verificare</option>}
            {(assignments.data ?? []).map(a => <option key={a.order_id} value={a.order_id}>
              {a.order.order_code || "Cantiere"} · {a.order.description || a.order.indirizzo_lavori || "Lavoro assegnato"}
            </option>)}
            <option value="__unassigned__">Nessun cantiere — ore da attribuire</option>
          </select>
          {assignments.isLoading && <p role="status" className="text-xs text-muted-foreground">Caricamento cantieri assegnati…</p>}
          {assignments.isError && <div role="alert" className="text-sm text-amber-700">
            Non riesco a verificare i cantieri assegnati.
            <button type="button" className="ml-2 min-h-11 text-primary underline" onClick={() => assignments.refetch()}>Riprova cantieri</button>
          </div>}
          {assignments.isSuccess && selectedOrderId && !selectedAssignment && <p role="alert" className="text-sm text-amber-700">Questo cantiere non risulta tra quelli assegnati e aperti. Scegline uno disponibile.</p>}
          {assignments.isSuccess && !assignments.data.length && <p className="text-xs text-muted-foreground">Non hai cantieri assegnati disponibili.</p>}
        </div>}
        {dayTime.isError && (
          <div role="alert" className="rounded-xl border border-destructive/30 p-4 text-sm">
            <p>Non riesco a leggere le timbrature. Le azioni restano sospese per evitare una nuova entrata errata.</p>
            <button type="button" onClick={() => dayTime.refetch()} className="mt-2 min-h-11 text-primary underline">Riprova</button>
          </div>
        )}
        {activeElsewhere && (
          <div role="status" className="rounded-xl border bg-muted/40 p-4 text-sm">
            Hai una sessione aperta {dayTime.summary.activeOrderId ? "su un altro cantiere" : "senza cantiere"}. Pausa e uscita restano collegate a quella sessione.
            Per iniziare qui, registra prima l'uscita e poi una nuova entrata.
          </div>
        )}
        {selectedOrderId && selectedOrderLoading && !selectedOrderContext && (
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-center gap-3 text-sm font-semibold text-primary">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carico il cantiere collegato...
            </div>
          </div>
        )}

        {selectedOrderContext && (
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-primary/10 p-2 text-primary">
                <HardHat className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-wide text-primary">
                  {activeElsewhere ? "Cantiere aperto nella schermata" : "Timbratura collegata"}
                </p>
                <p className="truncate text-base font-bold text-foreground">
                  {selectedOrderContext.order_code}
                </p>
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {selectedOrderContext.description ?? "Cantiere selezionato"}
                </p>
                {selectedOrderContext.indirizzo_lavori && (
                  <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{selectedOrderContext.indirizzo_lavori}</span>
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {selectedOrderId && !selectedOrderLoading && !selectedOrderContext && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-amber-100 p-2 text-amber-700">
                <HardHat className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-wide text-amber-800">
                  {activeElsewhere ? "Cantiere aperto nella schermata" : "Timbratura collegata"}
                </p>
                <p className="text-sm font-semibold text-amber-900">
                  Cantiere selezionato
                </p>
                <p className="mt-1 text-xs text-amber-800">
                  {activeElsewhere
                    ? "Pausa e uscita restano sulla sessione già aperta, non su questo cantiere."
                    : "La nuova entrata sarà associata al lavoro aperto. Se il nome non appare, ricarica dai lavori assegnati."}
                </p>
              </div>
            </div>
          </div>
        )}

        {choice === "__unassigned__" && dayTime.summary.state === "out" && (
          <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Nessun cantiere selezionato: questa entrata registrerà ore da attribuire.
            Puoi collegarle subito scegliendo un cantiere qui sopra.
          </div>
        )}

        <CampoPunchActions state={dayTime.summary.state}
          busy={timbraMutation.isPending || !dayTime.isSuccess} canEnter={canStartHere}
          onPunch={tipo => timbraMutation.mutate(tipo)} />
        {lastExit && reportDayAllowed(lastExit.day, dayTime.now) && <div role="status" className="space-y-2 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-900">
          <p className="font-semibold">Uscita registrata. Il rapportino è separato.</p>
          <p>Puoi compilarlo ora o entro il giorno successivo al lavoro. Puoi già timbrare su un altro cantiere.</p>
          <button type="button" className="min-h-12 w-full rounded-lg border border-green-300 bg-background px-3 font-semibold"
            onClick={() => navigate(`/campo/lavoro/${lastExit.orderId}/rapportino?data=${lastExit.day}`)}>Compila il rapportino</button>
        </div>}

        {/* Ore lavorate oggi */}
        <div className="bg-muted border border-border rounded-2xl p-5">
          <p className="text-xs text-muted-foreground mb-1">Oggi — {format(new Date(), "EEEE d MMMM", { locale: it })}</p>
          <div className="flex items-end gap-2">
            <span className="text-4xl font-bold text-foreground">{dayTime.isError || dayTime.isLoading ? "—" : oreLavorate.toFixed(1)}</span>
            <span className="text-lg text-muted-foreground mb-1">h nella giornata</span>
          </div>
          {minutiPausa > 0 && (
            <p className="text-xs text-muted-foreground mt-1">{minutiPausa} min pausa</p>
          )}
          {selectedSiteMinutes != null && dayTime.isSuccess && (
            <p className="mt-2 text-sm">Su questo cantiere: {campoReportHours(selectedSiteMinutes)} h · pause escluse</p>
          )}
          {dayTime.summary.issues.some(issue => issue.kind !== "open_session") && (
            <p role="status" className="mt-2 text-sm text-amber-700">Sequenza di timbrature da verificare prima del rapportino.</p>
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

        {/* Storico */}
        <div>
          <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wide">Storico ultimi 14 giorni</p>
          {Object.entries(storicoByDay).filter(([day]) => day !== today).length === 0 && (
            <p className="rounded-xl border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
              Nessuna timbratura nei giorni scorsi. Qui vedrai le ore degli ultimi 14 giorni.
            </p>
          )}
          <div className="space-y-3">
            {Object.entries(storicoByDay)
              .filter(([day]) => day !== today)
              .map(([day, items]) => {
                const asc = [...items].sort((a, b) => a.timestamp_evento.localeCompare(b.timestamp_evento));
                const historical = summarizeCampoTime(storico, { ...campoDayWindow(day), now: dayTime.now });
                const ent = asc.find(t => t.tipo === "entrata");
                const usc = [...asc].reverse().find(t => t.tipo === "uscita");
                const ore = (historical.workMinutes / 60).toFixed(1);
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
