/**
 * Le scadenze della sicurezza di questo cantiere, in cima alla sua Sicurezza
 * (09/11/2026). Gli adempimenti nati alla partenza della commessa stavano solo
 * nella pagina azienda: chi apriva la commessa non sapeva che la notifica
 * preliminare era da mandare tre giorni fa. Qui stanno dove si lavora.
 *
 * Quando non c'è niente in ritardo né in scadenza il riquadro non compare:
 * una scatola vuota occupa spazio e non dice nulla.
 */
import { useQuery } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import {
  cosaScade,
  ordinaScadenze,
  quandoScade,
  riepilogoScadenze,
  type ScadenzaSicurezza,
} from "@/lib/sicurezza/scadenzeCommessa";

// La vista è recente e non è ancora nei tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function useScadenzeCommessa(companyId: string, orderId: string) {
  return useQuery({
    queryKey: ["sicurezza-scadenze-commessa", companyId, orderId],
    enabled: !!companyId && !!orderId,
    queryFn: async (): Promise<ScadenzaSicurezza[]> => {
      const { data, error } = await db
        .from("sicurezza_scadenze")
        .select(
          "origine, riferimento_id, tipo, titolo, subappaltatore, data_scadenza, giorni_mancanti, stato",
        )
        .eq("company_id", companyId)
        .eq("order_id", orderId);
      if (error) throw error;
      return (data ?? []) as ScadenzaSicurezza[];
    },
  });
}

export function ScadenzeCommessa(
  { companyId, orderId }: { companyId: string; orderId: string },
) {
  const q = useScadenzeCommessa(companyId, orderId);

  if (q.isError) {
    return (
      <p
        role="alert"
        className="rounded-md border border-amber-300 p-3 text-sm text-amber-900"
      >
        Scadenze della sicurezza non disponibili: quello che vedi sotto non le
        comprende.
      </p>
    );
  }
  const righe = ordinaScadenze(q.data ?? []);
  // Niente da dire, niente riquadro.
  if (!righe.length) return null;
  const { inRitardo, testo } = riepilogoScadenze(righe);

  return (
    <Card
      className={inRitardo
        ? "border-rose-300 bg-rose-50/50"
        : "border-amber-300 bg-amber-50/40"}
    >
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center gap-2">
          <CalendarClock
            className={`h-4 w-4 shrink-0 ${
              inRitardo ? "text-rose-700" : "text-amber-700"
            }`}
            aria-hidden="true"
          />
          <h4
            className={`text-sm font-semibold ${
              inRitardo ? "text-rose-900" : "text-amber-900"
            }`}
          >
            Scadenze di questo cantiere: {testo}
          </h4>
        </div>
        <ul className="space-y-1 text-sm">
          {righe.map((r) => (
            <li
              key={`${r.origine}:${r.riferimento_id}`}
              className="flex flex-wrap items-baseline gap-x-2"
            >
              <span className="font-medium">{cosaScade(r)}</span>
              <span
                className={r.stato === "scaduto"
                  ? "text-rose-800"
                  : "text-amber-800"}
              >
                {quandoScade(r)}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
