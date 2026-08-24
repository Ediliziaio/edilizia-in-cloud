// ============================================================================
// IndicatoriGuida — "I numeri che comandano" (tab Sintesi del Cruscotto)
// ============================================================================
// Sette indicatori-guida con soglie di allarme, tutti calcolati da dati REALI
// già inseriti in piattaforma (vedi src/lib/indicatoriGuida.ts). Quando un
// dato manca la card non mostra un numero finto: dice cosa inserire e porta
// nel punto giusto dell'app con un link. DSCR e ciclo di cassa non vengono
// ricalcolati qui: vivono già nel Controllo di Gestione (una fonte sola).
//
// UX: ogni card calcolata è cliccabile e porta nell'area che spiega il numero;
// l'icona ⓘ racconta come si calcola; la barra laterale colorata permette di
// leggere lo stato della fila in un colpo d'occhio (stesso linguaggio dei
// semafori del Controllo di Gestione).
// ============================================================================
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  Gauge, Scale, UserRound, CalendarCheck2, HardHat, ShieldCheck,
  Timer, ArrowRight, CircleGauge, Info,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useIndicatoriGuida, type IndicatoriGuidaData } from "@/hooks/useIndicatoriGuida";
import { SOGLIE_INDICATORI, type Indicatore, type StatoIndicatore } from "@/lib/indicatoriGuida";

const STATO_UI: Record<StatoIndicatore, {
  label: string; badge: string; valore: string; bordo: string; icona: string;
}> = {
  ok: {
    label: "OK",
    badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
    valore: "text-emerald-700 dark:text-emerald-400",
    bordo: "border-l-emerald-500",
    icona: "text-emerald-600 dark:text-emerald-400",
  },
  attenzione: {
    label: "Attenzione",
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
    valore: "text-amber-700 dark:text-amber-400",
    bordo: "border-l-amber-500",
    icona: "text-amber-600 dark:text-amber-400",
  },
  allarme: {
    label: "Allarme",
    badge: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300",
    valore: "text-red-700 dark:text-red-400",
    bordo: "border-l-red-500",
    icona: "text-red-600 dark:text-red-400",
  },
  nd: {
    label: "Da attivare",
    badge: "bg-muted text-muted-foreground",
    valore: "text-muted-foreground",
    bordo: "border-l-muted-foreground/30",
    icona: "text-muted-foreground",
  },
};

// Definizione di ogni card: dove porta il click e come si spiega il calcolo.
interface DefIndicatore {
  chiave: keyof Omit<IndicatoriGuidaData, "isLoading">;
  titolo: string;
  icona: LucideIcon;
  unita: string;
  decimali?: number;
  soglia: string;
  href: string;
  comeSiCalcola: string;
}

const s = SOGLIE_INDICATORI;
const DEFINIZIONI: DefIndicatore[] = [
  {
    chiave: "copertura",
    titolo: "Giorni di copertura",
    icona: Gauge,
    unita: " gg",
    soglia: `allarme < ${s.coperturaGiorniAllarme}`,
    href: "/azienda/prima-nota",
    comeSiCalcola:
      "Saldo di Prima Nota ÷ (costi fissi mensili ÷ 30). Risponde a: se da domani non incasso più, per quanti giorni pago comunque tutto?",
  },
  {
    chiave: "accontiSuSaldi",
    titolo: "Acconti ÷ saldi (90 gg)",
    icona: Scale,
    unita: "×",
    decimali: 2,
    soglia: `allarme > ${s.accontiSuSaldiAllarme.toLocaleString("it-IT")}`,
    href: "/azienda/ordini",
    comeSiCalcola:
      "Acconti incassati ÷ saldi incassati negli ultimi 90 giorni. L'acconto è denaro per lavoro ancora da fare: se supera stabilmente i saldi, la cassa sale con soldi non ancora guadagnati.",
  },
  {
    chiave: "quotaPrimoCliente",
    titolo: "Quota primo cliente",
    icona: UserRound,
    unita: "%",
    soglia: `allarme > ${s.quotaPrimoClienteAllarme}%`,
    href: "/azienda/fatturazione",
    comeSiCalcola:
      "Fatturato del cliente più grande ÷ fatturato totale degli ultimi 12 mesi. Sopra il 25% non è più un cliente: è un socio senza capitale che può andarsene quando vuole.",
  },
  {
    chiave: "neiTempi",
    titolo: "Cantieri chiusi nei tempi",
    icona: CalendarCheck2,
    unita: "%",
    soglia: `allarme < ${s.neiTempiAllarme}%`,
    href: "/azienda/ordini",
    comeSiCalcola:
      "Commesse chiuse entro la consegna promessa ÷ commesse chiuse (12 mesi, solo quelle con entrambe le date). Sotto il 70% il problema non è il singolo cantiere: è il sistema.",
  },
  {
    chiave: "saturazione",
    titolo: "Saturazione squadra (mese)",
    icona: HardHat,
    unita: "%",
    soglia: `allarme < ${s.saturazioneAllarme}%`,
    href: "/azienda/costi",
    comeSiCalcola:
      "Ore registrate su commessa ÷ ore contrattuali dei dipendenti attivi, nel mese corrente. Sotto il 65% stai pagando gente per aspettare.",
  },
  {
    chiave: "margineSicurezza",
    titolo: "Margine di sicurezza",
    icona: ShieldCheck,
    unita: "%",
    soglia: `allarme < ${s.margineSicurezzaAllarme}%`,
    href: "/azienda/costi",
    comeSiCalcola:
      "(Venduto 12 mesi − break-even annuo) ÷ venduto. Dice quanto fatturato puoi perdere prima di andare in perdita: sotto il 20%, basta un cliente perso per chiudere l'anno in rosso.",
  },
  {
    chiave: "firmaOrdine",
    titolo: "Apertura → primo ordine",
    icona: Timer,
    unita: " gg",
    soglia: `sano ≤ ${s.firmaOrdineGiorniOk}`,
    href: "/azienda/ordini",
    comeSiCalcola:
      "Mediana dei giorni tra l'apertura della commessa e il primo ordine ai fornitori (6 mesi). Se l'ordine parte tardi, spesso è perché l'acconto di questo cantiere sta pagando quello di ieri.",
  },
];

function formattaValore(ind: Indicatore, unita: string, decimali = 0): string {
  if (ind.valore === null) {
    // Caso speciale: allarme senza valore calcolabile (es. solo acconti, ∞).
    return ind.stato === "allarme" ? "∞" : "—";
  }
  return `${ind.valore.toLocaleString("it-IT", { maximumFractionDigits: decimali })}${unita}`;
}

function CardIndicatore({ def, indicatore }: { def: DefIndicatore; indicatore: Indicatore }) {
  const navigate = useNavigate();
  const ui = STATO_UI[indicatore.stato];
  const cliccabile = indicatore.stato !== "nd";
  const Icona = def.icona;

  return (
    <div
      role={cliccabile ? "button" : undefined}
      tabIndex={cliccabile ? 0 : undefined}
      onClick={cliccabile ? () => navigate(def.href) : undefined}
      onKeyDown={
        cliccabile
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                navigate(def.href);
              }
            }
          : undefined
      }
      className={cn(
        "rounded-xl border border-l-4 bg-card p-4 flex flex-col gap-2 transition-all",
        ui.bordo,
        cliccabile &&
          "cursor-pointer hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icona className={cn("h-4 w-4 shrink-0", ui.icona)} />
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground truncate">
            {def.titolo}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`Come si calcola: ${def.titolo}`}
                onClick={(e) => e.stopPropagation()}
                className="rounded-full p-0.5 text-muted-foreground/60 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[260px] text-xs">
              {def.comeSiCalcola}
            </TooltipContent>
          </Tooltip>
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap", ui.badge)}>
            {ui.label}
          </span>
        </div>
      </div>

      <div className="flex items-baseline gap-2">
        <span className={cn("text-2xl font-bold tabular-nums", ui.valore)}>
          {formattaValore(indicatore, def.unita, def.decimali)}
        </span>
        <span className="text-[11px] text-muted-foreground">{def.soglia}</span>
      </div>

      {indicatore.stato === "nd" && indicatore.mancanti ? (
        <div className="rounded-lg border border-dashed bg-muted/40 p-2.5 space-y-1.5">
          {indicatore.mancanti.map((m) => (
            <div key={m.cosa} className="text-xs">
              <p className="text-muted-foreground">Manca: {m.cosa}.</p>
              <Link
                to={m.link}
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              >
                {m.azione} <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          ))}
        </div>
      ) : (
        indicatore.dettaglio && (
          <p className="text-xs text-muted-foreground leading-snug">{indicatore.dettaglio}</p>
        )
      )}
    </div>
  );
}

export function IndicatoriGuida() {
  const dati = useIndicatoriGuida();

  // Riepilogo stati per la testata: quanti allarmi, quante card da accendere.
  const conteggi: Record<StatoIndicatore, number> = { ok: 0, attenzione: 0, allarme: 0, nd: 0 };
  if (!dati.isLoading) {
    for (const def of DEFINIZIONI) conteggi[dati[def.chiave].stato] += 1;
  }
  const ORDINE_RIEPILOGO: StatoIndicatore[] = ["allarme", "attenzione", "ok", "nd"];

  return (
    <TooltipProvider delayDuration={150}>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <CircleGauge className="h-4 w-4 text-primary" />
              I numeri che comandano
            </CardTitle>
            {dati.isLoading ? (
              <Skeleton className="h-5 w-40" />
            ) : (
              <div className="flex flex-wrap items-center gap-1.5">
                {ORDINE_RIEPILOGO.map(
                  (stato) =>
                    conteggi[stato] > 0 && (
                      <span
                        key={stato}
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-bold",
                          STATO_UI[stato].badge,
                        )}
                      >
                        {conteggi[stato]} {STATO_UI[stato].label.toLowerCase()}
                      </span>
                    ),
                )}
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Solo dati reali: dove il numero è spento, la card dice cosa inserire e dove.
            Tocca una card per aprire l'area che la spiega.
          </p>
        </CardHeader>
        <CardContent>
          {dati.isLoading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {DEFINIZIONI.map((def) => (
                <CardIndicatore key={def.chiave} def={def} indicatore={dati[def.chiave]} />
              ))}

              {/* DSCR e ciclo di cassa vivono nel CdG: una fonte sola, qui solo il ponte. */}
              <Link
                to="/azienda/controllo-gestione"
                className="rounded-xl border border-dashed bg-muted/30 p-4 flex flex-col justify-between gap-2 transition-all hover:-translate-y-0.5 hover:bg-muted/60 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-center gap-2">
                  <CircleGauge className="h-4 w-4 text-muted-foreground" />
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    DSCR · Ciclo di cassa
                  </p>
                </div>
                <p className="text-xs text-muted-foreground leading-snug">
                  DSCR, DSO/DPO e ciclo di cassa completo sono già calcolati negli
                  Indici del Controllo di Gestione.
                </p>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                  Apri gli indici <ArrowRight className="h-3 w-3" />
                </span>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
