/**
 * «Cosa è successo» quel giorno (26/09/2026): rapportini, giornale dei lavori,
 * foto dal cantiere, mezzi spostati, guasti segnalati, interventi in officina,
 * più le timbrature strane della giornata. In ordine di ora.
 */
import { Link } from "react-router-dom";
import { AlertTriangle, BookOpen, Camera, FileText, Loader2, Truck, Wrench } from "lucide-react";
import { useDiarioGiorno, type EventoDiario, type OperaioOggi, type TipoEventoDiario } from "@/hooks/useOperai";
import { formatOra } from "@/lib/manodopera/giornata";
import { cn } from "@/lib/utils";

const ICONA: Record<TipoEventoDiario | "timbratura", typeof FileText> = {
  rapportino: FileText,
  giornale: BookOpen,
  foto: Camera,
  mezzo: Truck,
  segnalazione: AlertTriangle,
  officina: Wrench,
  timbratura: AlertTriangle,
};
const TONO: Record<TipoEventoDiario | "timbratura", string> = {
  rapportino: "bg-emerald-50 text-emerald-700",
  giornale: "bg-blue-50 text-blue-700",
  foto: "bg-violet-50 text-violet-700",
  mezzo: "bg-slate-100 text-slate-600",
  segnalazione: "bg-red-50 text-red-700",
  officina: "bg-amber-50 text-amber-700",
  timbratura: "bg-orange-50 text-orange-700",
};

function ora(iso: string | null): string | null {
  return iso ? new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" }) : null;
}

export function DiarioGiorno({
  giorno,
  giornata,
  cerca,
  linkCommesse,
}: {
  giorno: string;
  /** Le righe della giornata: da qui escono uscite non timbrate e timbrature lontane. */
  giornata: readonly OperaioOggi[];
  cerca: string;
  linkCommesse: boolean;
}) {
  const { data = [], isLoading, error } = useDiarioGiorno(giorno);

  const strani: (EventoDiario & { tipoVisto: "timbratura" })[] = giornata
    .filter((r) => r.stato === "uscita_mancante" || r.fuori_zona)
    .map((r): EventoDiario & { tipoVisto: "timbratura" } => ({
      quando: null,
      tipo: "rapportino",
      tipoVisto: "timbratura",
      titolo: r.stato === "uscita_mancante" ? "Uscita non timbrata" : "Timbratura lontana dal cantiere",
      testo: r.prima_entrata ? `Entrata alle ${formatOra(r.prima_entrata)}` : null,
      chi: `${r.nome} ${r.cognome}`,
      order_id: r.cantiere_id ?? r.previsto_id,
      cantiere: r.cantiere ?? r.previsto,
      mezzo_id: null,
      mezzo: null,
    }));

  const q = cerca.trim().toLowerCase();
  const eventi = [...data.map((e) => ({ ...e, tipoVisto: e.tipo as TipoEventoDiario | "timbratura" })), ...strani]
    .filter((e) => !q || [e.titolo, e.testo, e.chi, e.cantiere, e.mezzo].some((x) => x?.toLowerCase().includes(q)));

  return (
    <section className="rounded-2xl border bg-white shadow-sm" aria-labelledby="diario-giorno">
      <h3 id="diario-giorno" className="border-b px-4 py-2.5 text-sm font-semibold text-slate-900">Cosa è successo</h3>
      {error ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">Non riesco a leggere il diario di questo giorno.</p>
      ) : isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : eventi.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">
          {q ? "Niente che corrisponda alla ricerca." : "Nessun rapportino, giornale, foto o movimento dei mezzi in questo giorno."}
        </p>
      ) : (
        <ol className="divide-y">
          {eventi.map((e, i) => {
            const Icona = ICONA[e.tipoVisto];
            return (
              <li key={`${e.tipoVisto}-${i}`} className="flex gap-3 px-4 py-3">
                <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", TONO[e.tipoVisto])} aria-hidden="true">
                  <Icona className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span className="font-medium text-slate-900">{e.titolo}</span>
                    {ora(e.quando) && <span className="text-xs tabular-nums text-slate-400">{ora(e.quando)}</span>}
                  </p>
                  {e.testo && <p className="mt-0.5 text-slate-600">{e.testo}</p>}
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {[e.chi, null].filter(Boolean).join("")}
                    {e.chi && e.cantiere && " · "}
                    {e.cantiere && (linkCommesse && e.order_id
                      ? <Link to={`/azienda/ordini/${e.order_id}`} className="tap-compact hover:text-orange-700 hover:underline">{e.cantiere}</Link>
                      : e.cantiere)}
                    {e.mezzo_id && !e.cantiere && (
                      <>{e.chi && " · "}<Link to={`/azienda/mezzi/${e.mezzo_id}`} className="tap-compact hover:text-orange-700 hover:underline">apri il mezzo</Link></>
                    )}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
