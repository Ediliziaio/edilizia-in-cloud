/**
 * Bottone «Timbra» nella barra in alto (accanto alla ricerca): entrata, uscita
 * e pausa da ovunque, con le ore di oggi. Dallo stesso punto si apre «Il mio
 * stato»: in cima un riepilogo (ore del mese, ore in più, ferie e permessi
 * residui, ultimo netto), sotto le pagine personali già esistenti a schede.
 * Lo vede tutto lo staff con un profilo HR, titolare compreso (agli admin le
 * linguette personali di Attività non compaiono: questo è il loro accesso).
 * Chi non ha un profilo HR non lo vede.
 *
 * Dati e calcoli sono gli STESSI hook delle pagine personali (stesse chiavi di
 * cache): niente doppioni, e timbrare da qui aggiorna anche la scheda «Ore».
 */
import { lazy, Suspense, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { Fingerprint, PlayCircle, PauseCircle, LogOut, Loader2, ChevronRight, Clock, Palmtree, Receipt } from "lucide-react";
import { toast } from "sonner";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useAuth } from "@/contexts/AuthContext";
import { calcolaOreLavorate, riepilogoMese, useMyHrProfilo, useMyTimbratureMese, useMyTodayTimbrature, useTimbra } from "@/hooks/useTimbratura";
import { useMyCedolini } from "@/hooks/useMyCedolini";
import type { TimbraturaTipo } from "@/types/hr";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

// Le pagine personali, caricate solo quando si apre «Il mio stato».
const TimbraturePersonali = lazy(() => import("@/pages/azienda/TimbraturePersonali"));
const FeriePersonali = lazy(() => import("@/pages/azienda/FeriePersonali"));
const CedoliniPersonali = lazy(() => import("@/pages/azienda/CedoliniPersonali"));

type SchedaStato = "ore" | "ferie" | "cedolini";

const VOCI_STATO: Array<{ scheda: SchedaStato; label: string; icona: typeof Clock }> = [
  { scheda: "ore", label: "Le mie ore", icona: Clock },
  { scheda: "ferie", label: "Ferie, permessi e straordinari", icona: Palmtree },
  { scheda: "cedolini", label: "Cedolini e contributi", icona: Receipt },
];

const MESI = ["", "gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
/** 7,5 → «7h 30m». */
const fmtOre = (h: number) => { const m = Math.round(h * 60); return `${Math.floor(m / 60)}h ${m % 60}m`; };
const fmtEuro = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });

const Caricamento = () => <div className="space-y-2 p-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-32 w-full" /></div>;

/** Una tessera del riepilogo: numero grande, etichetta, dettaglio; tocca → scheda. */
function Tessera({ etichetta, valore, dettaglio, tono, onClick }: { etichetta: string; valore: ReactNode; dettaglio?: ReactNode; tono?: "verde" | "ambra"; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn(
      "flex min-w-0 flex-col rounded-xl border px-3 py-2 text-left transition hover:bg-muted/60",
      tono === "verde" && "border-green-200 bg-green-50/60", tono === "ambra" && "border-amber-200 bg-amber-50/60",
    )}>
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{etichetta}</span>
      <span className="mt-0.5 text-lg font-bold tabular-nums">{valore}</span>
      {dettaglio && <span className="truncate text-xs text-muted-foreground">{dettaglio}</span>}
    </button>
  );
}

/** Il colpo d'occhio di «Il mio stato»: monta solo a popup aperto (le query partono lì). */
function RiepilogoStato({ onApri }: { onApri: (s: SchedaStato) => void }) {
  const { data: profilo } = useMyHrProfilo();
  const meseCorrente = format(new Date(), "yyyy-MM");
  const { data: timbratureMese = [], isLoading: loadingMese } = useMyTimbratureMese(profilo?.id, meseCorrente);
  const { cedolini, loadingCedolini, employeeId } = useMyCedolini();
  if (!profilo) return null;

  const mese = riepilogoMese(timbratureMese, profilo.ore_giornaliere);
  const ultimo = cedolini[0];
  const permessiOre = (profilo.permessi_residui_ore ?? 0) + (profilo.rol_residuo_ore ?? 0);

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Tessera etichetta="Ore del mese" onClick={() => onApri("ore")}
        valore={loadingMese ? "…" : fmtOre(mese.ore)}
        dettaglio={mese.oreAttese > 0 ? `su ${fmtOre(mese.oreAttese)} attese · ${mese.giorniPresenti} gg` : `${mese.giorniPresenti} giorni presenti`} />
      <Tessera etichetta="Ore in più" onClick={() => onApri("ferie")} tono={mese.oreInPiu > 0 ? "ambra" : undefined}
        valore={loadingMese ? "…" : fmtOre(mese.oreInPiu)}
        dettaglio={mese.oreInPiu > 0 ? "oltre il contratto: chiedi lo straordinario" : "nessuna oltre il contratto"} />
      <Tessera etichetta="Ferie residue" onClick={() => onApri("ferie")} tono="verde"
        valore={`${profilo.ferie_residue ?? 0} gg`}
        dettaglio={`permessi e ROL: ${permessiOre} h`} />
      <Tessera etichetta="Ultimo netto" onClick={() => onApri("cedolini")}
        valore={loadingCedolini && employeeId ? "…" : ultimo ? fmtEuro(ultimo.netto) : "—"}
        dettaglio={ultimo
          ? `${MESI[ultimo.mese] ?? ultimo.mese} ${ultimo.anno}${ultimo.contributi_dipendente != null ? ` · contributi ${fmtEuro(ultimo.contributi_dipendente)}` : ""}`
          : "nessun cedolino"} />
    </div>
  );
}

/** Gli stessi ruoli che le pagine personali (Ore, Ferie, Cedolini) lasciano entrare. */
const RUOLI_CON_STATO = ["company_staff", "company_admin"];

export function TimbraHeaderButton() {
  const companyId = useEffectiveCompanyId();
  const { role } = useAuth();
  const { data: profilo, isLoading: loadingProfilo } = useMyHrProfilo();
  const { data: timbratureOggi = [], isLoading: loadingTimbrature } = useMyTodayTimbrature(profilo?.id);
  const timbra = useTimbra();
  const [popoverAperto, setPopoverAperto] = useState(false);
  // Scheda aperta in «Il mio stato» (null = popup chiuso). Si apre anche da un
  // link (?stato=cedolini, l'avviso «È arrivata la tua busta paga») su qualunque pagina.
  const [schedaScelta, setSchedaScelta] = useState<SchedaStato | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const daLink = searchParams.get("stato");
  // Timbrare: chiunque abbia un profilo HR. «Il mio stato»: solo i ruoli a cui le
  // pagine personali (Ore, Ferie, Cedolini) si aprono, altrimenti schede bloccate.
  const conStato = !role || RUOLI_CON_STATO.includes(role);
  const scheda: SchedaStato | null = !conStato ? null
    : schedaScelta ?? (VOCI_STATO.some((v) => v.scheda === daLink) ? (daLink as SchedaStato) : null);
  const setScheda = (s: SchedaStato | null) => {
    setSchedaScelta(s);
    if (daLink) {
      const p = new URLSearchParams(searchParams);
      p.delete("stato");
      setSearchParams(p, { replace: true });
    }
  };

  // Chi non ha un profilo HR non timbra: niente bottone.
  if (!loadingProfilo && !profilo) return null;

  const last = timbratureOggi[timbratureOggi.length - 1];
  const isEntrato = last?.tipo === "entrata" || last?.tipo === "pausa_fine" || last?.tipo === "fine_pausa";
  const isInPausa = last?.tipo === "pausa_inizio" || last?.tipo === "inizio_pausa";
  const isUscito = last?.tipo === "uscita";
  const nonHaTimbrato = !last;
  const busy = timbra.isPending;
  const ore = calcolaOreLavorate(timbratureOggi);

  const dotCls = isEntrato ? "bg-green-500" : isInPausa ? "bg-amber-500" : "bg-slate-400";
  const statoLabel = isUscito ? "Giornata completata" : isInPausa ? "In pausa" : isEntrato ? "In servizio" : "Non hai ancora timbrato";
  const trigger = loadingTimbrature ? { label: "Timbra", cls: "", ore: false }
    : nonHaTimbrato ? { label: "Timbra entrata", cls: "border-green-300 bg-green-50 text-green-800 hover:bg-green-100", ore: false }
    : isInPausa ? { label: "In pausa", cls: "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100", ore: true }
    : isEntrato ? { label: "Timbra uscita", cls: "border-red-200 bg-red-50 text-red-700 hover:bg-red-100", ore: true }
    : { label: "Giornata finita", cls: "", ore: true };
  const apriStato =(s: SchedaStato) => { setPopoverAperto(false); setScheda(s); };
  const fai = (tipo: TimbraturaTipo) => {
    if (!companyId || !profilo) return;
    timbra.mutate({ companyId, profiloId: profilo.id, tipo, gps: null }, { onSuccess: () => toast.success("Timbratura registrata") });
  };

  return (
    <>
      <Popover open={popoverAperto} onOpenChange={setPopoverAperto}>
        <PopoverTrigger asChild>
          {/* Il bottone dice la prossima mossa; il clic apre il popup (mai una
              timbratura per sbaglio da un clic distratto nella barra). */}
          <Button variant="outline" size="sm" title="Timbra e il mio stato" aria-label="Timbra e il mio stato"
            className={cn("inline-flex h-9 shrink-0 gap-1.5 rounded-full px-2.5 text-xs font-semibold sm:px-3", trigger.cls)}>
            <Fingerprint className="h-4 w-4" aria-hidden="true" />
            <span className={cn("h-2 w-2 rounded-full", dotCls, (isEntrato || isInPausa) && "animate-pulse")} />
            {/* Dal telefono basta l'icona col pallino di stato: la scritta dal tablet in su. */}
            <span className="hidden sm:inline">{trigger.label}</span>
            {trigger.ore && <span className="hidden font-normal tabular-nums opacity-80 lg:inline">· {fmtOre(ore)}</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-3">
          {(loadingProfilo || loadingTimbrature) ? (
            <div className="space-y-2"><Skeleton className="h-8 w-full" /><Skeleton className="h-9 w-full" /></div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className={cn("h-2 w-2 rounded-full", dotCls, (isEntrato || isInPausa) && "animate-pulse")} />
                <span className="text-sm font-medium">{statoLabel}</span>
                {!nonHaTimbrato && <span className="ml-auto text-xs font-semibold text-amber-600">{fmtOre(ore)} oggi</span>}
              </div>
              {!isUscito && (
                <div className="flex flex-wrap gap-2">
                  {nonHaTimbrato && <Button size="sm" className="flex-1 gap-1.5 bg-green-600 text-white hover:bg-green-700" disabled={busy} onClick={() => fai("entrata")}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}Entrata</Button>}
                  {isEntrato && <>
                    <Button size="sm" variant="outline" className="flex-1 gap-1.5" disabled={busy} onClick={() => fai("pausa_inizio")}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PauseCircle className="h-3.5 w-3.5" />}Pausa</Button>
                    <Button size="sm" variant="destructive" className="flex-1 gap-1.5" disabled={busy} onClick={() => fai("uscita")}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}Uscita</Button>
                  </>}
                  {isInPausa && <>
                    <Button size="sm" className="flex-1 gap-1.5 bg-amber-600 text-white hover:bg-amber-700" disabled={busy} onClick={() => fai("pausa_fine")}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}Riprendi</Button>
                    <Button size="sm" variant="destructive" className="flex-1 gap-1.5" disabled={busy} onClick={() => fai("uscita")}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}Uscita</Button>
                  </>}
                </div>
              )}
              {last?.ora_evento && <p className="text-xs text-muted-foreground">Ultima timbratura: {last.ora_evento.slice(0, 5)}</p>}
              {conStato && <div className="border-t pt-2 text-sm">
                <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Il mio stato</p>
                {VOCI_STATO.map(({ scheda: s, label, icona: Icona }) => (
                  <button key={s} type="button" onClick={() => apriStato(s)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted">
                    <Icona className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <span className="flex-1">{label}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  </button>
                ))}
              </div>}
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* «Il mio stato»: riepilogo in cima, poi ore, ferie/permessi/straordinari, cedolini e contributi. */}
      <Dialog open={!!scheda} onOpenChange={(aperto) => { if (!aperto) setScheda(null); }}>
        <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Il mio stato{profilo?.nome ? ` · ${[profilo.nome, profilo.cognome].filter(Boolean).join(" ")}` : ""}</DialogTitle>
          </DialogHeader>
          {scheda && (
            <div className="space-y-4">
              <RiepilogoStato onApri={setScheda} />
              <Tabs value={scheda} onValueChange={(v) => setScheda(v as SchedaStato)}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="ore" className="gap-1.5 text-xs sm:text-sm"><Clock className="h-4 w-4" />Ore</TabsTrigger>
                  <TabsTrigger value="ferie" className="gap-1.5 text-xs sm:text-sm"><Palmtree className="h-4 w-4" />Ferie e permessi</TabsTrigger>
                  <TabsTrigger value="cedolini" className="gap-1.5 text-xs sm:text-sm"><Receipt className="h-4 w-4" />Cedolini</TabsTrigger>
                </TabsList>
                <TabsContent value="ore" className="mt-3"><Suspense fallback={<Caricamento />}><TimbraturePersonali /></Suspense></TabsContent>
                <TabsContent value="ferie" className="mt-3"><Suspense fallback={<Caricamento />}><FeriePersonali /></Suspense></TabsContent>
                <TabsContent value="cedolini" className="mt-3"><Suspense fallback={<Caricamento />}><CedoliniPersonali /></Suspense></TabsContent>
              </Tabs>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
