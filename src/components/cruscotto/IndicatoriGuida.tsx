// ============================================================================
// IndicatoriGuida — "I numeri che comandano" (tab Sintesi del Cruscotto)
// ============================================================================
// Sette indicatori-guida con soglie di allarme, tutti calcolati da dati REALI
// già inseriti in piattaforma (vedi src/lib/indicatoriGuida.ts). Quando un
// dato manca la card non mostra un numero finto: dice cosa inserire e porta
// nel punto giusto dell'app con un link. DSCR e ciclo di cassa non vengono
// ricalcolati qui: vivono già nel Controllo di Gestione (una fonte sola).
// ============================================================================
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Gauge, Scale, UserRound, CalendarCheck2, HardHat, ShieldCheck,
  Timer, ArrowRight, CircleGauge,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useIndicatoriGuida } from "@/hooks/useIndicatoriGuida";
import { SOGLIE_INDICATORI, type Indicatore, type StatoIndicatore } from "@/lib/indicatoriGuida";

const STATO_UI: Record<StatoIndicatore, { label: string; badge: string; valore: string }> = {
  ok: {
    label: "OK",
    badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
    valore: "text-emerald-700 dark:text-emerald-400",
  },
  attenzione: {
    label: "Attenzione",
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
    valore: "text-amber-700 dark:text-amber-400",
  },
  allarme: {
    label: "Allarme",
    badge: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300",
    valore: "text-red-700 dark:text-red-400",
  },
  nd: {
    label: "Da attivare",
    badge: "bg-muted text-muted-foreground",
    valore: "text-muted-foreground",
  },
};

function formattaValore(ind: Indicatore, unita: string, decimali = 0): string {
  if (ind.valore === null) {
    // Caso speciale: allarme senza valore calcolabile (es. solo acconti, ∞).
    return ind.stato === "allarme" ? "∞" : "—";
  }
  return `${ind.valore.toLocaleString("it-IT", { maximumFractionDigits: decimali })}${unita}`;
}

function CardIndicatore({
  titolo,
  icona: Icona,
  indicatore,
  unita,
  decimali,
  soglia,
}: {
  titolo: string;
  icona: LucideIcon;
  indicatore: Indicatore;
  unita: string;
  decimali?: number;
  soglia: string;
}) {
  const ui = STATO_UI[indicatore.stato];
  return (
    <div className="rounded-xl border bg-card p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icona className="h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground truncate">
            {titolo}
          </p>
        </div>
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap", ui.badge)}>
          {ui.label}
        </span>
      </div>

      <div className="flex items-baseline gap-2">
        <span className={cn("text-2xl font-bold tabular-nums", ui.valore)}>
          {formattaValore(indicatore, unita, decimali)}
        </span>
        <span className="text-[11px] text-muted-foreground">{soglia}</span>
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
  const s = SOGLIE_INDICATORI;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CircleGauge className="h-4 w-4 text-primary" />
            I numeri che comandano
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Solo dati reali: dove il numero è spento, la card dice cosa inserire.
          </p>
        </div>
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
            <CardIndicatore
              titolo="Giorni di copertura"
              icona={Gauge}
              indicatore={dati.copertura}
              unita=" gg"
              soglia={`allarme < ${s.coperturaGiorniAllarme}`}
            />
            <CardIndicatore
              titolo="Acconti ÷ saldi (90 gg)"
              icona={Scale}
              indicatore={dati.accontiSuSaldi}
              unita="×"
              decimali={2}
              soglia={`allarme > ${s.accontiSuSaldiAllarme.toLocaleString("it-IT")}`}
            />
            <CardIndicatore
              titolo="Quota primo cliente"
              icona={UserRound}
              indicatore={dati.quotaPrimoCliente}
              unita="%"
              soglia={`allarme > ${s.quotaPrimoClienteAllarme}%`}
            />
            <CardIndicatore
              titolo="Cantieri chiusi nei tempi"
              icona={CalendarCheck2}
              indicatore={dati.neiTempi}
              unita="%"
              soglia={`allarme < ${s.neiTempiAllarme}%`}
            />
            <CardIndicatore
              titolo="Saturazione squadra (mese)"
              icona={HardHat}
              indicatore={dati.saturazione}
              unita="%"
              soglia={`allarme < ${s.saturazioneAllarme}%`}
            />
            <CardIndicatore
              titolo="Margine di sicurezza"
              icona={ShieldCheck}
              indicatore={dati.margineSicurezza}
              unita="%"
              soglia={`allarme < ${s.margineSicurezzaAllarme}%`}
            />
            <CardIndicatore
              titolo="Apertura → primo ordine"
              icona={Timer}
              indicatore={dati.firmaOrdine}
              unita=" gg"
              soglia={`sano ≤ ${s.firmaOrdineGiorniOk}`}
            />

            {/* DSCR e ciclo di cassa vivono nel CdG: una fonte sola, qui solo il ponte. */}
            <Link
              to="/azienda/controllo-gestione"
              className="rounded-xl border border-dashed bg-muted/30 p-4 flex flex-col justify-between gap-2 transition-colors hover:bg-muted/60"
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
  );
}
