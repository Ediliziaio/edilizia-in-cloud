/**
 * CrmGrowthLevers — le 3 leve di Jay Abraham: Fatturato = Clienti × Valore medio
 * × Frequenza. Mostra le tre leve attuali e l'effetto COMPOSTO di migliorarle
 * (un +10% su ciascuna = +33% di fatturato). Dati reali da opportunità vinte.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Users, Receipt, Repeat, Loader2, Sparkles } from "lucide-react";

const eur0 = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Math.round(n || 0));

export function CrmGrowthLevers({ companyId }: { companyId: string }) {
  const q = useQuery({
    queryKey: ["crm-dash", "growth-levers", companyId],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_opportunities")
        .select("value,contact_id")
        .eq("company_id", companyId)
        .eq("status", "won")
        .limit(5000);
      if (error) return [] as { value: number | null; contact_id: string | null }[];
      return (data ?? []) as { value: number | null; contact_id: string | null }[];
    },
  });

  const m = useMemo(() => {
    const rows = q.data ?? [];
    const customers = new Set<string>();
    let totalValue = 0;
    rows.forEach((r, i) => {
      customers.add(r.contact_id ?? `deal-${i}`);
      totalValue += r.value ?? 0;
    });
    const clienti = customers.size;
    const aov = clienti > 0 ? totalValue / clienti : 0;
    const freq = clienti > 0 ? rows.length / clienti : 0;
    return { clienti, aov, freq, totalValue, deals: rows.length };
  }, [q.data]);

  const uplift = m.totalValue * (1.1 * 1.1 * 1.1 - 1); // +33,1%
  const empty = !q.isLoading && m.deals === 0;

  const levers = [
    { icon: Users, label: "Clienti", value: String(m.clienti), color: "hsl(217 91% 60%)" },
    { icon: Receipt, label: "Valore medio", value: eur0(m.aov), color: "hsl(160 84% 39%)" },
    { icon: Repeat, label: "Acquisti / cliente", value: m.freq.toFixed(2).replace(".", ","), color: "hsl(43 96% 56%)" },
  ];

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4" aria-hidden="true" /> Le 3 leve della crescita
          <span className="ml-auto text-xs font-normal text-muted-foreground">Abraham</span>
        </div>

        {q.isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          </div>
        ) : empty ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nessun cliente vinto: la crescita parte dal primo deal chiuso.</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2.5">
              {levers.map((l, i) => {
                const Icon = l.icon;
                return (
                  <div key={l.label} className="rounded-lg border p-3 text-center">
                    <span className="mx-auto mb-1 flex h-8 w-8 items-center justify-center rounded-lg border" style={{ color: l.color }}>
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="text-lg font-bold leading-tight">{l.value}</div>
                    <div className="text-[11px] text-muted-foreground">{l.label}</div>
                    {i < 2 && <span className="hidden">×</span>}
                  </div>
                );
              })}
            </div>
            <div className="mt-3 rounded-lg border p-3 text-[12px] leading-snug" style={{ borderColor: "hsl(160 84% 39% / 0.4)" }}>
              <div className="font-semibold">Fatturato = Clienti × Valore medio × Frequenza</div>
              <div className="mt-0.5 text-muted-foreground">
                Migliora ognuna leva del <strong className="text-foreground">10%</strong> e il fatturato fa <strong style={{ color: "hsl(160 84% 39%)" }}>+33%</strong>:{" "}
                {eur0(m.totalValue)} → <strong style={{ color: "hsl(160 84% 39%)" }}>{eur0(m.totalValue + uplift)}</strong>. È la geometria della crescita: piccoli guadagni composti.
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
