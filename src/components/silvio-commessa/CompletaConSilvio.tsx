/**
 * «Completa al 34 %» con «Completa con Silvio» sulla pagina della commessa (31/10/2026,
 * fase 2, lotto 2.1). Il punteggio viene da `commesse_da_completare` (una chiamata, solo
 * questa commessa); se la funzione non c'è ancora resta il pulsante, senza il numero.
 * Non si vede a commessa completa, chiusa, senza permesso o con l'interruttore spento.
 */
import { lazy, Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/contexts/AuthContext";
import { cosaManca, leggiDaCompletare, type CommessaDaCompletare } from "@/lib/silvio-commessa/daCompletare";
import { useCreaConSilvioAttivo } from "./useCreaConSilvioAttivo";

const CreaConSilvioDialog = lazy(() => import("./CreaConSilvioDialog"));

export function CompletaConSilvio({ orderId, companyId, orderCode, puoModificare, chiusa, leggi = leggiDaCompletare }: {
  orderId: string;
  companyId: string | null | undefined;
  orderCode?: string | null;
  puoModificare: boolean;
  /** Commessa completata o annullata: niente da completare. */
  chiusa?: boolean;
  leggi?: (companyId: string, opz: { orderId: string }) => Promise<CommessaDaCompletare[]>;
}) {
  const { user } = useAuth();
  const attivo = useCreaConSilvioAttivo(companyId) && puoModificare && !chiusa;
  const [aperto, setAperto] = useState(false);
  const punteggio = useQuery({
    queryKey: ["silvio-commessa", "da-completare", companyId, orderId],
    enabled: attivo && !!companyId,
    retry: false,
    staleTime: 30_000,
    queryFn: async () => (await leggi(companyId!, { orderId }))[0] ?? null,
  });
  if (!attivo || !companyId || !user?.id) return null;
  const c = punteggio.data;
  if (c && c.punteggio >= 100) return null;

  return (
    <div className="mx-0 mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm shadow-sm sm:mx-6"
      role="region" aria-label="Completezza della commessa">
      {c ? (
        <p className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-slate-700">
          <span className="flex items-center gap-2 font-semibold text-slate-900">
            <Progress value={c.punteggio} className="h-1.5 w-16" aria-hidden />Completa al {c.punteggio} %
          </span>
          {c.mancano.length > 0 && <span className="min-w-0 text-xs text-slate-500">manca: {cosaManca(c.mancano)}</span>}
        </p>
      ) : (
        <p className="min-w-0 flex-1 text-slate-600">Silvio può aggiungere quello che manca a questa commessa.</p>
      )}
      <Button type="button" size="sm" className="h-8 gap-1 bg-orange-700 hover:bg-orange-800 max-sm:w-full" onClick={() => setAperto(true)}>
        <Sparkles className="h-4 w-4" aria-hidden />Completa con Silvio
      </Button>
      {aperto && (
        <Suspense fallback={null}>
          <CreaConSilvioDialog open onOpenChange={setAperto} companyId={companyId} userId={user.id}
            orderId={orderId} etichettaCommessa={orderCode ?? null} />
        </Suspense>
      )}
    </div>
  );
}
