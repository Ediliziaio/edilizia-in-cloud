import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { confrontoTempi, type FaseCrono } from "@/lib/orders/cronoprogramma";

type Tono = "rosso" | "ambra" | "verde" | "neutro";

const giorni = (n: number) => (n === 1 ? "1 giorno" : `${n} giorni`);

/** «il 14/06», ma «l'08/06» e «l'11/06»: l'articolo giusto davanti alla data. */
export function ilGiorno(iso: string): string {
  const data = format(parseISO(iso), "dd/MM");
  const giorno = Number(iso.slice(8, 10));
  return giorno === 8 || giorno === 11 ? `l'${data}` : `il ${data}`;
}

/**
 * Il paragone tra tempi previsti e reali di una fase, in parole: la versione
 * lunga per la riga «Quando», quella breve (solo quando qualcosa non va) per
 * il riepilogo della fase chiusa e per il telefono.
 */
export function testoTempi(f: FaseCrono, oggi: string): { lungo: string; breve: string | null; tono: Tono } | null {
  const c = confrontoTempi(f, oggi);
  const previsti = c.giorniPrevisti == null ? null : c.giorniPrevisti === 1 ? "Previsto 1 giorno" : `Previsti ${c.giorniPrevisti} giorni`;
  const conReali = (reali: string) => (previsti ? `${previsti}${c.giorniReali != null ? ` → ${reali}` : ""}` : null);
  const reali = c.giorniReali === 1 ? "reale 1" : `reali ${c.giorniReali}`;
  const unisci = (...parti: Array<string | null | false>) => parti.filter(Boolean).join(" · ");

  switch (c.esito) {
    case "finita_in_ritardo":
      return {
        lungo: unisci(conReali(reali), `finita ${ilGiorno(f.realeFine!)}`, `${giorni(c.ritardo)} di ritardo`),
        breve: `finita con ${giorni(c.ritardo)} di ritardo`,
        tono: "rosso",
      };
    case "finita_in_tempo":
      return { lungo: unisci(conReali(reali), `finita ${ilGiorno(f.realeFine!)}, in tempo`), breve: null, tono: "verde" };
    case "finita":
      return {
        lungo: unisci(previsti, f.realeFine ? `finita ${ilGiorno(f.realeFine)}` : "fine reale non registrata"),
        breve: null,
        tono: "neutro",
      };
    case "aperta_oltre":
      return {
        lungo: f.stato === "da_iniziare"
          ? unisci("Non ancora iniziata", `doveva finire ${ilGiorno(f.previstoFine!)}`, `${giorni(c.ritardo)} di ritardo`)
          : unisci(conReali(`aperta da ${c.giorniReali}`), `doveva finire ${ilGiorno(f.previstoFine!)}`, `${giorni(c.ritardo)} di ritardo`),
        breve: `${giorni(c.ritardo)} di ritardo`,
        tono: "rosso",
      };
    case "in_ritardo_inizio":
      return {
        lungo: unisci(`Doveva iniziare ${ilGiorno(f.previstoInizio!)}`, `${giorni(c.ritardo)} di ritardo sull'inizio`),
        breve: `inizio in ritardo di ${giorni(c.ritardo)}`,
        tono: "ambra",
      };
    case "in_corso":
      return {
        lungo: unisci(
          conReali(`in corso da ${c.giorniReali}`),
          c.mancano == null ? null : c.mancano === 0 ? "finisce oggi" : `mancano ${giorni(c.mancano)}`,
          c.ritardo > 0 && `partita con ${giorni(c.ritardo)} di ritardo`,
        ),
        breve: null,
        tono: c.ritardo > 0 ? "ambra" : "neutro",
      };
    case "da_iniziare":
      return previsti ? { lungo: previsti, breve: null, tono: "neutro" } : null;
  }
}

/** Il ritardo in poche lettere, per la riga della fase da telefono: «+84 gg», «inizio +3 gg». */
export function ritardoBreve(f: FaseCrono, oggi: string): { testo: string; tono: "rosso" | "ambra" } | null {
  const c = confrontoTempi(f, oggi);
  if (c.esito === "finita_in_ritardo" || c.esito === "aperta_oltre") return { testo: `+${c.ritardo} gg`, tono: "rosso" };
  if (c.esito === "in_ritardo_inizio") return { testo: `inizio +${c.ritardo} gg`, tono: "ambra" };
  return null;
}

const COLORE: Record<Tono, string> = {
  rosso: "font-medium text-rose-700",
  ambra: "font-medium text-amber-700",
  verde: "text-emerald-700",
  neutro: "text-muted-foreground",
};

/** Da dove vengono le date reali, per il titolo della frase. */
function fonti(f: FaseCrono): string | undefined {
  const parti = [
    f.realeInizio ? `Inizio reale: primo rapportino sulla fase (${format(parseISO(f.realeInizio), "dd/MM")}).` : null,
    f.realeFine
      ? `Fine reale: ${f.chiusuraRegistrata ? "giorno in cui la fase è stata chiusa" : "ultimo rapportino sulla fase"} (${format(parseISO(f.realeFine), "dd/MM")}).`
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
  const t = testoTempi(fase, oggi);
  if (!t || !t.lungo) return null;
  return (
    <span className={cn("text-xs tabular-nums", COLORE[t.tono], className)} data-testid={`tempi-${fase.id}`} title={fonti(fase)}>
      <span className="max-sm:hidden">{t.lungo}</span>
      {t.breve && <span className="sm:hidden">{t.breve}</span>}
    </span>
  );
}
