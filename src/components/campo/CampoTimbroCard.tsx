/**
 * La timbratura dell'app di cantiere, a un tocco (04/10/2026).
 *
 * La giornata è UNA: «Inizia la giornata» una volta (da una sede o da un cantiere) e
 * «Fine giornata» una volta. In mezzo, quando si arriva in un altro posto — dal
 * magazzino al cantiere, da un cantiere a un altro — si tocca il nome del posto:
 * il database chiude il tratto di prima e apre quello nuovo in un colpo solo
 * (campo_timbra_cambio_luogo). Le ore pagate non cambiano; cambia dove vanno a finire.
 * Prima serviva una timbratura di uscita e una nuova entrata per ogni spostamento.
 *
 * Lo stesso componente vale per la Home e per la pagina «Timbra».
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Building2, Clock, Coffee, HardHat, Loader2, LogIn, LogOut, PauseCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useGPS } from "@/hooks/useGPS";
import { useCampoDayTime } from "@/hooks/campo/useCampoDayTime";
import { useCampoAssignments } from "@/hooks/campo/useCampoAssignments";
import { useCampoSedi } from "@/hooks/campo/useCampoSedi";
import { useMiaGiornata } from "@/hooks/campo/useCampoGiornata";
import { campoPunchOrderId, campoReportHours, canRecordCampoPunch } from "@/lib/campo/timeSummary";
import { refreshCampoTimeQueries } from "@/lib/campo/refreshTimeQueries";
import { campoWorkDay } from "@/lib/campo/workDay";
import { messaggioErrore } from "@/lib/campo/messaggioErrore";
import {
  LUOGO_NESSUNO, chiaveLuogoCorrente, costruisciLuoghi, nomeLuogo, partenzaPredefinita, trovaLuogo,
  type Luogo,
} from "@/lib/campo/luoghi";
import { cn } from "@/lib/utils";

type Tipo = "entrata" | "uscita" | "pausa_inizio" | "pausa_fine";

export interface TimbroEsito {
  tipo: Tipo | "cambio";
  orderId: string | null;
  day: string;
}

const MESSAGGI: Record<Tipo, string> = {
  entrata: "Giornata iniziata",
  uscita: "Giornata finita",
  pausa_inizio: "Pausa iniziata",
  pausa_fine: "Pausa terminata",
};

const chiaveRicordata = (userId: string) => `campo-partenza:${userId}`;
function leggiRicordata(userId: string | undefined): string | null {
  if (!userId) return null;
  try { return localStorage.getItem(chiaveRicordata(userId)); } catch { return null; }
}
function ricordaPartenza(userId: string | undefined, key: string) {
  if (!userId) return;
  try { localStorage.setItem(chiaveRicordata(userId), key); } catch { /* navigazione privata: pazienza */ }
}

type RpcCambio = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;

function IconaLuogo({ luogo, className }: { luogo: Luogo; className?: string }) {
  return luogo.tipo === "sede"
    ? <Building2 className={className} aria-hidden="true" />
    : <HardHat className={className} aria-hidden="true" />;
}

export function CampoTimbroCard({ preferOrderId = null, onPunched }: {
  /** Cantiere da proporre come partenza (link «Timbra» dal cantiere). */
  preferOrderId?: string | null;
  onPunched?: (esito: TimbroEsito) => void;
}) {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id ?? null;
  const dayTime = useCampoDayTime(user?.id, companyId);
  const assegnazioni = useCampoAssignments();
  const sedi = useCampoSedi();
  const giornata = useMiaGiornata(14);
  // La posizione si chiede quando la scheda compare (non al tocco, o la persona aspetterebbe
  // il fix col dito a mezz'aria) e si allega solo se è arrivata: la timbratura non la aspetta.
  const { lat, lng, accuracy, address, status: gpsStatus, requestPosition } = useGPS(companyId);
  useEffect(() => {
    if (companyId) void requestPosition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const summary = dayTime.summary;
  const inServizio = summary.state === "working";
  const inPausa = summary.state === "paused";
  const fuori = summary.state === "out";
  const haTimbratoOggi = fuori && dayTime.todayPunches.length > 0;

  const oggiIds = useMemo(
    () => new Set((giornata.data?.giorni[0]?.cantieri ?? []).map(c => c.order_id)),
    [giornata.data],
  );
  const luoghi = useMemo(() => costruisciLuoghi({
    assegnazioni: assegnazioni.data ?? [],
    sedi: sedi.data ?? [],
    oggiIds,
    apertoOrderId: inServizio || inPausa ? summary.activeOrderId : null,
  }), [assegnazioni.data, sedi.data, oggiIds, inServizio, inPausa, summary.activeOrderId]);

  const correnteKey = chiaveLuogoCorrente(summary);
  const corrente = trovaLuogo(luoghi, correnteKey);

  const [scelta, setScelta] = useState<string | null>(null);
  const ricordata = useMemo(() => leggiRicordata(user?.id), [user?.id]);
  const predefinita = partenzaPredefinita(luoghi, { preferOrderId, ricordata });
  const partenzaKey = scelta && (scelta === LUOGO_NESSUNO || luoghi.some(l => l.key === scelta)) ? scelta : predefinita;
  const partenza = trovaLuogo(luoghi, partenzaKey);

  const aggiorna = async () => {
    await refreshCampoTimeQueries(queryClient);
    queryClient.invalidateQueries({ queryKey: ["hr-timbrature"] });
    queryClient.invalidateQueries({ queryKey: ["hr-my-timbrature-today"] });
    queryClient.invalidateQueries({ queryKey: ["hr-live-status"] });
    queryClient.invalidateQueries({ queryKey: ["hr-giornate"] });
  };
  const posizione = () => {
    const pronta = gpsStatus === "success";
    return { lat: pronta ? lat : null, lng: pronta ? lng : null, accuracy: pronta ? Math.round(accuracy) : null };
  };
  const notaPer = (luogo: Luogo | null) => [
    luogo?.tipo === "cantiere" ? `Cantiere: ${luogo.nome}` : luogo?.tipo === "sede" ? `Sede: ${luogo.nome}` : null,
    address ? `GPS: ${address}` : null,
  ].filter(Boolean).join(" · ") || null;

  const timbra = useMutation({
    mutationFn: async (tipo: Tipo): Promise<TimbroEsito> => {
      if (!companyId || !user || !dayTime.isSuccess) throw new Error("Timbrature non disponibili, ricarica la pagina");
      if (!canRecordCampoPunch(summary.state, tipo)) throw new Error("Sequenza non valida: aggiorna le timbrature");
      if (tipo === "entrata" && !partenza) throw new Error("Scegli da dove parti");
      const gps = posizione();
      const adesso = new Date().toISOString();
      const orderId = campoPunchOrderId(tipo, summary.activeOrderId, partenza?.orderId ?? null);
      const inizio = tipo === "entrata" ? partenza : corrente;
      const { error } = await supabase.from("campo_timbrature").insert({
        company_id: companyId,
        user_id: user.id,
        order_id: orderId,
        sede_id: tipo === "entrata" && partenza?.tipo === "sede" ? partenza.sedeId : null,
        in_sede: tipo === "entrata" && partenza?.tipo === "sede",
        tipo,
        timestamp_evento: adesso,
        gps_lat: gps.lat,
        gps_lng: gps.lng,
        gps_accuracy: gps.accuracy,
        note: notaPer(inizio),
        fonte: "app",
      });
      if (error) throw error;
      if (tipo === "entrata" && partenzaKey) ricordaPartenza(user.id, partenzaKey);
      // La copia sul registro del Personale la fa il trigger del database, nella stessa transazione.
      return { tipo, orderId, day: campoWorkDay(new Date(adesso)) };
    },
    onSuccess: async (esito) => {
      toast.success(MESSAGGI[esito.tipo as Tipo]);
      setScelta(null);
      await aggiorna();
      onPunched?.(esito);
    },
    onError: (e) => toast.error(messaggioErrore(e, "Non sono riuscito a registrare la timbratura. Riprova.")),
  });

  const cambia = useMutation({
    mutationFn: async (luogo: Luogo): Promise<TimbroEsito> => {
      if (!companyId || !user || !dayTime.isSuccess) throw new Error("Timbrature non disponibili, ricarica la pagina");
      if (summary.state !== "working") throw new Error("Per cambiare posto devi essere in servizio e non in pausa");
      const gps = posizione();
      const adesso = new Date().toISOString();
      const rpc = supabase.rpc.bind(supabase) as unknown as RpcCambio;
      const { error } = await rpc("campo_timbra_cambio_luogo", {
        p_order_id: luogo.tipo === "cantiere" ? luogo.orderId : null,
        p_sede_id: luogo.tipo === "sede" ? luogo.sedeId : null,
        p_quando: adesso,
        p_lat: gps.lat,
        p_lng: gps.lng,
        p_accuracy: gps.accuracy,
        p_note: notaPer(luogo),
      });
      if (error) throw error;
      return { tipo: "cambio", orderId: luogo.orderId, day: campoWorkDay(new Date(adesso)) };
    },
    onSuccess: async (esito, luogo) => {
      toast.success(`Ora sei: ${luogo.nome}`);
      await aggiorna();
      onPunched?.(esito);
    },
    onError: (e) => toast.error(messaggioErrore(e, "Non sono riuscito a cambiare posto. Riprova.")),
  });

  const occupato = timbra.isPending || cambia.isPending || !dayTime.isSuccess;
  const sediLuoghi = luoghi.filter(l => l.tipo === "sede");
  const cantieriOggi = luoghi.filter(l => l.tipo === "cantiere" && l.oggi);
  const cantieriAltri = luoghi.filter(l => l.tipo === "cantiere" && !l.oggi);
  const altriDove = [...sediLuoghi, ...cantieriOggi].filter(l => l.key !== correnteKey);
  const altriCantieri = cantieriAltri.filter(l => l.key !== correnteKey);
  const senzaPosto = summary.unassignedMinutes > 0;
  const daVerificare = summary.issues.some(i => i.kind !== "open_session");
  const dalle = summary.legStartedAt ? format(new Date(summary.legStartedAt), "HH:mm") : null;

  const opzione = (l: Luogo) => <option key={l.key} value={l.key}>{l.tipo === "sede" ? l.nome : nomeLuogo(l)}</option>;

  return (
    <section aria-label="Timbratura" className="space-y-3 rounded-2xl border bg-background p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-bold"><Clock className="h-4 w-4" aria-hidden="true" />Timbratura</h2>
        {(inServizio || inPausa) && !dayTime.isError && (
          <span className="text-sm font-semibold text-amber-600">{campoReportHours(summary.workMinutes)} h oggi</span>
        )}
      </div>

      {dayTime.isError && (
        <div role="alert" className="space-y-1 rounded-xl border border-destructive/30 p-3 text-sm">
          <p>Non riesco a leggere le timbrature. Le azioni restano ferme per non sbagliare una nuova entrata.</p>
          <button type="button" onClick={() => dayTime.refetch()} className="min-h-11 text-primary underline">Riprova</button>
        </div>
      )}

      <div className={cn(
        "flex items-center gap-2 rounded-xl px-3 py-2 text-sm",
        inServizio ? "bg-green-50 text-green-800" : inPausa ? "bg-amber-50 text-amber-800" : "bg-muted text-muted-foreground",
      )}>
        <span className={cn("h-2 w-2 shrink-0 rounded-full", inServizio ? "animate-pulse bg-green-500" : inPausa ? "animate-pulse bg-amber-500" : "bg-slate-400")} aria-hidden="true" />
        <span className="min-w-0 flex-1 font-medium">
          {inPausa ? "In pausa" : inServizio ? "In servizio" : haTimbratoOggi ? "Giornata finita" : "Non hai ancora timbrato"}
          {(inServizio || inPausa) && corrente && (
            <span className="font-normal"> · <span className="font-semibold">{corrente.nome}</span>{dalle ? ` dalle ${dalle}` : ""}</span>
          )}
          {(inServizio || inPausa) && corrente?.dettaglio && (
            <span className="block truncate text-xs font-normal opacity-80">{corrente.dettaglio}</span>
          )}
        </span>
      </div>

      {senzaPosto && (
        <p role="status" className="text-sm text-amber-700">
          {campoReportHours(summary.unassignedMinutes)} h senza cantiere né sede: vanno attribuite prima del consuntivo.
        </p>
      )}
      {daVerificare && (
        <p role="status" className="text-sm text-amber-700">Ci sono timbrature da verificare: controlla le ore prima di inviare il rapportino.</p>
      )}

      {fuori && (
        <div className="space-y-1.5">
          <label htmlFor="campo-partenza" className="text-sm font-semibold">Da dove parti?</label>
          <select
            id="campo-partenza"
            value={partenzaKey ?? ""}
            onChange={e => setScelta(e.target.value)}
            disabled={timbra.isPending}
            className="h-12 w-full min-w-0 rounded-xl border bg-background px-3 text-base"
          >
            {!partenzaKey && <option value="" disabled>Scegli da dove parti</option>}
            {sediLuoghi.length > 0 && <optgroup label="In sede">{sediLuoghi.map(opzione)}</optgroup>}
            {cantieriOggi.length > 0 && <optgroup label="Cantieri di oggi">{cantieriOggi.map(opzione)}</optgroup>}
            {cantieriAltri.length > 0 && <optgroup label="Altri cantieri">{cantieriAltri.map(opzione)}</optgroup>}
            <option value={LUOGO_NESSUNO}>Non so ancora dove — ore da attribuire</option>
          </select>
          {assegnazioni.isLoading && <p role="status" className="text-xs text-muted-foreground">Caricamento dei tuoi cantieri…</p>}
          {assegnazioni.isError && (
            <p role="alert" className="text-sm text-amber-700">
              Non riesco a verificare i tuoi cantieri.
              <button type="button" className="ml-2 min-h-11 text-primary underline" onClick={() => assegnazioni.refetch()}>Riprova</button>
            </p>
          )}
          {partenza?.tipo === "nessuno" && (
            <p role="status" className="text-xs text-amber-800">Questa entrata registrerà ore da attribuire: l'ufficio dovrà collegarle a un cantiere.</p>
          )}
        </div>
      )}

      {inServizio && (altriDove.length > 0 || altriCantieri.length > 0) && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">Sei arrivato in un altro posto?</p>
          {altriDove.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {altriDove.map(l => {
                const inCorso = cambia.isPending && cambia.variables?.key === l.key;
                return (
                  <button
                    key={l.key}
                    type="button"
                    disabled={occupato}
                    onClick={() => cambia.mutate(l)}
                    className="flex min-h-11 max-w-full items-center gap-2 rounded-xl border bg-background px-3 py-2 text-left text-sm font-semibold active:bg-muted disabled:opacity-50"
                  >
                    {inCorso ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" /> : <IconaLuogo luogo={l} className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    <span className="min-w-0 truncate">{nomeLuogo(l)}</span>
                  </button>
                );
              })}
            </div>
          )}
          {altriCantieri.length > 0 && (
            <select
              aria-label="Altro cantiere"
              value=""
              disabled={occupato}
              onChange={e => { const l = trovaLuogo(luoghi, e.target.value); if (l) cambia.mutate(l); }}
              className="h-11 w-full min-w-0 rounded-xl border bg-background px-3 text-sm"
            >
              <option value="">Altro cantiere…</option>
              {altriCantieri.map(opzione)}
            </select>
          )}
          <p className="text-xs text-muted-foreground">Toccalo quando arrivi: da lì le ore passano al posto nuovo.</p>
        </div>
      )}
      {inPausa && (altriDove.length > 0 || altriCantieri.length > 0) && (
        <p className="text-xs text-muted-foreground">Per cambiare posto termina prima la pausa.</p>
      )}

      <div className="space-y-2" aria-label="Azioni di timbratura">
        {fuori ? (
          <button
            type="button"
            disabled={occupato || !partenza}
            onClick={() => timbra.mutate("entrata")}
            className="flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-green-600 px-3 py-4 text-base font-bold text-white disabled:opacity-50"
          >
            {timbra.isPending ? <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden="true" /> : <LogIn className="h-5 w-5 shrink-0" aria-hidden="true" />}
            INIZIA LA GIORNATA
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={occupato}
              onClick={() => timbra.mutate("uscita")}
              className="flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-red-600 px-3 py-4 text-base font-bold text-white disabled:opacity-50"
            >
              {timbra.isPending ? <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden="true" /> : <LogOut className="h-5 w-5 shrink-0" aria-hidden="true" />}
              FINE GIORNATA
            </button>
            <button
              type="button"
              disabled={occupato}
              onClick={() => timbra.mutate(inPausa ? "pausa_fine" : "pausa_inizio")}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border bg-background px-3 py-3 text-sm font-semibold disabled:opacity-50"
            >
              {inPausa ? <PauseCircle className="h-4 w-4" aria-hidden="true" /> : <Coffee className="h-4 w-4" aria-hidden="true" />}
              {inPausa ? "FINE PAUSA" : "INIZIA PAUSA"}
            </button>
          </>
        )}
      </div>

      <p className="text-[11px] leading-snug text-muted-foreground">
        {gpsStatus === "success" && <span className="text-green-600">GPS attivo — precisione {Math.round(accuracy)}m{address ? ` · ${address}` : ""}</span>}
        {gpsStatus === "loading" && "Acquisizione GPS..."}
        {(gpsStatus === "denied" || gpsStatus === "error" || gpsStatus === "idle") && "GPS non disponibile — timbratura senza posizione"}
      </p>
    </section>
  );
}
