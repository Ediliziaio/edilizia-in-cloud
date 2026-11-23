import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { confrontoTempi, type FaseCrono } from "@/lib/orders/cronoprogramma";
import { sostituisci, useT } from "@/lib/campo/lingua/LinguaCampo";

type Tono = "rosso" | "ambra" | "verde" | "neutro";

/** Chi traduce: `t` di useT(); senza, l'italiano con i valori al loro posto. */
type Traduttore = (testo: string, valori?: Readonly<Record<string, string | number>>) => string;

const giorni = (n: number, tr: Traduttore) => tr(n === 1 ? "1 giorno" : "{n} giorni", { n });

/** «il 14/06», ma «l'08/06» e «l'11/06»: l'articolo giusto davanti alla data. */
export function ilGiorno(iso: string): string {
  const data = format(parseISO(iso), "dd/MM");
  const giorno = Number(iso.slice(8, 10));
  return giorno === 8 || giorno === 11 ? `l'${data}` : `il ${data}`;
}

/** La frase con la data, nella forma con l'articolo giusto: «finita il 14/06», «finita l'08/06». */
const conData = (iso: string, conIl: string, conL: string, tr: Traduttore) => {
  const giorno = Number(iso.slice(8, 10));
  return tr(giorno === 8 || giorno === 11 ? conL : conIl, { data: format(parseISO(iso), "dd/MM") });
};

/**
 * Il paragone tra tempi previsti e reali di una fase, in parole: la versione
 * lunga per la riga «Quando», quella breve (solo quando qualcosa non va) per
 * il riepilogo della fase chiusa e per il telefono.
 */
export function testoTempi(f: FaseCrono, oggi: string, tr: Traduttore = sostituisci): { lungo: string; breve: string | null; tono: Tono } | null {
  const c = confrontoTempi(f, oggi);
  const previsti = c.giorniPrevisti == null ? null : tr(c.giorniPrevisti === 1 ? "Previsto 1 giorno" : "Previsti {n} giorni", { n: c.giorniPrevisti });
  const conReali = (reali: string) => (previsti ? `${previsti}${c.giorniReali != null ? ` → ${reali}` : ""}` : null);
  const reali = tr(c.giorniReali === 1 ? "reale 1" : "reali {n}", { n: c.giorniReali ?? "" });
  const unisci = (...parti: Array<string | null | false>) => parti.filter(Boolean).join(" · ");
  const ritardo = tr("{durata} di ritardo", { durata: giorni(c.ritardo, tr) });
  const finita = (iso: string) => conData(iso, "finita il {data}", "finita l'{data}", tr);
  const dovevaFinire = (iso: string) => conData(iso, "doveva finire il {data}", "doveva finire l'{data}", tr);

  switch (c.esito) {
    case "finita_in_ritardo":
      return {
        lungo: unisci(conReali(reali), finita(f.realeFine!), ritardo),
        breve: tr("finita con {durata} di ritardo", { durata: giorni(c.ritardo, tr) }),
        tono: "rosso",
      };
    case "finita_in_tempo":
      return { lungo: unisci(conReali(reali), conData(f.realeFine!, "finita il {data}, in tempo", "finita l'{data}, in tempo", tr)), breve: null, tono: "verde" };
    case "finita":
      return {
        lungo: unisci(previsti, f.realeFine ? finita(f.realeFine) : tr("fine reale non registrata")),
        breve: null,
        tono: "neutro",
      };
    case "aperta_oltre":
      return {
        lungo: f.stato === "da_iniziare"
          ? unisci(tr("Non ancora iniziata"), dovevaFinire(f.previstoFine!), ritardo)
          : unisci(conReali(tr("aperta da {n}", { n: c.giorniReali ?? "" })), dovevaFinire(f.previstoFine!), ritardo),
        breve: ritardo,
        tono: "rosso",
      };
    case "in_ritardo_inizio":
      return {
        lungo: unisci(conData(f.previstoInizio!, "Doveva iniziare il {data}", "Doveva iniziare l'{data}", tr), tr("{durata} di ritardo sull'inizio", { durata: giorni(c.ritardo, tr) })),
        breve: tr("inizio in ritardo di {durata}", { durata: giorni(c.ritardo, tr) }),
        tono: "ambra",
      };
    case "in_corso":
      return {
        lungo: unisci(
          conReali(tr("in corso da {n}", { n: c.giorniReali ?? "" })),
          c.mancano == null ? null : c.mancano === 0 ? tr("finisce oggi") : tr("mancano {durata}", { durata: giorni(c.mancano, tr) }),
          c.ritardo > 0 && tr("partita con {durata} di ritardo", { durata: giorni(c.ritardo, tr) }),
        ),
        breve: null,
        tono: c.ritardo > 0 ? "ambra" : "neutro",
      };
    case "da_iniziare":
      return previsti ? { lungo: previsti, breve: null, tono: "neutro" } : null;
  }
}

/** Il ritardo in poche lettere, per la riga della fase da telefono: «+84 gg», «inizio +3 gg». */
export function ritardoBreve(f: FaseCrono, oggi: string, tr: Traduttore = sostituisci): { testo: string; tono: "rosso" | "ambra" } | null {
  const c = confrontoTempi(f, oggi);
  if (c.esito === "finita_in_ritardo" || c.esito === "aperta_oltre") return { testo: tr("+{n} gg", { n: c.ritardo }), tono: "rosso" };
  if (c.esito === "in_ritardo_inizio") return { testo: tr("inizio +{n} gg", { n: c.ritardo }), tono: "ambra" };
  return null;
}

const COLORE: Record<Tono, string> = {
  rosso: "font-medium text-rose-700",
  ambra: "font-medium text-amber-700",
  verde: "text-emerald-700",
  neutro: "text-muted-foreground",
};

/** Da dove vengono le date reali, per il titolo della frase. */
function fonti(f: FaseCrono, tr: Traduttore): string | undefined {
  const parti = [
    f.realeInizio ? tr("Inizio reale: primo rapportino sulla fase ({data}).", { data: format(parseISO(f.realeInizio), "dd/MM") }) : null,
    f.realeFine
      ? tr(f.chiusuraRegistrata ? "Fine reale: giorno in cui la fase è stata chiusa ({data})." : "Fine reale: ultimo rapportino sulla fase ({data}).", { data: format(parseISO(f.realeFine), "dd/MM") })
      : null,
  ].filter(Boolean);
  return parti.length > 0 ? parti.join(" ") : undefined;
}

/**
 * Accanto alle date della fase (riga «Quando», 06/10/2026): quanti giorni
 * erano previsti, quanti ce ne sono voluti, quando è finita davvero e di
 * quanto si è sforato. Da telefono solo la versione breve, se qualcosa non va.
 */
export function TempiFase({ fase, oggi, className }: { fase: FaseCrono; oggi: string; className?: string }) {
  const tr = useT();
  const testo = testoTempi(fase, oggi, tr);
  if (!testo || !testo.lungo) return null;
  return (
    <span className={cn("text-xs tabular-nums", COLORE[testo.tono], className)} data-testid={`tempi-${fase.id}`} title={fonti(fase, tr)}>
      <span className="max-sm:hidden">{testo.lungo}</span>
      {testo.breve && <span className="sm:hidden">{testo.breve}</span>}
    </span>
  );
}
