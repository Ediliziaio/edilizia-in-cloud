/** Riquadro corto in commessa: i problemi del giornale ancora aperti. Se non ce ne sono, niente. */
import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { giorniAperto, testoGiorniAperto } from "../../../supabase/functions/_shared/eventiGiornale";

/** Tabella nuova, non ancora nei tipi generati. */
const dbSenzaTipi = supabase as unknown as SupabaseClient;

interface RigaProblema {
  id: string;
  testo: string;
  giornale: { id: string; data_lavori: string } | null;
}

const oggiRoma = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());

export function ProblemiApertiGiornale({ orderId, companyId }: { orderId: string; companyId: string }) {
  const { data: problemi = [] } = useQuery({
    queryKey: ["giornale-problemi-aperti", companyId, orderId],
    queryFn: async () => {
      const { data, error } = await dbSenzaTipi.from("giornale_eventi")
        .select("id, testo, giornale:giornale_lavori!inner(id, data_lavori, order_id)")
        .eq("company_id", companyId).eq("tipo", "problema").eq("stato", "aperto").eq("giornale.order_id", orderId)
        .order("created_at", { ascending: true }).limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as RigaProblema[];
    },
    enabled: !!orderId && !!companyId,
    retry: false,
  });

  if (!problemi.length) return null;
  const oggi = oggiRoma();

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
      <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
        <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
        Problemi aperti dal giornale
      </p>
      <ul className="space-y-1.5">
        {problemi.map((p) => (
          <li key={p.id} className="flex items-start justify-between gap-3 text-sm">
            <span className="min-w-0 break-words">{p.testo}</span>
            <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
              {testoGiorniAperto(giorniAperto(p.giornale?.data_lavori ?? oggi, oggi))}
              <Link to={`/azienda/giornale-lavori?ordine=${orderId}&pagina=${p.giornale?.id}`} className="text-primary underline-offset-2 hover:underline">Apri la pagina</Link>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
