/**
 * «Oggi qui» nella pagina del cantiere (26/11/2026, richiesta del founder: migliorare la pagina del singolo lavoro).
 * In cima, tre righe: cosa c'è da fare oggi in questo cantiere (le mie fasi di oggi, da campo_mia_giornata), a che
 * punto è il mio rapportino e, solo per chi timbra dall'app, la timbratura. Se oggi qui non sono in programma lo dice.
 */
import { format } from "date-fns";
import { CheckCircle2, Clock, ClipboardList, ListTodo } from "lucide-react";
import { useMiaGiornata } from "@/hooks/campo/useCampoGiornata";
import { useCampoWorkDay } from "@/hooks/campo/useCampoWorkDay";
import { useDaFareOggi } from "@/hooks/campo/useDaFareOggi";
import type { StatoRapportino } from "@/lib/campo/rapportinoStato";
import { CHIP } from "@/lib/campo/stileCampo";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const RAPPORTINO: Record<StatoRapportino | "manca", { label: string; cls: string }> = {
  manca: { label: "da fare", cls: "bg-amber-100 text-amber-900" },
  bozza: { label: "in bozza", cls: "bg-amber-100 text-amber-900" },
  inviato: { label: "inviato", cls: "bg-sky-100 text-sky-900" },
  approvato: { label: "approvato", cls: "bg-emerald-100 text-emerald-800" },
  rifiutato: { label: "da rifare", cls: "bg-red-100 text-red-800" },
};

export function OggiQuiCampo({ orderId, rapportino, mostraRapportino, timbra, entrata, uscita, onRapportino }: {
  orderId: string;
  rapportino: StatoRapportino | null;
  /** false quando il rapportino lo scrive un altro (regole dell'azienda). */
  mostraRapportino: boolean;
  timbra: boolean;
  entrata: string | null;
  uscita: string | null;
  onRapportino: () => void;
}) {
  const t = useT();
  const giorno = useCampoWorkDay();
  const giornata = useMiaGiornata(1);
  const qui = giornata.data?.giorni.find(g => g.giorno === giorno)?.cantieri.find(c => c.order_id === orderId);
  // Le fasi di oggi: le mie se assegnate, altrimenti quelle del cantiere in calendario oggi (come la Home).
  const daFare = useDaFareOggi(qui ? [orderId] : []);
  const fasi = qui ? (qui.fasi.length ? qui.fasi : daFare.get(orderId)?.fasi ?? []) : [];
  const stato = RAPPORTINO[rapportino ?? "manca"];
  if (giornata.isLoading) return null;
  return (
    <section aria-label={t("Oggi qui")} className="space-y-2 rounded-2xl border border-primary/20 bg-primary/5 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">{t("Oggi qui")}</p>
      <p className="flex items-start gap-2 text-sm">
        <ListTodo className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <span dir="auto">{qui
          ? (fasi.length ? `${t("Da fare")}: ${fasi.join(", ")}` : t("Sei in programma qui oggi."))
          : t("Oggi non sei in programma su questo cantiere.")}</span>
      </p>
      {timbra && (
        <p className="flex items-center gap-2 text-sm">
          <Clock className="size-4 shrink-0 text-primary" aria-hidden="true" />
          {entrata
            ? uscita ? t("Entrato alle {e}, uscito alle {u}", { e: format(new Date(entrata), "HH:mm"), u: format(new Date(uscita), "HH:mm") })
                     : t("In cantiere dalle {e}", { e: format(new Date(entrata), "HH:mm") })
            : t("Non hai ancora timbrato qui oggi.")}
        </p>
      )}
      {mostraRapportino && (
        <button type="button" onClick={onRapportino} className="flex w-full items-center gap-2 text-start text-sm">
          {rapportino === "inviato" || rapportino === "approvato"
            ? <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
            : <ClipboardList className="size-4 shrink-0 text-primary" aria-hidden="true" />}
          <span>{t("Rapportino di oggi")}</span>
          <span className={cn(CHIP, "ms-auto", stato.cls)}>{t(stato.label)}</span>
        </button>
      )}
    </section>
  );
}
