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
import { useMemo, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatEuroRiquadro } from "@/lib/controlloGestione/formatCG";
import { formatCurrency } from "@/lib/formatters";
import type { MonthSummary } from "@/hooks/billing/useMonthlyTimeline";
import { AnelloPercentuale, Comparsa, PillolaVariazione } from "@/components/charts/grafici/comune";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

/** Il nome del mese nella lingua scelta («Gennaio» in italiano). */
function nomeMese(m: MonthSummary): string {
  const nome = new Date(m.year, m.month - 1, 1).toLocaleDateString(intlCampo(), { month: "long" });
  return nome ? nome.charAt(0).toUpperCase() + nome.slice(1) : m.label;
}

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

/** Le parole dei riquadri: le emesse si incassano, le ricevute si pagano. */
export interface TestiRiepilogo {
  totale: string;
  incassato: string;
  daIncassare: string;
  notaIncassato: string;
  /** Per le ricevute pagare di più non è «buono»: il pagato resta neutro. */
  incassatoBuono: boolean;
}

export const TESTI_EMESSE: TestiRiepilogo = {
  totale: "Fatturato", incassato: "Incassato", daIncassare: "Da incassare", notaIncassato: "di queste fatture, anche dopo", incassatoBuono: true,
};

export const TESTI_RICEVUTE: TestiRiepilogo = {
  totale: "Ricevuto", incassato: "Pagato", daIncassare: "Da pagare", notaIncassato: "di queste fatture", incassatoBuono: false,
};

const RIGA = "flex min-h-[34px] flex-wrap items-center gap-x-5 gap-y-1 rounded-xl border bg-card px-3 py-1.5";

/** Una voce della riga: etichetta piccola e cifra; la nota nel titolo (o in vista, se chiesto). */
function Voce({
  etichetta, valore, cifra, nota, notaInVista, tono = "neutro", extra,
}: {
  etichetta: string;
  valore?: number;
  cifra?: string;
  nota?: string;
  notaInVista?: boolean;
  tono?: "neutro" | "buono" | "cattivo";
  extra?: ReactNode;
}) {
  const testo = cifra ?? (valore != null ? formatEuroRiquadro(valore) : "—");
  const pieno = valore != null && cifra == null ? formatCurrency(valore) : undefined;
  return (
    <div className="flex min-w-0 items-center gap-1.5" title={[pieno, nota].filter(Boolean).join(" · ") || undefined}>
      <span className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{etichetta}</span>
      <span
        className={cn(
          "whitespace-nowrap text-sm font-bold tabular-nums leading-tight",
          tono === "buono" && "text-emerald-600 dark:text-emerald-400",
          tono === "cattivo" && "text-rose-600 dark:text-rose-400",
          cifra === "…" && "text-muted-foreground",
        )}
      >
        {testo}
      </span>
      {extra}
      {notaInVista && nota && <span className="whitespace-nowrap text-[10px] text-muted-foreground">{nota}</span>}
    </div>
  );
}

export function RiepilogoFatture({
  mesi, mesiAnnoPrima, meseScelto, isMobile, etichettaDocumenti = "fatture", testi = TESTI_EMESSE, caricamento,
}: {
  mesi: MonthSummary[];
  mesiAnnoPrima?: MonthSummary[];
  meseScelto: string | null;
  isMobile?: boolean;
  etichettaDocumenti?: string;
  testi?: TestiRiepilogo;
  /** I numeri stanno arrivando: i riquadri si disegnano subito con «…» al posto della cifra. */
  caricamento?: boolean;
}) {
  const t = useT();
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
    ? `${periodo[0] ? nomeMese(periodo[0]) : ""} ${anno}`.trim()
    : String(anno);


  const vuoto = s.doc === 0 && !mesi.some(m => m.docCount > 0);

  // Finché i numeri non sono arrivati i riquadri ci sono già, con «…» al posto
  // della cifra: stessa altezza, così quando arrivano l'elenco sotto non si
  // sposta (23/11/2026, come il lampo blu delle ricevute). Senza caricamento in
  // corso restano invisibili: un'azienda senza fatture non deve vedere zeri.
  if (vuoto && caricamento) {
    if (isMobile) {
      return (
        <section aria-label="Numeri delle fatture" aria-busy="true" className="grid grid-cols-3 gap-2">
          {[testi.totale, testi.incassato, "Scaduto"].map((e, i) => (
            <Comparsa key={e} indice={i} className="min-w-0 rounded-xl border bg-card px-2.5 py-2">
              <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{e}</p>
              <p className="truncate text-sm font-bold tabular-nums text-muted-foreground">…</p>
            </Comparsa>
          ))}
        </section>
      );
    }
    return (
      <section aria-label="Numeri delle fatture" aria-busy="true" className={RIGA}>
        {[`${testi.totale} ${nomePeriodo}`, "Imponibile", "IVA", testi.incassato, testi.daIncassare, "Scaduto"].map((e) => (
          <Voce key={e} etichetta={e} cifra="…" />
        ))}
      </section>
    );
  }

  if (vuoto) return null;

  // Telefono: solo i tre numeri che contano, su una riga, per non spingere giù l'elenco.
  if (isMobile) {
    return (
      <section aria-label={t("Numeri delle fatture")} className="grid grid-cols-3 gap-2">
        {[
          { e: t(testi.totale), v: s.totale, c: "" },
          { e: t(testi.incassato), v: s.incassato, c: testi.incassatoBuono ? "text-emerald-600 dark:text-emerald-400" : "" },
          { e: t("Scaduto"), v: s.scaduto, c: s.scaduto > 0 ? "text-rose-600 dark:text-rose-400" : "" },
        ].map((n, i) => (
          <Comparsa key={n.e} indice={i} className="min-w-0 rounded-xl border bg-card px-2.5 py-2">
            <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{n.e}</p>
            <p className={cn("truncate text-sm font-bold tabular-nums", n.c)}>{formatEuroRiquadro(n.v)}</p>
          </Comparsa>
        ))}
      </section>
    );
  }

  // Da tablet in su (25/11/2026): i sei numeri su UNA riga da 34px, non sei riquadri da 76px.
  // Le note che stavano sotto ogni cifra («senza IVA», «0,2% dell'imponibile»…) restano nel
  // titolo di ogni voce; il numero delle fatture resta in vista accanto al fatturato.
  return (
    <section aria-label={t("Numeri delle fatture")} className={RIGA}>
      <Voce
        etichetta={`${t(testi.totale)} ${nomePeriodo}`}
        valore={s.totale}
        nota={`${s.doc} ${t(etichettaDocumenti)}`}
        notaInVista
        extra={
          <PillolaVariazione
            pct={variazione}
            titolo={meseScelto ? t("Rispetto allo stesso mese dell'anno prima") : t("Rispetto allo stesso periodo dell'anno prima")}
          />
        }
      />
      <Voce etichetta={t("Imponibile")} valore={s.imponibile} nota={t("senza IVA")} />
      <Voce etichetta="IVA" valore={s.iva} nota={s.imponibile > 0 ? t("{percentuale}% dell'imponibile", { percentuale: ((s.iva / s.imponibile) * 100).toLocaleString(intlCampo(), { maximumFractionDigits: 1 }) }) : undefined} />
      <Voce
        etichetta={t(testi.incassato)}
        valore={s.incassato}
        tono={testi.incassatoBuono ? "buono" : "neutro"}
        nota={daIncassareTot > 0 ? `${Math.round(pctIncassato)}% ${t(testi.notaIncassato)}` : t("di queste fatture")}
        extra={daIncassareTot > 0 ? <AnelloPercentuale pct={pctIncassato} dimensione={16} /> : undefined}
      />
      <Voce etichetta={t(testi.daIncassare)} valore={s.daIncassare} nota={t("di queste fatture")} />
      <Voce
        etichetta={t("Scaduto")}
        valore={s.scaduto}
        tono={s.scaduto > 0 ? "cattivo" : "neutro"}
        nota={s.scaduto > 0 ? t("oltre la scadenza") : t("niente in ritardo")}
      />
    </section>
  );
}
