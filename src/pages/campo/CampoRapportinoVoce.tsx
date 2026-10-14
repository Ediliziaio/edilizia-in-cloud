/** Ingresso vocale: sceglie il cantiere e apre lo STESSO modulo del giornaliero. */
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useCampoAssignments } from "@/hooks/campo/useCampoAssignments";
import { cantieriAperti } from "@/lib/campo/cantieriAperti";

export default function CampoRapportinoVoce() {
  const { orderId } = useParams<{ orderId?: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const assegnazioni = useCampoAssignments();
  const aperti = cantieriAperti(assegnazioni.data ?? []);
  const url = (id: string) => {
    const next = new URLSearchParams(); next.set("input", "voce");
    const giorno = params.get("data"); if (giorno) next.set("data", giorno);
    return "/campo/lavoro/" + encodeURIComponent(id) + "/rapportino?" + next;
  };
  if (orderId) return <Navigate to={url(orderId)} replace />;
  if (assegnazioni.isLoading) return <p role="status" className="p-4">Carico i tuoi cantieri…</p>;
  if (assegnazioni.isError) return <div role="alert" className="space-y-2 p-4"><p>Non riesco a leggere i cantieri. Non creo una nota scollegata.</p><button className="min-h-11 text-primary underline" onClick={() => void assegnazioni.refetch()}>Riprova</button></div>;
  if (aperti.length === 1) return <Navigate to={url(aperti[0].order_id)} replace />;
  return <div className="mx-auto max-w-lg space-y-3 p-4">
    <h1 className="text-xl font-bold">Rapportino di oggi</h1>
    <p className="text-sm text-muted-foreground">Per quale cantiere? Puoi parlare o scrivere: il rapportino è sempre lo stesso.</p>
    {aperti.map(a => <button key={a.order_id} className="min-h-14 w-full rounded-xl border bg-background p-3 text-left" onClick={() => navigate(url(a.order_id))}>
      <span className="block font-semibold">{a.order.order_code || "Cantiere"}</span><span className="block text-sm text-muted-foreground">{a.order.description || a.order.indirizzo_lavori}</span>
    </button>)}
    {!aperti.length && <p role="status">Nessun cantiere aperto assegnato. Chiedi all’ufficio.</p>}
  </div>;
}
