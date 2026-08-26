// ============================================================================
// PersonnelCostsTab — "quanto mi costa il personale, mese per mese"
// ============================================================================
// Per ogni dipendente: costo orario aziendale (lordo+oneri / ore contrattuali),
// ore lavorate e straordinari dai rapportini di campo, commesse su cui ha
// lavorato, costo effettivo del mese e saturazione. Ogni riga si espande sul
// dettaglio giornaliero (rapportino per rapportino).
// ============================================================================

import { useState } from "react";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import {
  AlertTriangle,
  ChevronDown,
  Clock,
  HardHat,
  Info,
  Scale,
  UserRound,
  Users,
  Zap,
} from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { NavyStatCard } from "@/components/costi/KpiCard";
import { formatCurrency } from "@/lib/formatters";
import { MonthPicker } from "./MonthPicker";
import {
  useCostiPersonale,
  type CommessaLavorata,
  type DipendenteMese,
  type OperatoreEsterno,
} from "@/hooks/useCostiPersonale";

const fmtOre = (n: number) =>
  Number.isInteger(n) ? `${n}h` : `${n.toFixed(1).replace(".", ",")}h`;

function CommesseChips({ commesse }: { commesse: CommessaLavorata[] }) {
  if (commesse.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  const visible = commesse.slice(0, 2);
  const hidden = commesse.length - visible.length;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((c) => (
        <Badge key={c.orderId} variant="outline" className="max-w-[140px] truncate text-[11px]">
          {c.orderCode ?? "Senza commessa"} · {fmtOre(c.ore + c.oreStraordinario)}
        </Badge>
      ))}
      {hidden > 0 && (
        <Badge variant="secondary" className="text-[11px]">
          +{hidden}
        </Badge>
      )}
    </div>
  );
}

function SaturazioneBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const clamped = Math.min(pct, 100);
  // Soglie del manuale: sotto il 65% la squadra costa piu' di quel che rende,
  // tra 65 e 75 ci si salva appena, dal 75 in su il costo orario regge.
  const color =
    pct === 0
      ? "bg-slate-300"
      : pct < 65
        ? "bg-red-400"
        : pct < 75
          ? "bg-amber-400"
          : pct <= 105
            ? "bg-emerald-500"
            : "bg-orange-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-16 overflow-hidden rounded-full bg-slate-100">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${clamped}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">{pct}%</span>
    </div>
  );
}

function DettaglioRapportini({
  rapportini,
}: {
  rapportini: DipendenteMese["rapportini"];
}) {
  if (rapportini.length === 0) {
    return (
      <p className="px-1 py-2 text-sm text-muted-foreground">
        Nessun rapportino registrato in questo mese.
      </p>
    );
  }
  return (
    <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
      {rapportini.map((r) => (
        <div key={r.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2 text-sm">
          <span className="w-20 shrink-0 font-medium capitalize text-slate-700">
            {format(parseISO(r.data_lavoro), "EEE d MMM", { locale: it })}
          </span>
          <Badge variant="outline" className="shrink-0 text-[11px]">
            {r.orderCode ?? "Senza commessa"}
          </Badge>
          <span className="shrink-0 tabular-nums text-slate-700">{fmtOre(r.ore_lavorate)}</span>
          {r.ore_straordinario > 0 && (
            <Badge className="shrink-0 bg-orange-100 text-[11px] text-orange-800 hover:bg-orange-100">
              +{fmtOre(r.ore_straordinario)} straord.
            </Badge>
          )}
          {r.stato !== "approvato" && (
            <Badge variant="secondary" className="shrink-0 text-[11px] capitalize">
              {r.stato}
            </Badge>
          )}
          {r.descrizione_lavori && (
            <span className="min-w-0 flex-1 basis-full truncate text-xs text-muted-foreground sm:basis-auto">
              {r.descrizione_lavori}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function RigaDipendente({ d }: { d: DipendenteMese }) {
  const [open, setOpen] = useState(false);
  const haOre = d.oreLavorate + d.oreStraordinario > 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="grid w-full grid-cols-2 items-center gap-x-3 gap-y-2 px-4 py-3 text-left sm:grid-cols-[minmax(160px,1.4fr)_90px_110px_minmax(140px,1fr)_120px_110px_24px]"
      >
        {/* Nome + qualifica */}
        <div className="col-span-2 flex min-w-0 items-center gap-2.5 sm:col-span-1">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-400 text-sm font-semibold text-white">
            {d.nome
              .split(" ")
              .map((p) => p[0])
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{d.nome}</p>
            <p className="truncate text-xs text-muted-foreground">
              {[d.qualifica, d.livello].filter(Boolean).join(" · ") || "Dipendente"}
            </p>
          </div>
        </div>

        {/* Costo orario */}
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:hidden">
            Costo orario
          </p>
          <p className="text-sm font-medium tabular-nums text-slate-800">
            {d.costoOrario > 0 ? `${formatCurrency(d.costoOrario)}/h` : "—"}
          </p>
        </div>

        {/* Ore mese */}
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:hidden">
            Ore mese
          </p>
          <p className="text-sm tabular-nums text-slate-800">
            {haOre ? fmtOre(d.oreLavorate) : d.senzaUtente ? "n.d." : "0h"}
            {d.oreStraordinario > 0 && (
              <span className="ml-1 font-medium text-orange-600">
                +{fmtOre(d.oreStraordinario)}
              </span>
            )}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {d.giorniLavorati > 0 ? `${d.giorniLavorati} gg` : d.senzaUtente ? "no accesso campo" : "nessun rapportino"}
          </p>
        </div>

        {/* Commesse */}
        <div className="col-span-2 sm:col-span-1">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:hidden">
            Commesse
          </p>
          <CommesseChips commesse={d.commesse} />
        </div>

        {/* Costo mese */}
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:hidden">
            Costo mese
          </p>
          <p className="text-sm font-semibold tabular-nums text-slate-900">
            {formatCurrency(d.costoEffettivo)}
          </p>
          {d.costoStraordinari > 0 ? (
            <p className="text-[11px] text-orange-600">
              di cui {formatCurrency(d.costoStraordinari)} straord.
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">lordo + oneri {d.inpsRate}%</p>
          )}
        </div>

        {/* Saturazione */}
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:hidden">
            Saturazione
          </p>
          <SaturazioneBar value={d.saturazione} />
          {/* Il costo orario reale: le ore non lavorate si spalmano su quelle
              lavorate. Sotto saturazione piena l'ora vera costa più della busta. */}
          {d.saturazione > 0.05 && d.saturazione < 1 && d.costoOrario > 0 && (
            <p className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">
              ora reale {formatCurrency(d.costoOrario / d.saturazione)}
              <span className="text-muted-foreground/70"> (busta {formatCurrency(d.costoOrario)})</span>
            </p>
          )}
        </div>

        <ChevronDown
          className={cn(
            "hidden h-4 w-4 shrink-0 text-slate-400 transition-transform sm:block",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3">
          <div className="mb-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
            <span>
              Contratto: <strong className="text-slate-700">{formatCurrency(d.lordoMensile)}</strong> lordo
              + <strong className="text-slate-700">{formatCurrency(d.oneriMensili)}</strong> oneri ({d.inpsRate}%)
            </span>
            <span>
              Ore contrattuali: <strong className="text-slate-700">{fmtOre(d.oreContrattuali)}</strong>/mese
            </span>
            {d.oreStraordinario > 0 && (
              <span>
                Straordinari stimati a costo orario base (esclusa maggiorazione CCNL)
              </span>
            )}
          </div>
          <DettaglioRapportini rapportini={d.rapportini} />
        </div>
      )}
    </div>
  );
}

function RigaOperatore({ o }: { o: OperatoreEsterno }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white/70">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-left"
      >
        <UserRound className="h-4 w-4 shrink-0 text-slate-400" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{o.nome}</span>
        <span className="text-sm tabular-nums text-slate-700">
          {fmtOre(o.oreLavorate)}
          {o.oreStraordinario > 0 && (
            <span className="ml-1 font-medium text-orange-600">+{fmtOre(o.oreStraordinario)}</span>
          )}
        </span>
        <span className="text-xs text-muted-foreground">{o.giorniLavorati} gg</span>
        <CommesseChips commesse={o.commesse} />
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3">
          <DettaglioRapportini rapportini={o.rapportini} />
        </div>
      )}
    </div>
  );
}

/** "1.400" o "1400,50" → numero (formato italiano). */
function parseImportoIt(raw: string): number {
  const n = Number(raw.trim().replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// Squadra interna o subappalto: il punto di indifferenza è il numero di
// commesse al mese oltre il quale la squadra interna (costo fisso) batte il
// sub (costo variabile). Si sposta con la quota del sub, quindi la quota la
// scrive il titolare quando arrivano i listini nuovi — non la inventiamo.
// Il confronto per commessa usa la saturazione REALE dai rapportini: sotto
// saturazione piena l'ora interna costa più della busta.
function PuntoIndifferenza({ dipendenti }: { dipendenti: DipendenteMese[] }) {
  const [open, setOpen] = useState(false);
  const [quotaSubRaw, setQuotaSubRaw] = useState("");
  const [orePosaRaw, setOrePosaRaw] = useState("");

  // La squadra di campo del mese: chi ha ore nei rapportini e un contratto.
  const squadra = dipendenti.filter(
    (d) => d.oreLavorate + d.oreStraordinario > 0 && d.lordoMensile > 0,
  );
  const costoMensileSquadra = squadra.reduce((s, d) => s + d.lordoMensile + d.oneriMensili, 0);
  const oreContrattuali = squadra.reduce((s, d) => s + d.oreContrattuali, 0);
  const oreFatte = squadra.reduce((s, d) => s + d.oreLavorate + d.oreStraordinario, 0);
  const saturazione = oreContrattuali > 0 ? oreFatte / oreContrattuali : 0;
  const costoOrarioNominale = oreContrattuali > 0 ? costoMensileSquadra / oreContrattuali : 0;

  const quotaSub = parseImportoIt(quotaSubRaw);
  const orePosa = parseImportoIt(orePosaRaw);

  const puntoIndifferenza = quotaSub > 0 ? costoMensileSquadra / quotaSub : 0;
  const costoInternoCommessa =
    orePosa > 0 && saturazione > 0.05 ? (costoOrarioNominale * orePosa) / saturazione : 0;
  const deltaSub =
    quotaSub > 0 && costoInternoCommessa > 0
      ? (quotaSub - costoInternoCommessa) / costoInternoCommessa
      : null;

  return (
    <Card className="rounded-2xl border-slate-200">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <Scale className="h-4 w-4 shrink-0 text-slate-500" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">Squadra interna o subappalto?</p>
          <p className="truncate text-xs text-muted-foreground">
            Quante commesse al mese servono perché la squadra convenga rispetto al sub
          </p>
        </div>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <CardContent className="space-y-3 border-t border-slate-100 px-4 pb-4 pt-3">
          {squadra.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Questo mese nessun dipendente ha ore nei rapportini di campo: il calcolo parte dal
              costo e dalla saturazione reali della squadra, quindi serve almeno un mese di
              rapportini registrati.
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                La tua squadra di campo questo mese: {squadra.length}{" "}
                {squadra.length === 1 ? "persona" : "persone"},{" "}
                <strong className="text-slate-700">{formatCurrency(costoMensileSquadra)}</strong> al
                mese di busta e oneri, saturazione reale{" "}
                <strong className="text-slate-700">{Math.round(saturazione * 100)}%</strong> dai
                rapportini.
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs font-medium text-slate-700">
                  Quanto ti quota il sub una commessa tipo (€)
                  <Input
                    inputMode="decimal"
                    placeholder="es. 1.400"
                    value={quotaSubRaw}
                    onChange={(e) => setQuotaSubRaw(e.target.value)}
                    className="h-9"
                  />
                </label>
                <label className="space-y-1 text-xs font-medium text-slate-700">
                  Ore di posa della tua squadra su quella commessa
                  <Input
                    inputMode="decimal"
                    placeholder="es. 40"
                    value={orePosaRaw}
                    onChange={(e) => setOrePosaRaw(e.target.value)}
                    className="h-9"
                  />
                </label>
              </div>

              {puntoIndifferenza > 0 && (
                <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-sm text-slate-800">
                  <p>
                    Sotto{" "}
                    <strong>
                      {puntoIndifferenza.toLocaleString("it-IT", { maximumFractionDigits: 1 })}{" "}
                      commesse al mese
                    </strong>{" "}
                    conviene il sub, sopra la squadra.
                  </p>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Si assume sul lavoro <em>sicuro</em>, non sui mesi buoni.
                  </p>
                </div>
              )}

              {orePosa > 0 && saturazione <= 0.05 && (
                <p className="text-xs text-muted-foreground">
                  Con una saturazione del {Math.round(saturazione * 100)}% il confronto per
                  commessa non è affidabile: questo mese ci sono troppo poche ore nei rapportini.
                  Scegli un mese pieno dal selettore qui sopra.
                </p>
              )}

              {costoInternoCommessa > 0 && (
                <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-sm text-slate-800">
                  <p>
                    In casa quella commessa ti costa{" "}
                    <strong>{formatCurrency(costoInternoCommessa)}</strong> di manodopera
                    {deltaSub !== null && (
                      <>
                        {": "}
                        {deltaSub > 0.005 ? (
                          <>
                            il sub è più caro del <strong>{Math.round(deltaSub * 100)}%</strong>
                          </>
                        ) : deltaSub < -0.005 ? (
                          <>
                            il sub è <strong>già più economico</strong>
                          </>
                        ) : (
                          <>il sub costa praticamente uguale</>
                        )}
                      </>
                    )}
                    .
                  </p>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    A busta l'ora vale {formatCurrency(costoOrarioNominale)}, alla saturazione
                    reale del {Math.round(saturazione * 100)}% ne costa{" "}
                    {formatCurrency(saturazione > 0 ? costoOrarioNominale / saturazione : 0)}.
                  </p>
                </div>
              )}
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export function PersonnelCostsTab({
  month,
  onMonthChange,
}: {
  month: Date;
  onMonthChange: (m: Date) => void;
}) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const { dipendenti, altriOperatori, totali, isLoading, isError, errorMessage, refetch } =
    useCostiPersonale(companyId, month);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-56" />
        <div className="grid gap-3 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthPicker month={month} onChange={onMonthChange} />
        <p className="text-xs text-muted-foreground">
          Ore e commesse dai rapportini di campo · costi dal contratto in{" "}
          <Link to="/azienda/personale" className="underline underline-offset-2 hover:text-slate-700">
            Personale
          </Link>
        </p>
      </div>

      {isError && (
        <Alert className="border-red-200 bg-red-50 text-red-900">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>Errore nel caricamento del personale: {errorMessage}</span>
            <Button variant="outline" size="sm" onClick={refetch}>
              Riprova
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Testata navy di famiglia (stessa delle Spese fisse/variabili). */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
        <div className="bg-[#173b67] p-4 text-white sm:p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-[0_8px_18px_rgba(249,115,22,0.28)] sm:h-11 sm:w-11">
              <HardHat className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-100 sm:text-xs">Personale</p>
              <h2 className="mt-0.5 text-base font-semibold text-white sm:text-xl">Le persone: ore vere, costo vero</h2>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-5 sm:gap-3 xl:grid-cols-4">
            <NavyStatCard
              label="Costo personale"
              value={formatCurrency(totali.costoTotale)}
              sub={`${formatCurrency(totali.lordoTotale)} lordi + ${formatCurrency(totali.oneriTotali)} oneri`}
              icon={Users}
              tone="text-orange-100"
            />
            <NavyStatCard
              label="Ore lavorate"
              value={fmtOre(totali.oreLavorate)}
              sub={`${totali.dipendentiConOre} su ${totali.dipendentiAttivi} dipendenti con rapportini`}
              icon={Clock}
            />
            <NavyStatCard
              label="Straordinari"
              value={fmtOre(totali.oreStraordinario)}
              sub={
                totali.costoStraordinari > 0
                  ? `≈ ${formatCurrency(totali.costoStraordinari)} stimati`
                  : "nessuno straordinario registrato"
              }
              icon={Zap}
              tone={totali.oreStraordinario > 0 ? "text-amber-200" : "text-blue-100"}
            />
            <NavyStatCard
              label="Dipendenti attivi"
              value={String(totali.dipendentiAttivi)}
              sub="con contratto attivo in anagrafica"
              icon={HardHat}
              tone="text-emerald-200"
            />
          </div>
        </div>
      </div>

      {/* Elenco dipendenti */}
      {dipendenti.length === 0 ? (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Users className="h-8 w-8 text-slate-300" />
            <div>
              <p className="font-medium text-slate-900">Nessun dipendente in anagrafica</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Aggiungi i dipendenti con stipendio e ore contrattuali per vedere qui il costo del
                personale mese per mese.
              </p>
            </div>
            <Button asChild size="sm">
              <Link to="/azienda/personale">Vai a Personale</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {/* Intestazione colonne (solo desktop) */}
          <div className="hidden grid-cols-[minmax(160px,1.4fr)_90px_110px_minmax(140px,1fr)_120px_110px_24px] gap-x-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:grid">
            <span>Dipendente</span>
            <span>Costo orario</span>
            <span>Ore mese</span>
            <span>Commesse</span>
            <span>Costo mese</span>
            <span className="flex items-center gap-1">
              Saturazione
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[220px] text-xs">
                    Ore registrate nei rapportini rispetto alle ore contrattuali del mese.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </span>
            <span />
          </div>
          {dipendenti.map((d) => (
            <RigaDipendente key={d.employeeId} d={d} />
          ))}
        </div>
      )}

      {/* Operatori con ore ma senza scheda dipendente */}
      {altriOperatori.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 pt-2">
            <h3 className="text-sm font-semibold text-slate-900">Altri operatori sul campo</h3>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 cursor-help text-slate-400" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[260px] text-xs">
                  Hanno registrato rapportini ma non hanno una scheda dipendente collegata: le ore
                  sono visibili, il costo no. Collega l'utente in Personale per il costo completo.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          {altriOperatori.map((o) => (
            <RigaOperatore key={o.userId} o={o} />
          ))}
        </div>
      )}

      {/* Interno o sub: il conto si fa sui dati veri della squadra del mese */}
      {dipendenti.length > 0 && <PuntoIndifferenza dipendenti={dipendenti} />}
    </div>
  );
}

export default PersonnelCostsTab;
