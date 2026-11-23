/**
 * «Come fatturi?» — la scelta che decide come lavora tutta la fatturazione, in cima alla pagina.
 *
 * Due card: con un altro programma (Fatture in Cloud, Fattura24, Aruba…) o con Edilizia in Cloud. Nessuna card è
 * accesa finché l'azienda non ha scelto («external» è solo il valore di partenza, e serve a far funzionare i menu), e
 * ogni clic registra la scelta, anche quello sul valore di partenza. Il testo di conferma dice cosa succede ai
 * collegamenti: restano collegati e continuano a portare le fatture.
 */
import { useState } from "react";
import { Check, ExternalLink, FileText, Loader2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useBillingMode, type BillingMode } from "@/contexts/BillingModeContext";
import { ID_SCELTA_ESTERNA, ID_SCELTA_NATIVA } from "@/lib/fatturazione/sceltaCheFatturi";
import { cn } from "@/lib/utils";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

const SCELTE: { mode: BillingMode; id: string; titolo: string; descrizione: string; Icona: typeof FileText }[] = [
  {
    mode: "external",
    id: ID_SCELTA_ESTERNA,
    titolo: "Con un altro programma",
    descrizione: "Le fatture le fai nel tuo programma (Fatture in Cloud, Fattura24, Aruba…) e arrivano qui da sole, nella stessa pagina Fatture.",
    Icona: ExternalLink,
  },
  {
    mode: "native",
    id: ID_SCELTA_NATIVA,
    titolo: "Con Edilizia in Cloud",
    descrizione: "Fai qui fatture, note di credito e DDT e le mandi allo SDI, senza altri programmi.",
    Icona: FileText,
  },
];

const CONFERMA: Record<BillingMode, { titolo: string; testo: string; azione: string }> = {
  native: {
    titolo: "Fatturi con Edilizia in Cloud?",
    testo:
      "Se hai un programma collegato, resta collegato e continua a portare qui le fatture; finché non torni indietro non le vedrai nell'elenco.",
    azione: "Sì, fatturo con Edilizia in Cloud",
  },
  external: {
    titolo: "Fatturi con un altro programma?",
    testo: "Le fatture fatte con Edilizia in Cloud non si cancellano: restano in Fatture accanto a quelle del programma, ma da qui non ne crei di nuove.",
    azione: "Sì, fatturo con un altro programma",
  },
};

const dataLunga = (iso: string) =>
  new Date(iso).toLocaleDateString(intlCampo(), { day: "numeric", month: "long", year: "numeric" });

export function ComeFatturi({ onScelta }: { /** Dopo una scelta registrata: la pagina porta alla scheda di quel modo. */ onScelta?: (modo: BillingMode) => void }) {
  const t = useT();
  const { mode, isChosen, chosenAt, isLoading, switchMode } = useBillingMode();
  const [daConfermare, setDaConfermare] = useState<BillingMode | null>(null);
  const [inCorso, setInCorso] = useState(false);

  const registra = async (nuova: BillingMode) => {
    setInCorso(true);
    try {
      if (await switchMode(nuova)) onScelta?.(nuova);
    } finally {
      setInCorso(false);
      setDaConfermare(null);
    }
  };

  const scegli = (nuova: BillingMode) => {
    if (inCorso) return;
    // Stessa scelta di oggi: non cambia niente, quindi niente da confermare; basta registrarla.
    // (Se l'azienda aveva già scelto così, non c'è nemmeno quello da fare.)
    if (nuova === mode) {
      if (!isChosen) void registra(nuova);
      return;
    }
    setDaConfermare(nuova);
  };

  return (
    <section aria-labelledby="come-fatturi-titolo" className="space-y-3">
      <div>
        <h2 id="come-fatturi-titolo" className="text-lg font-semibold">{t("Come fatturi?")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("Puoi cambiare quando vuoi. Le fatture già fatte non si cancellano.")}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {SCELTE.map(({ mode: m, id, titolo, descrizione, Icona }) => {
          const scelta = isChosen && mode === m;
          return (
            <button
              key={m}
              id={id}
              type="button"
              aria-pressed={scelta}
              disabled={isLoading || inCorso}
              onClick={() => scegli(m)}
              className={cn(
                "relative flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors disabled:opacity-60",
                scelta ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-card hover:border-muted-foreground/30",
              )}
            >
              {scelta && (
                <span className="absolute right-3 top-3 rounded-full bg-primary p-1 text-primary-foreground" aria-hidden="true">
                  <Check className="h-3 w-3" />
                </span>
              )}
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10" aria-hidden="true">
                <Icona className="h-5 w-5 text-primary" />
              </span>
              <span className="min-w-0 pr-6">
                <span className="block font-semibold">{t(titolo)}</span>
                <span className="mt-1 block text-sm text-muted-foreground">{t(descrizione)}</span>
              </span>
            </button>
          );
        })}
      </div>

      {!isLoading && (
        <p className="text-sm text-muted-foreground" role="status">
          {isChosen && chosenAt ? t("Hai scelto il {chosenAt}.", { chosenAt: dataLunga(chosenAt) }) : t("Non hai ancora scelto.")}
        </p>
      )}

      <AlertDialog open={daConfermare !== null} onOpenChange={(aperto) => { if (!aperto && !inCorso) setDaConfermare(null); }}>
        <AlertDialogContent>
          {daConfermare && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{t(CONFERMA[daConfermare].titolo)}</AlertDialogTitle>
                <AlertDialogDescription>{t(CONFERMA[daConfermare].testo)}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={inCorso}>{t("Annulla")}</AlertDialogCancel>
                <AlertDialogAction
                  disabled={inCorso}
                  onClick={(e) => {
                    // La conferma si chiude a salvataggio finito, bene o male: se il database rifiuta, il motivo lo dice il messaggio.
                    e.preventDefault();
                    void registra(daConfermare);
                  }}
                >
                  {inCorso && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t(CONFERMA[daConfermare].azione)}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
