/**
 * I miei buoni pasto (area operai, 23/11/2026). Il mese con quanti buoni, il totale e quanti sono già arrivati;
 * sotto i giorni uno per uno. La regola è scritta in chiaro: «un buono quando lavori almeno N ore».
 * Se l'azienda non li usa o la persona non è abilitata, lo dice con parole semplici invece di mostrare zero.
 */
import { useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, UtensilsCrossed } from "lucide-react";
import { useBuoniPastoCampo } from "@/hooks/campo/useBuoniPastoCampo";
import { buoniDelMese, meseDi, riepilogoMese, sogliaLeggibile, spostaMese, type StatoBuono } from "@/lib/campo/buoniPasto";
import { useLinguaCampo } from "@/lib/campo/lingua/LinguaCampo";
import { cn } from "@/lib/utils";
import { ScontrinoPasto } from "@/components/campo/ScontrinoPasto";

const STATO: Record<StatoBuono, string> = {
  maturato: "Maturato",
  da_erogare: "In arrivo",
  erogato: "Ricevuto",
  annullato: "Annullato",
};

export default function CampoBuoniPasto() {
  const { t, lingua } = useLinguaCampo();
  const { caricamento, errore, riprova, regole, motivo, buoni, companyId, profiloId } = useBuoniPastoCampo();
  const oggi = new Date().toISOString().slice(0, 10);
  // Si apre sul mese corrente; se lì non c'è niente, sull'ultimo mese con buoni (a inizio mese la pagina non resta vuota).
  const [meseScelto, setMese] = useState<string | null>(null);
  const meseCorrente = meseDi(oggi);
  const mese = meseScelto ?? (buoni.length && !buoni.some(b => meseDi(b.giorno) === meseCorrente) ? meseDi(buoni[0].giorno) : meseCorrente);
  const euro = (n: number) => n.toLocaleString(lingua.locale, { style: "currency", currency: "EUR", currencyDisplay: "symbol" });
  const nomeMese = new Date(`${mese}-15T12:00:00`).toLocaleDateString(lingua.locale, { month: "long", year: "numeric" });
  const giornoLeggibile = (g: string) => new Date(`${g}T12:00:00`).toLocaleDateString(lingua.locale, { weekday: "short", day: "numeric", month: "short" });

  const delMese = buoniDelMese(buoni, mese);
  const conti = riepilogoMese(delMese);
  const soglia = regole ? sogliaLeggibile(regole) : null;

  return (
    <div className="mx-auto max-w-lg space-y-4 pb-24">
      <h1 className="flex items-center gap-2 text-xl font-semibold">
        <UtensilsCrossed className="size-5 text-primary" aria-hidden="true" /> {t("I miei buoni pasto")}
      </h1>

      {caricamento ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" /> {t("Caricamento…")}
        </p>
      ) : errore ? (
        <div role="alert" className="space-y-2 rounded-2xl border p-4 text-sm">
          <p>{t("Non riesco a caricare i buoni pasto.")}</p>
          <button type="button" onClick={riprova} className="min-h-11 rounded-xl border px-3 font-semibold">{t("Riprova")}</button>
        </div>
      ) : motivo === "azienda" ? (
        <p className="rounded-2xl border bg-background p-4 text-sm">{t("La tua azienda non gestisce i buoni pasto dall'app.")}</p>
      ) : motivo === "persona" ? (
        <p className="rounded-2xl border bg-background p-4 text-sm">{t("Non hai i buoni pasto attivi. Se pensi che sia un errore, chiedi all'ufficio.")}</p>
      ) : (
        <>
          {soglia && (
            <p className="rounded-2xl bg-primary/10 px-3 py-2 text-sm text-primary">
              {t("Maturi un buono ogni giorno in cui lavori almeno {ore} ore.", { ore: soglia })}
            </p>
          )}

          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={() => setMese(spostaMese(mese, -1))} aria-label={t("Mese precedente")}
              className="flex size-11 items-center justify-center rounded-xl border">
              <ChevronLeft className="size-5 rtl:rotate-180" aria-hidden="true" />
            </button>
            <p className="text-base font-semibold first-letter:uppercase">{nomeMese}</p>
            <button type="button" onClick={() => setMese(spostaMese(mese, 1))} disabled={mese >= meseDi(oggi)} aria-label={t("Mese successivo")}
              className="flex size-11 items-center justify-center rounded-xl border disabled:opacity-40">
              <ChevronRight className="size-5 rtl:rotate-180" aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl border bg-background p-3">
              <p className="text-2xl font-black">{conti.validi}</p>
              <p className="text-xs text-muted-foreground">{t("buoni")}</p>
            </div>
            <div className="rounded-2xl border bg-background p-3">
              <p className="text-xl font-black">{euro(conti.totale)}</p>
              <p className="text-xs text-muted-foreground">{t("totale")}</p>
            </div>
            <div className="rounded-2xl border bg-background p-3">
              <p className="text-2xl font-black">{conti.erogati}</p>
              <p className="text-xs text-muted-foreground">{t("già ricevuti")}</p>
            </div>
          </div>

          {delMese.length === 0 ? (
            <p className="rounded-2xl border bg-background p-4 text-sm text-muted-foreground">{t("Nessun buono in questo mese.")}</p>
          ) : (
            <ul className="divide-y rounded-2xl border bg-background">
              {delMese.map(b => (
                <li key={b.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className={cn("min-w-0 flex-1 text-sm first-letter:uppercase", b.stato === "annullato" && "text-muted-foreground line-through")}>
                    {giornoLeggibile(b.giorno)}
                    {b.tipo === "ricevuta" && <span className="text-xs text-muted-foreground"> · {t("scontrino")}</span>}
                  </span>
                  <span className="text-sm font-semibold">{euro(Number(b.importo) || 0)}</span>
                  <span className={cn("w-20 text-end text-xs font-semibold",
                    b.stato === "erogato" ? "text-emerald-700" : b.stato === "annullato" ? "text-muted-foreground" : "text-amber-700")}>
                    {t(STATO[b.stato])}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {/* Scontrino del pranzo: solo se l'azienda rimborsa anche a ricevuta (23/11/2026). */}
          {regole && regole.buono_pasto_modalita !== "fisso" && companyId && profiloId && (
            <ScontrinoPasto companyId={companyId} profiloId={profiloId} />
          )}
          <p className="text-xs text-muted-foreground">
            {t("Un buono si annulla da solo se la giornata viene corretta sotto le ore minime.")}
          </p>
        </>
      )}
    </div>
  );
}
