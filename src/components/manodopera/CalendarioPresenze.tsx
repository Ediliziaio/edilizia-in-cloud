/**
 * Il mese di un operaio in un colpo d'occhio (26/09/2026): ogni giorno col
 * colore della giornata e le ore; toccando un giorno si vede dove ha lavorato,
 * con quali mezzi, cosa ha scritto nel rapportino e se c'era qualcosa di
 * strano (uscita non timbrata, timbratura lontana dal cantiere).
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, FileText, HardHat, Loader2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { oggiRoma, useMeseOperaio, type GiornoOperaio } from "@/hooks/useOperai";
import { etichettaGiornata, formatOra, formatOre } from "@/lib/manodopera/giornata";
import { cn } from "@/lib/utils";

const INTESTAZIONE = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

function primoDelMese(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}
function spostaMese(mese: string, n: number): string {
  const [y, m] = mese.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}
function giornoSettimana(iso: string): number {
  const [y, m, g] = iso.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, g)).getUTCDay() + 6) % 7; // lunedì = 0
}

function coloreGiorno(g: GiornoOperaio): string {
  if (g.stato === "presente") {
    const ore = g.ore ?? 0;
    return ore >= 8 ? "bg-emerald-500 text-white" : ore >= 4 ? "bg-emerald-300 text-emerald-950" : "bg-emerald-100 text-emerald-900";
  }
  if (g.stato === "assente") return "bg-sky-100 text-sky-900";
  if (g.stato === "riposo") return "bg-slate-50 text-slate-400";
  if (g.stato === "non_timbrato") return "bg-rose-50 text-rose-700";
  return "bg-white text-slate-300";
}

export function CalendarioPresenze({ profiloId }: { profiloId: string }) {
  const oggi = oggiRoma();
  const [mese, setMese] = useState(primoDelMese(oggi));
  const [scelto, setScelto] = useState<string | null>(null);
  const { data = [], isLoading, error, refetch } = useMeseOperaio(profiloId, mese);

  // Si apre sull'ultimo giorno lavorato del mese (o su oggi).
  useEffect(() => {
    if (!data.length) return;
    if (scelto && data.some((d) => d.data === scelto)) return;
    const ultimo = [...data].reverse().find((d) => d.stato === "presente");
    setScelto(ultimo?.data ?? (data.some((d) => d.data === oggi) ? oggi : data[0].data));
  }, [data, scelto, oggi]);

  const riepilogo = useMemo(() => {
    const lavorati = data.filter((d) => d.stato === "presente");
    return {
      giorni: lavorati.length,
      ore: lavorati.reduce((t, d) => t + (d.ore ?? 0), 0),
      assenze: data.filter((d) => d.stato === "assente").length,
      daControllare: data.filter((d) => d.stato === "non_timbrato" || d.uscita_mancante || d.fuori_zona).length,
    };
  }, [data]);

  const giorno = data.find((d) => d.data === scelto) ?? null;
  const [y, m] = mese.split("-").map(Number);
  const vuoti = data.length ? giornoSettimana(data[0].data) : 0;

  return (
    <section className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5" aria-label="Presenze del mese">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <CalendarDays className="h-4 w-4 text-orange-600" aria-hidden="true" />Presenze
        </h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="tap-compact h-8 w-8" aria-label="Mese prima" onClick={() => { setMese(spostaMese(mese, -1)); setScelto(null); }}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[8.5rem] text-center text-sm font-medium capitalize text-slate-800">{MESI[m - 1]} {y}</span>
          <Button
            variant="ghost"
            size="icon"
            className="tap-compact h-8 w-8"
            aria-label="Mese dopo"
            disabled={mese >= primoDelMese(oggi)}
            onClick={() => { setMese(spostaMese(mese, 1)); setScelto(null); }}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {error ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Non riesco a caricare il mese. <button type="button" className="font-medium text-orange-700 hover:underline" onClick={() => refetch()}>Riprova</button>
        </p>
      ) : isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <p className="mb-2 text-xs text-slate-500 tabular-nums">
            {riepilogo.giorni === 1 ? "1 giorno" : `${riepilogo.giorni} giorni`} · {formatOre(riepilogo.ore)}
            {riepilogo.assenze > 0 && <> · {riepilogo.assenze === 1 ? "1 assenza" : `${riepilogo.assenze} assenze`}</>}
            {riepilogo.daControllare > 0 && <span className="text-orange-700"> · {riepilogo.daControllare} da controllare</span>}
          </p>
          <div className="grid grid-cols-7 gap-1 text-center" role="grid" aria-label={`${MESI[m - 1]} ${y}`}>
            {INTESTAZIONE.map((g) => <span key={g} className="pb-1 text-[11px] font-medium text-slate-400">{g}</span>)}
            {Array.from({ length: vuoti }).map((_, i) => <span key={`v${i}`} aria-hidden="true" />)}
            {data.map((d) => {
              const numero = Number(d.data.slice(8));
              const strano = d.uscita_mancante || d.fuori_zona;
              return (
                <button
                  key={d.data}
                  type="button"
                  disabled={d.futuro}
                  onClick={() => setScelto(d.data)}
                  aria-pressed={scelto === d.data}
                  aria-label={`${numero} ${MESI[m - 1]}: ${etichettaStato(d)}`}
                  className={cn(
                    "tap-compact relative flex h-11 min-h-0 flex-col items-center justify-center rounded-lg text-xs transition sm:h-12",
                    coloreGiorno(d),
                    d.data === oggi && "ring-1 ring-slate-400",
                    scelto === d.data && "ring-2 ring-orange-500",
                    !d.futuro && "hover:brightness-95",
                  )}
                >
                  <span className="font-semibold leading-none">{numero}</span>
                  {d.stato === "presente" && (d.ore ?? 0) > 0 && (
                    <span className="mt-0.5 text-[10px] leading-none opacity-90 tabular-nums">{(Math.round((d.ore ?? 0) * 10) / 10).toLocaleString("it-IT")} h</span>
                  )}
                  {strano && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-orange-500" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />al lavoro</span>
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-sky-100 ring-1 ring-sky-200" />assente</span>
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-rose-50 ring-1 ring-rose-200" />senza timbrature</span>
            <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-orange-500" />da controllare</span>
          </p>

          {giorno && <DettaglioGiorno g={giorno} />}
        </>
      )}
    </section>
  );
}

function etichettaStato(d: GiornoOperaio): string {
  if (d.stato === "presente") return d.ore ? `al lavoro, ${formatOre(d.ore)}` : "al lavoro";
  if (d.stato === "assente") return etichettaGiornata("assente", d.assenza);
  if (d.stato === "riposo") return "a riposo";
  if (d.stato === "non_timbrato") return "senza timbrature";
  return "";
}

function DettaglioGiorno({ g }: { g: GiornoOperaio }) {
  const data = new Date(`${g.data}T12:00:00Z`).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  return (
    <div className="mt-4 space-y-2 rounded-xl border bg-slate-50/70 p-3 text-sm" aria-live="polite">
      <p className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold capitalize text-slate-900">{data}</span>
        <span className="text-xs text-slate-500 tabular-nums">
          {g.prima_entrata ? `${formatOra(g.prima_entrata)} → ${g.ultima_uscita ? formatOra(g.ultima_uscita) : "…"}` : etichettaStato(g)}
          {g.stato === "presente" && g.ore ? ` · ${formatOre(g.ore)}` : ""}
        </span>
      </p>
      {g.cantiere && (
        <p className="flex items-start gap-2 text-slate-700">
          <HardHat className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          <span>
            {!g.cantiere_timbrato && <span className="text-slate-500">{g.stato === "presente" ? "Cantiere previsto: " : "Previsto: "}</span>}
            {g.cantiere_id ? <Link to={`/azienda/ordini/${g.cantiere_id}`} className="hover:text-orange-700 hover:underline">{g.cantiere}</Link> : g.cantiere}
          </span>
        </p>
      )}
      {g.mezzi && (
        <p className="flex items-start gap-2 text-slate-700">
          <Truck className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />{g.mezzi}
        </p>
      )}
      {g.rapportino && (
        <p className="flex items-start gap-2 text-slate-700">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          <span className="italic">«{g.rapportino}»</span>
        </p>
      )}
      {(g.uscita_mancante || g.fuori_zona) && (
        <p className="flex items-start gap-2 text-orange-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {[g.uscita_mancante ? "Uscita non timbrata" : null, g.fuori_zona ? "ha timbrato lontano dal cantiere" : null].filter(Boolean).join(" · ")}
        </p>
      )}
      {!g.cantiere && !g.mezzi && !g.rapportino && g.stato !== "presente" && (
        <p className="text-xs text-muted-foreground">Nient'altro da segnalare.</p>
      )}
    </div>
  );
}
