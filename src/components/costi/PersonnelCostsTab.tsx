// ============================================================================
// PersonnelCostsTab — "quanto mi costa il personale, mese per mese"
// ============================================================================
// Per ogni dipendente: costo orario aziendale (lordo+oneri / ore contrattuali),
// ore lavorate e straordinari dai rapportini di campo, commesse su cui ha
// lavorato, costo effettivo del mese e saturazione. Ogni riga si espande sul
// dettaglio giornaliero (rapportino per rapportino).
// ============================================================================

import { useState } from "react";
import { Ciambella, COLORI_CIAMBELLA } from "@/components/charts/grafici/Ciambella";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
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
import { useT, intlCampo, dateFnsCampo } from "@/lib/campo/lingua/LinguaCampo";

const fmtOre = (n: number) =>
  Number.isInteger(n) ? `${n}h` : `${n.toFixed(1).replace(".", ",")}h`;

function CommesseChips({ commesse }: { commesse: CommessaLavorata[] }) {
  const t = useT();
  if (commesse.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  const visible = commesse.slice(0, 2);
  const hidden = commesse.length - visible.length;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((c) => (
        <Badge key={c.orderId} variant="outline" className="max-w-[140px] truncate text-[11px]">
          {c.orderCode ?? t("Senza commessa")} · {fmtOre(c.ore + c.oreStraordinario)}
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
      <div className="h-2 w-16 overflow-hidden rounded-full bg-muted">
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
  const t = useT();
  if (rapportini.length === 0) {
    return (
      <p className="px-1 py-2 text-sm text-muted-foreground">
        {t("Nessun rapportino registrato in questo mese.")}
      </p>
    );
  }
  return (
    <div className="divide-y divide-border/60 rounded-lg border border-border bg-card">
      {rapportini.map((r) => (
        <div key={r.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2 text-sm">
          <span className="w-20 shrink-0 font-medium capitalize text-muted-foreground">
            {format(parseISO(r.data_lavoro), "EEE d MMM", { locale: dateFnsCampo() })}
          </span>
          <Badge variant="outline" className="shrink-0 text-[11px]">
            {r.orderCode ?? t("Senza commessa")}
          </Badge>
          <span className="shrink-0 tabular-nums text-muted-foreground">{fmtOre(r.ore_lavorate)}</span>
          {r.ore_straordinario > 0 && (
            <Badge className="shrink-0 bg-orange-100 text-[11px] text-orange-800 hover:bg-orange-100">{t("+{ore_straordinario} straord.", { ore_straordinario: fmtOre(r.ore_straordinario) })}</Badge>
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
  const t = useT();
  const [open, setOpen] = useState(false);
  const haOre = d.oreLavorate + d.oreStraordinario > 0;

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        // Tra 640 e 1280 senza la colonna Commesse (resta nel dettaglio che si
        // apre): con sette colonne la riga era 858px e a 1024 usciva di lato.
        className="grid w-full grid-cols-2 items-center gap-x-3 gap-y-2 px-4 py-3 text-left sm:grid-cols-[minmax(140px,1fr)_84px_100px_110px_100px_20px] xl:grid-cols-[minmax(160px,1.4fr)_90px_110px_minmax(140px,1fr)_120px_110px_24px]"
      >
        {/* Nome + qualifica */}
        <div className="col-span-2 flex min-w-0 items-center gap-2.5 sm:col-span-1">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-eic-amber text-sm font-semibold text-white">
            {d.nome
              .split(" ")
              .map((p) => p[0])
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{d.nome}</p>
            <p className="truncate text-xs text-muted-foreground">
              {[d.qualifica, d.livello].filter(Boolean).join(" · ") || t("Dipendente")}
            </p>
          </div>
        </div>

        {/* Costo orario */}
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:hidden">
            {t("Costo orario")}
          </p>
          <p className="text-sm font-medium tabular-nums text-foreground">
            {d.costoOrario > 0 ? `${formatCurrency(d.costoOrario)}/h` : "—"}
          </p>
        </div>

        {/* Ore mese */}
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:hidden">
            {t("Ore mese")}
          </p>
          <p className="text-sm tabular-nums text-foreground">
            {haOre ? fmtOre(d.oreLavorate) : d.senzaUtente ? "n.d." : "0h"}
            {d.oreStraordinario > 0 && (
              <span className="ml-1 font-medium text-orange-600">
                +{fmtOre(d.oreStraordinario)}
              </span>
            )}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {d.giorniLavorati > 0 ? t("{giorniLavorati} gg", { giorniLavorati: String(d.giorniLavorati ?? "") }) : d.senzaUtente ? t("no accesso campo") : t("nessun rapportino")}
          </p>
        </div>

        {/* Commesse */}
        <div className="col-span-2 sm:col-span-1 sm:max-xl:hidden">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:hidden">
            {t("Commesse")}
          </p>
          <CommesseChips commesse={d.commesse} />
        </div>

        {/* Costo mese */}
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:hidden">
            {t("Costo mese")}
          </p>
          <p className="text-sm font-semibold tabular-nums text-foreground">
            {formatCurrency(d.costoEffettivo)}
          </p>
          {d.costoStraordinari > 0 ? (
            <p className="text-[11px] text-orange-600">{t("di cui {costoStraordinari} straord.", { costoStraordinari: formatCurrency(d.costoStraordinari) })}</p>
          ) : (
            <p className="text-[11px] text-muted-foreground">{t("lordo + oneri {oneriPercento}%", { oneriPercento: d.oneriPercento.toLocaleString(intlCampo()) })}</p>
          )}
        </div>

        {/* Saturazione */}
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:hidden">
            {t("Saturazione")}
          </p>
          <SaturazioneBar value={d.saturazione} />
          {/* Il costo orario reale: le ore non lavorate si spalmano su quelle
              lavorate. Sotto saturazione piena l'ora vera costa più della busta. */}
          {d.saturazione > 0.05 && d.saturazione < 1 && d.costoOrario > 0 && (
            <p className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">
              {t("ora reale {costo}", { costo: formatCurrency(d.costoOrario / d.saturazione) })}
              <span className="text-muted-foreground/70">{" "}{t("(busta {costoOrario})", { costoOrario: formatCurrency(d.costoOrario) })}</span>
            </p>
          )}
        </div>

        <ChevronDown
          className={cn(
            "hidden h-4 w-4 shrink-0 text-muted-foreground/80 transition-transform sm:block",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="border-t border-border/60 bg-muted/50/60 px-4 py-3">
          <div className="mb-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
            <span title={t("Oneri: mensilità aggiuntive, contributi, INAIL, Cassa Edile e TFR del tipo di dipendente")}>
              {t("Contratto: {lordo} lordo + {oneri} oneri ({pct}%)", { lordo: formatCurrency(d.lordoMensile), oneri: formatCurrency(d.oneriMensili), pct: d.oneriPercento.toLocaleString(intlCampo()) })}
            </span>
            <span>
              {t("Ore contrattuali: {ore}/mese", { ore: fmtOre(d.oreContrattuali) })}
            </span>
            {d.oreStraordinario > 0 && (
              <span>
                {t("Straordinari stimati a costo orario base (esclusa maggiorazione CCNL)")}
              </span>
            )}
          </div>
          {/* Tra 640 e 1280 la colonna Commesse non c'è: le commesse stanno qui. */}
          <div className="mb-3 hidden sm:block xl:hidden">
            <CommesseChips commesse={d.commesse} />
          </div>
          <DettaglioRapportini rapportini={d.rapportini} />
        </div>
      )}
    </div>
  );
}

function RigaOperatore({ o }: { o: OperatoreEsterno }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white/70">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-left"
      >
        <UserRound className="h-4 w-4 shrink-0 text-muted-foreground/80" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{o.nome}</span>
        <span className="text-sm tabular-nums text-muted-foreground">
          {fmtOre(o.oreLavorate)}
          {o.oreStraordinario > 0 && (
            <span className="ml-1 font-medium text-orange-600">+{fmtOre(o.oreStraordinario)}</span>
          )}
        </span>
        <span className="text-xs text-muted-foreground">{t("{giorniLavorati} gg", { giorniLavorati: String(o.giorniLavorati ?? "") })}</span>
        <CommesseChips commesse={o.commesse} />
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground/80 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="border-t border-border/60 bg-muted/50/60 px-4 py-3">
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
  const t = useT();
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
    <Card className="rounded-2xl border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <Scale className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{t("Squadra interna o subappalto?")}</p>
          <p className="truncate text-xs text-muted-foreground">
            {t("Quante commesse al mese servono perché la squadra convenga rispetto al sub")}
          </p>
        </div>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-muted-foreground/80 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <CardContent className="space-y-3 border-t border-border/60 px-4 pb-4 pt-3">
          {squadra.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("Questo mese nessun dipendente ha ore nei rapportini di campo: il calcolo parte dal costo e dalla saturazione reali della squadra, quindi serve almeno un mese di rapportini registrati.")}
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {squadra.length === 1
                  ? t("La tua squadra di campo questo mese: {n} persona, {costo} al mese di busta e oneri, saturazione reale {pct}% dai rapportini.", { n: squadra.length, costo: formatCurrency(costoMensileSquadra), pct: Math.round(saturazione * 100) })
                  : t("La tua squadra di campo questo mese: {n} persone, {costo} al mese di busta e oneri, saturazione reale {pct}% dai rapportini.", { n: squadra.length, costo: formatCurrency(costoMensileSquadra), pct: Math.round(saturazione * 100) })}
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs font-medium text-muted-foreground">
                  {t("Quanto ti quota il sub una commessa tipo (€)")}
                  <Input
                    inputMode="decimal"
                    placeholder={t("es. 1.400")}
                    value={quotaSubRaw}
                    onChange={(e) => setQuotaSubRaw(e.target.value)}
                    className="h-9"
                  />
                </label>
                <label className="space-y-1 text-xs font-medium text-muted-foreground">
                  {t("Ore di posa della tua squadra su quella commessa")}
                  <Input
                    inputMode="decimal"
                    placeholder={t("es. 40")}
                    value={orePosaRaw}
                    onChange={(e) => setOrePosaRaw(e.target.value)}
                    className="h-9"
                  />
                </label>
              </div>

              {puntoIndifferenza > 0 && (
                <div className="rounded-lg border border-border bg-muted/50/70 p-3 text-sm text-foreground">
                  <p>
                    {t("Sotto {puntoIndifferenza} commesse al mese conviene il sub, sopra la squadra.", { puntoIndifferenza: puntoIndifferenza.toLocaleString(intlCampo(), { maximumFractionDigits: 1 }) })}
                  </p>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {t("Si assume sul lavoro sicuro, non sui mesi buoni.")}
                  </p>
                </div>
              )}

              {orePosa > 0 && saturazione <= 0.05 && (
                <p className="text-xs text-muted-foreground">{t("Con una saturazione del {valore}% il confronto per commessa non è affidabile: questo mese ci sono troppo poche ore nei rapportini. Scegli un mese pieno dal selettore qui sopra.", { valore: Math.round(saturazione * 100) })}</p>
              )}

              {costoInternoCommessa > 0 && (
                <div className="rounded-lg border border-border bg-muted/50/70 p-3 text-sm text-foreground">
                  <p>
                    {t("In casa quella commessa ti costa {costo} di manodopera", { costo: formatCurrency(costoInternoCommessa) })}
                    {deltaSub !== null && (
                      <>
                        {": "}
                        {deltaSub > 0.005 ? (
                          <>
                            {t("il sub è più caro del {pct}%", { pct: Math.round(deltaSub * 100) })}
                          </>
                        ) : deltaSub < -0.005 ? (
                          <>
                            {t("il sub è già più economico")}
                          </>
                        ) : (
                          <>{t("il sub costa praticamente uguale")}</>
                        )}
                      </>
                    )}
                    .
                  </p>
                  <p className="mt-1.5 text-xs text-muted-foreground">{t("A busta l'ora vale {costoOrarioNominale}, alla saturazione reale del {valore}% ne costa {valore2}.", { costoOrarioNominale: formatCurrency(costoOrarioNominale), valore: Math.round(saturazione * 100), valore2: formatCurrency(saturazione > 0 ? costoOrarioNominale / saturazione : 0) })}</p>
                </div>
              )}
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}

/**
 * Dove vanno le ore del mese: le commesse con più ore dai rapportini, col costo
 * stimato (ore × costo orario di chi le ha fatte), e la parte di straordinari.
 */
function DoveVannoLeOre({ dipendenti, totali }: { dipendenti: DipendenteMese[]; totali: { oreLavorate: number; oreStraordinario: number } }) {
  const t = useT();
  const perCommessa = new Map<string, { codice: string; ore: number; costo: number; persone: Set<string> }>();
  for (const d of dipendenti) {
    for (const c of d.commesse) {
      const r = perCommessa.get(c.orderId) ?? { codice: c.orderCode, ore: 0, costo: 0, persone: new Set<string>() };
      // Ordinarie più straordinari, al costo orario di chi le ha fatte (stima).
      r.ore += c.ore + c.oreStraordinario;
      r.costo += (c.ore + c.oreStraordinario) * d.costoOrario;
      r.persone.add(d.employeeId);
      perCommessa.set(c.orderId, r);
    }
  }
  const righe = [...perCommessa.values()].sort((a, b) => b.ore - a.ore);
  const prime = righe.slice(0, 6);
  const max = Math.max(1, ...prime.map((r) => r.ore));
  // oreLavorate sono le ordinarie: gli straordinari stanno a parte (come nella saturazione).
  const oreTot = totali.oreLavorate + totali.oreStraordinario;
  const pctStraord = oreTot > 0 ? Math.round((totali.oreStraordinario / oreTot) * 100) : 0;
  // 14/11/2026: solo chi ha ore nei rapportini del mese. Con impiegati e persone senza
  // rapportini la media su Demo 2 dava 1% (8 persone al 4,6% divise per 42).
  const saturazioni = dipendenti.filter((d) => d.oreContrattuali > 0 && d.oreLavorate + d.oreStraordinario > 0).map((d) => d.saturazione);
  // La saturazione è un rapporto (1 = tutte le ore del contratto).
  const satMedia = saturazioni.length ? Math.round((saturazioni.reduce((a, b) => a + b, 0) / saturazioni.length) * 100) : null;
  if (oreTot <= 0 || prime.length === 0) return null;
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
      <Card className="rounded-2xl shadow-sm motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-500 motion-safe:fill-mode-both">
        <CardContent className="p-4">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">{t("Ore del mese per commessa")}</h3>
            <span className="text-[11px] text-muted-foreground">{t("{n} commesse · costo stimato su ore × costo orario", { n: righe.length })}</span>
          </div>
          {/* 14/11/2026: accanto all'elenco, il costo stimato del mese diviso per commessa. */}
          <div className="grid items-start gap-4 md:grid-cols-[140px_minmax(0,1fr)]">
          <div className="max-md:hidden">
            <Ciambella
              titolo={t("Costo stimato per commessa")}
              etichettaCentro={t("Costo")}
              dimensione={140}
              legenda={false}
              massimo={7}
              fette={righe.map((r, i) => ({ nome: r.codice, valore: r.costo, colore: COLORI_CIAMBELLA[i % COLORI_CIAMBELLA.length] }))}
            />
          </div>
          <ol className="space-y-2">
            {prime.map((r, i) => (
              <li key={r.codice + i} className="text-xs">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5 font-medium">
                    <span className="h-2 w-2 shrink-0 rounded-full max-md:hidden" style={{ background: r.costo > 0 ? COLORI_CIAMBELLA[i % COLORI_CIAMBELLA.length] : "transparent" }} />
                    <span className="truncate">{r.codice}</span>
                  </span>
                  <span className="shrink-0 tabular-nums">
                    <strong>{fmtOre(r.ore)}</strong>
                    <span className="ml-2 text-muted-foreground">{formatCurrency(r.costo)}</span>
                    <span className="ml-2 text-muted-foreground">{r.persone.size} {r.persone.size === 1 ? t("persona") : t("persone")}</span>
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="cg-barra-cresce h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400" style={{ width: `${Math.max(2, (r.ore / max) * 100)}%`, animationDelay: `${250 + i * 80}ms` }} />
                </div>
              </li>
            ))}
          </ol>
          </div>
        </CardContent>
      </Card>
      <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 p-4 text-slate-50 shadow-sm motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-500 motion-safe:fill-mode-both dark:border-slate-700" style={{ animationDelay: "80ms" }}>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("Ore ordinarie e straordinari")}</p>
        <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight">{pctStraord}%</p>
        <p className="text-xs text-slate-400">{t("delle ore sono straordinari")}</p>
        <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-white/10" aria-hidden>
          <div className="cg-barra-cresce bg-gradient-to-r from-sky-400 to-blue-500" style={{ width: `${100 - pctStraord}%` }} />
          <div className="cg-barra-cresce bg-gradient-to-r from-amber-400 to-orange-500" style={{ width: `${pctStraord}%`, animationDelay: "350ms" }} />
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
          <div><dt className="text-slate-400">{t("Ordinarie")}</dt><dd className="font-semibold tabular-nums">{fmtOre(totali.oreLavorate)}</dd></div>
          <div><dt className="text-slate-400">{t("Straordinari")}</dt><dd className="font-semibold tabular-nums text-amber-300">{fmtOre(totali.oreStraordinario)}</dd></div>
        </dl>
        {satMedia != null && (
          <p className="mt-3 border-t border-white/10 pt-2 text-[11px] text-slate-300">
            {t("Saturazione media di chi ha rapportini: {pct}% delle ore contrattuali.", { pct: satMedia })}
          </p>
        )}
      </div>
    </div>
  );
}

export function PersonnelCostsTab({
  month,
  onMonthChange,
}: {
  month: Date;
  onMonthChange: (m: Date) => void;
}) {
  const t = useT();
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
        <Link to="/azienda/personale" className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
          {t("Contratti in Personale")}
        </Link>
      </div>

      {isError && (
        <Alert className="border-red-200 bg-red-50 text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>{t("Errore nel caricamento del personale: {errorMessage}", { errorMessage: String(errorMessage ?? "") })}</span>
            <Button variant="outline" size="sm" onClick={refetch}>
              {t("Riprova")}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Testata navy di famiglia (stessa delle Spese fisse/variabili). */}
      <div className="overflow-hidden rounded-2xl border border-border shadow-sm">
        <div className="bg-eic-navy-deep p-4 text-white sm:p-5">
          <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
            <NavyStatCard
              label={t("Costo personale stimato")}
              value={formatCurrency(totali.costoTotale)}
              sub={t("{lordi} lordi + {oneri} oneri", { lordi: formatCurrency(totali.lordoTotale), oneri: formatCurrency(totali.oneriTotali) })}
              icon={Users}
              tone="text-orange-100"
            />
            <NavyStatCard
              label={t("Ore dichiarate")}
              value={fmtOre(totali.oreLavorate)}
              sub={t("{conOre} su {attivi} dipendenti con rapportini", { conOre: totali.dipendentiConOre, attivi: totali.dipendentiAttivi })}
              icon={Clock}
            />
            <NavyStatCard
              label={t("Straordinari")}
              value={fmtOre(totali.oreStraordinario)}
              sub={
                totali.costoStraordinari > 0
                  ? t("≈ {costo} stimati", { costo: formatCurrency(totali.costoStraordinari) })
                  : t("nessuno straordinario registrato")
              }
              icon={Zap}
              tone={totali.oreStraordinario > 0 ? "text-amber-200" : "text-blue-100"}
            />
            <NavyStatCard
              label={t("Dipendenti attivi")}
              value={String(totali.dipendentiAttivi)}
              sub={t("in forza nel mese")}
              icon={HardHat}
              tone="text-emerald-200"
            />
          </div>
        </div>
      </div>

      <DoveVannoLeOre dipendenti={dipendenti} totali={totali} />

      {/* Elenco dipendenti */}
      {dipendenti.length === 0 ? (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Users className="h-8 w-8 text-muted-foreground/50" />
            <div>
              <p className="font-medium text-foreground">{t("Nessun dipendente in anagrafica")}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("Aggiungi i dipendenti con stipendio e ore contrattuali per vedere qui il costo del personale mese per mese.")}
              </p>
            </div>
            <Button asChild size="sm">
              <Link to="/azienda/personale">{t("Vai a Personale")}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {/* Intestazione colonne (solo desktop) */}
          <div className="hidden gap-x-3 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:grid sm:grid-cols-[minmax(140px,1fr)_84px_100px_110px_100px_20px] xl:grid-cols-[minmax(160px,1.4fr)_90px_110px_minmax(140px,1fr)_120px_110px_24px]">
            <span>{t("Dipendente")}</span>
            <span>{t("Costo orario")}</span>
            <span>{t("Ore mese")}</span>
            <span className="max-xl:hidden">{t("Commesse")}</span>
            <span>{t("Costo mese")}</span>
            <span className="flex items-center gap-1">
              {t("Saturazione")}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[220px] text-xs">
                    {t("Ore registrate nei rapportini rispetto alle ore contrattuali del mese.")}
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
            <h3 className="text-sm font-semibold text-foreground">{t("Altri operatori sul campo")}</h3>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 cursor-help text-muted-foreground/80" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[260px] text-xs">
                  {t("Senza scheda dipendente: costo non calcolato.")}
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
