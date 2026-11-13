import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  ArrowRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { formatTreasuryCurrency as money } from "@/lib/treasury";
import type { ScadenzarioSummary } from "@/hooks/useScadenzario";
export function TreasuryDueSummary({ company }: { company: string }) {
  const q = useQuery({
    queryKey: [...queryKeys.scadenzario.summary(company), null, null],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_scadenzario_summary", {
        p_company_id: company,
        p_date_from: null,
        p_date_to: null,
      });
      if (error) throw error;
      return data as unknown as ScadenzarioSummary;
    },
    enabled: !!company,
    staleTime: 60_000,
  });
  if (q.isPending)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Caricamento scadenze…
      </p>
    );
  if (q.isError)
    return (
      <div role="alert" className="rounded-xl border p-4 text-sm">
        Scadenze non disponibili.{" "}
        <button
          className="text-primary underline"
          onClick={() => void q.refetch()}
        >
          Riprova
        </button>
      </div>
    );
  const s = q.data;
  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            <CalendarClock className="h-4 w-4 text-primary" />
            Scadenze e impegni
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Tutta l’azienda · importi ancora aperti in scadenzario, separati dai
            saldi bancari.
          </p>
        </div>
        <Link
          to="/azienda/scadenzario"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Apri scadenzario
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: "Da incassare",
            value: s.entrate_previste,
            tone: "text-emerald-700",
            icon: ArrowDownLeft,
          },
          {
            label: "Da pagare",
            value: s.uscite_previste,
            tone: "text-rose-700",
            icon: ArrowUpRight,
          },
          {
            label: "Incassi scaduti",
            value: s.scadute_entrata_amount,
            tone: "text-amber-700",
            icon: CalendarClock,
          },
          {
            label: "Pagamenti scaduti",
            value: s.scadute_uscita_amount,
            tone: "text-rose-700",
            icon: CalendarClock,
          },
        ].map((c) => (
          <div key={c.label} className="rounded-lg bg-muted/30 p-3">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <c.icon className="h-3.5 w-3.5 shrink-0" />
              {c.label}
            </p>
            <p className={`mt-2 text-lg font-semibold tabular-nums ${c.tone}`}>
              {c.value === undefined ? "Non disponibile" : money(c.value)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
