/**
 * Numeri veloci sopra l'elenco delle fatture (16/11/2026): fatturato, imponibile,
 * IVA, incassato, da incassare e scaduto dell'anno, o del mese scelto nella
 * striscia. Niente grafico (scelta del titolare): i sei numeri e la striscia.
 * Contano solo le fatture davvero emesse (niente bozze né native da inviare).
 *
 * L'incassato è quello DELLE fatture del periodo, anche se arrivato il mese
 * dopo: l'incasso per data di arrivo sta nel Registro incassi e in Tesoreria.
 *
 * I numeri vengono dalla striscia dei mesi (`get_documenti_monthly_timeline`):
 * nativi e importate insieme, come l'elenco. Nessuna query in più, salvo l'anno
 * prima per la variazione, e solo da tablet in su.
 *
 * Sul telefono tre numeri.
 */
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { formatEuroRiquadro } from "@/lib/controlloGestione/formatCG";
import type { MonthSummary } from "@/hooks/billing/useMonthlyTimeline";
import { AnelloPercentuale, Comparsa, PillolaVariazione } from "@/components/charts/grafici/comune";

interface Somme {
  doc: number; totale: number; imponibile: number; iva: number; incassato: number; daIncassare: number; scaduto: number;
}

function somma(mesi: MonthSummary[]): Somme {
  const s: Somme = { doc: 0, totale: 0, imponibile: 0, iva: 0, incassato: 0, daIncassare: 0, scaduto: 0 };
  for (const m of mesi) {
    s.doc += m.docCount; s.totale += m.totalAmount; s.imponibile += m.imponibile; s.iva += m.iva;
    s.incassato += m.incassato; s.daIncassare += m.daIncassare; s.scaduto += m.scaduto;
  }
  return s;
}

/** Variazione sullo stesso periodo dell'anno prima: per l'anno in corso, solo i mesi già passati. */
export function variazioneStessoPeriodo(
  mesi: MonthSummary[], mesiPrima: MonthSummary[] | undefined, meseScelto: string | null, oggi = new Date(),
): number | null {
  if (!mesiPrima || mesiPrima.length === 0) return null;
  let fino = 12;
  let da = 1;
  if (meseScelto) {
    const m = Number(meseScelto.slice(5, 7));
    da = m; fino = m;
  } else if (mesi[0]?.year === oggi.getFullYear()) {
    fino = oggi.getMonth() + 1;
  }
  const ora = somma(mesi.filter(m => m.month >= da && m.month <= fino)).totale;
  const prima = somma(mesiPrima.filter(m => m.month >= da && m.month <= fino)).totale;
  if (prima <= 0) return null;
  return ((ora - prima) / prima) * 100;
}

function Numero({
  etichetta, valore, nota, tono = "neutro", extra, indice,
}: {
  etichetta: string; valore: number; nota?: string; tono?: "neutro" | "buono" | "cattivo"; extra?: React.ReactNode; indice: number;
}) {
  return (
    <Comparsa indice={indice} className="min-w-0 rounded-xl border bg-card px-3 py-2.5">
      <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{etichetta}</p>
      <div className="mt-0.5 flex items-center gap-1.5">
        <p
          className={cn(
            "truncate text-base font-bold tabular-nums leading-tight",
            tono === "buono" && "text-emerald-600 dark:text-emerald-400",
            tono === "cattivo" && "text-rose-600 dark:text-rose-400",
          )}
          title={formatCurrency(valore)}
        >
          {formatEuroRiquadro(valore)}
        </p>
        {extra}
      </div>
      {nota && <p className="truncate text-[10px] text-muted-foreground">{nota}</p>}
    </Comparsa>
  );
}

export function RiepilogoFatture({
  mesi, mesiAnnoPrima, meseScelto, isMobile, etichettaDocumenti = "fatture",
}: {
  mesi: MonthSummary[];
  mesiAnnoPrima?: MonthSummary[];
  meseScelto: string | null;
  isMobile?: boolean;
  etichettaDocumenti?: string;
}) {
  const anno = mesi[0]?.year ?? new Date().getFullYear();

  const periodo = useMemo(
    () => (meseScelto ? mesi.filter(m => m.key === meseScelto) : mesi),
    [mesi, meseScelto],
  );
  const s = useMemo(() => somma(periodo), [periodo]);
  const variazione = useMemo(
    () => variazioneStessoPeriodo(mesi, mesiAnnoPrima, meseScelto),
    [mesi, mesiAnnoPrima, meseScelto],
  );
  const daIncassareTot = s.incassato + s.daIncassare;
  const pctIncassato = daIncassareTot > 0 ? (s.incassato / daIncassareTot) * 100 : 0;
  const nomePeriodo = meseScelto
    ? `${periodo[0]?.label ?? ""} ${anno}`.trim()
    : String(anno);


  if (s.doc === 0 && !mesi.some(m => m.docCount > 0)) return null;

  // Telefono: solo i tre numeri che contano, su una riga, per non spingere giù l'elenco.
  if (isMobile) {
    return (
      <section aria-label="Numeri delle fatture" className="grid grid-cols-3 gap-2">
        {[
          { e: "Fatturato", v: s.totale, c: "" },
          { e: "Incassato", v: s.incassato, c: "text-emerald-600 dark:text-emerald-400" },
          { e: "Scaduto", v: s.scaduto, c: s.scaduto > 0 ? "text-rose-600 dark:text-rose-400" : "" },
        ].map((n, i) => (
          <Comparsa key={n.e} indice={i} className="min-w-0 rounded-xl border bg-card px-2.5 py-2">
            <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{n.e}</p>
            <p className={cn("truncate text-sm font-bold tabular-nums", n.c)}>{formatEuroRiquadro(n.v)}</p>
          </Comparsa>
        ))}
      </section>
    );
  }

  const numeri = (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
      <Numero
        indice={0}
        etichetta={`Fatturato ${nomePeriodo}`}
        valore={s.totale}
        nota={`${s.doc} ${etichettaDocumenti}`}
        extra={
          <PillolaVariazione
            pct={variazione}
            titolo={meseScelto ? "Rispetto allo stesso mese dell'anno prima" : "Rispetto allo stesso periodo dell'anno prima"}
          />
        }
      />
      <Numero indice={1} etichetta="Imponibile" valore={s.imponibile} nota="senza IVA" />
      <Numero indice={2} etichetta="IVA" valore={s.iva} nota={s.imponibile > 0 ? `${((s.iva / s.imponibile) * 100).toLocaleString("it-IT", { maximumFractionDigits: 1 })}% dell'imponibile` : undefined} />
      <Numero
        indice={3}
        etichetta="Incassato"
        valore={s.incassato}
        tono="buono"
        nota={daIncassareTot > 0 ? `${Math.round(pctIncassato)}% di queste fatture, anche dopo` : "di queste fatture"}
        extra={daIncassareTot > 0 ? <AnelloPercentuale pct={pctIncassato} dimensione={22} /> : undefined}
      />
      <Numero indice={4} etichetta="Da incassare" valore={s.daIncassare} nota="di queste fatture" />
      <Numero
        indice={5}
        etichetta="Scaduto"
        valore={s.scaduto}
        tono={s.scaduto > 0 ? "cattivo" : "neutro"}
        nota={s.scaduto > 0 ? "oltre la scadenza" : "niente in ritardo"}
      />
    </div>
  );

  return <section aria-label="Numeri delle fatture">{numeri}</section>;
}
