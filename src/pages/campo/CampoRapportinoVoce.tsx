/** Ingresso vocale: sceglie il cantiere e apre lo STESSO modulo del giornaliero. */
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChevronRight, HardHat, Mic } from "lucide-react";
import { useCampoAssignments } from "@/hooks/campo/useCampoAssignments";
import { cantieriAperti } from "@/lib/campo/cantieriAperti";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export default function CampoRapportinoVoce() {
  const { orderId } = useParams<{ orderId?: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const t = useT();
  const assegnazioni = useCampoAssignments();
  const aperti = cantieriAperti(assegnazioni.data ?? []);
  const url = (id: string) => {
    const next = new URLSearchParams(); next.set("input", "voce");
    const giorno = params.get("data"); if (giorno) next.set("data", giorno);
    return "/campo/lavoro/" + encodeURIComponent(id) + "/rapportino?" + next;
  };
  if (orderId) return <Navigate to={url(orderId)} replace />;
  if (assegnazioni.isLoading) return <p role="status" className="mx-auto max-w-lg rounded-xl border bg-background p-4 text-sm text-muted-foreground">{t("Carico i tuoi cantieri…")}</p>;
  if (assegnazioni.isError) return <div role="alert" className="mx-auto max-w-lg rounded-xl border bg-background p-4 text-sm">
    <p>{t("Non riesco a leggere i cantieri.")}</p>
    <button type="button" className="min-h-11 font-semibold text-primary" onClick={() => void assegnazioni.refetch()}>{t("Riprova")}</button>
  </div>;
  if (aperti.length === 1) return <Navigate to={url(aperti[0].order_id)} replace />;
  return <div className="mx-auto max-w-lg space-y-3">
    <header className="flex items-center gap-3 rounded-2xl border border-primary/15 bg-background p-4">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Mic className="size-5" aria-hidden="true" />
      </span>
      <div>
        <h1 className="text-lg font-bold">{t("Scegli il cantiere")}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{t("Apri il rapportino del cantiere in cui hai lavorato.")}</p>
      </div>
    </header>
    {aperti.map(a => <button type="button" key={a.order_id}
      className="flex min-h-16 w-full items-center gap-3 rounded-xl border bg-background p-3 text-left outline-offset-2 motion-safe:transition-transform motion-safe:active:scale-[0.98]"
      onClick={() => navigate(url(a.order_id))}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-primary"><HardHat className="size-4" aria-hidden="true" /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{a.order.order_code || t("Cantiere")}</span>
        <span className="block break-words text-sm text-muted-foreground">{a.order.description || a.order.indirizzo_lavori}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>)}
    {!aperti.length && <p role="status" className="rounded-xl border bg-background p-4 text-sm">{t("Nessun cantiere aperto assegnato. Chiedi all’ufficio.")}</p>}
  </div>;
}
