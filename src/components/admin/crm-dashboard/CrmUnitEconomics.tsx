/**
 * CrmUnitEconomics — il "modello soldi" del cockpit (alla Hormozi/Kennedy):
 * Spesa → Lead → CPL → Clienti → CAC → Valore medio → LTV:CAC e ROAS, con un
 * verdetto colorato. Senza questo la dashboard mostra volumi di vanità; con
 * questo dice se stai facendo soldi.
 *
 * Dati reali: campaign_costs (spesa), marketing_contacts (lead), opportunità
 * vinte (clienti + valore), scoped a companyId + periodo. Fail-open onesto.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Coins, Loader2, TrendingUp, AlertTriangle } from "lucide-react";

const eur0 = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }).format(Math.round(n || 0));
const DAY = 24 * 60 * 60 * 1000;

export function CrmUnitEconomics({ companyId, days }: { companyId: string; days: number }) {
  const [nowMs] = useState(() => Date.now());
  const sinceIso = useMemo(() => new Date(nowMs - days * DAY).toISOString(), [nowMs, days]);

  const q = useQuery({
    queryKey: ["crm-dash", "unit-economics", companyId, sinceIso],
    staleTime: 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const [costs, leads, won] = await Promise.all([
        sb.from("campaign_costs").select("spend_amount,date").eq("company_id", companyId).gte("date", sinceIso.slice(0, 10)),
        supabase.from("marketing_contacts").select("id", { count: "exact", head: true }).eq("company_id", companyId).gte("created_at", sinceIso),
        supabase.from("marketing_opportunities").select("value,created_at").eq("company_id", companyId).eq("status", "won").gte("created_at", sinceIso).limit(5000),
      ]);
      const spesa = (costs.error ? [] : costs.data ?? []).reduce((s: number, r: { spend_amount: number | null }) => s + (r.spend_amount ?? 0), 0);
      const wonRows = (won.data ?? []) as { value: number | null }[];
      return {
        spesa,
        lead: leads.error ? 0 : leads.count ?? 0,
        clienti: won.error ? 0 : wonRows.length,
        valoreVinto: wonRows.reduce((s, r) => s + (r.value ?? 0), 0),
      };
    },
  });

  const d = q.data;
  const cpl = d && d.lead > 0 ? d.spesa / d.lead : null;
  const cac = d && d.clienti > 0 ? d.spesa / d.clienti : null;
  const valoreMedio = d && d.clienti > 0 ? d.valoreVinto / d.clienti : null;
  const ltvCac = cac != null && cac > 0 && valoreMedio != null ? valoreMedio / cac : null;
  const roas = d && d.spesa > 0 ? d.valoreVinto / d.spesa : null;
  const noCosts = d != null && d.spesa <= 0;

  const health = ltvCac == null ? "muted" : ltvCac >= 3 ? "ok" : ltvCac >= 1 ? "warn" : "bad";
  const healthColor = health === "ok" ? "hsl(160 84% 39%)" : health === "warn" ? "hsl(43 96% 56%)" : health === "bad" ? "hsl(0 84% 60%)" : "hsl(var(--muted-foreground))";

  const tiles = [
    { label: "Spesa marketing", value: d ? eur0(d.spesa) : "—" },
    { label: "Lead generati", value: d ? d.lead.toLocaleString("it-IT") : "—" },
    { label: "Costo per lead", value: cpl != null ? eur0(cpl) : "—" },
    { label: "Clienti acquisiti", value: d ? String(d.clienti) : "—" },
    { label: "CAC (costo/cliente)", value: cac != null ? eur0(cac) : "—" },
    { label: "Valore medio cliente", value: valoreMedio != null ? eur0(valoreMedio) : "—" },
  ];

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Coins className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          Economia operativa · il modello soldi
          <span className="ml-auto text-xs font-normal text-muted-foreground">ultimi {days} giorni</span>
        </div>

        {q.isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
              {tiles.map((t) => (
                <div key={t.label} className="rounded-lg border p-2.5">
                  <div className="truncate text-[11px] text-muted-foreground">{t.label}</div>
                  <div className="text-base font-bold leading-tight">{t.value}</div>
                </div>
              ))}
            </div>

            {noCosts ? (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-dashed p-3 text-[13px] text-muted-foreground">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
                Nessuna spesa marketing tracciata nel periodo. Aggiungi i costi per canale per vedere <strong>CAC</strong>, <strong>LTV:CAC</strong> e <strong>ROI</strong> — senza questi, sono numeri di vanità.
              </div>
            ) : (
              <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                <div className="flex items-center gap-3 rounded-lg border p-3" style={{ borderColor: `${healthColor}55` }}>
                  <div className="text-2xl font-bold tabular-nums" style={{ color: healthColor }}>
                    {ltvCac != null ? `${ltvCac.toFixed(1)}:1` : "—"}
                  </div>
                  <div className="min-w-0 text-[12px] leading-snug">
                    <div className="font-semibold">Rapporto LTV : CAC</div>
                    <div className="text-muted-foreground">
                      {ltvCac == null
                        ? "Servono clienti vinti nel periodo."
                        : ltvCac >= 3
                          ? "Sano: stai costruendo una macchina profittevole."
                          : ltvCac >= 1
                            ? "Fragile: recuperi la spesa ma poco margine."
                            : "In perdita: ogni cliente costa più di quanto rende."}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg border p-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <TrendingUp className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 text-[12px] leading-snug">
                    <div className="font-semibold">
                      ROAS {roas != null ? `${roas.toFixed(1)}×` : "—"}
                    </div>
                    <div className="text-muted-foreground">
                      {roas == null ? "—" : `Ogni €1 in marketing genera ${eur0(roas)} di valore vinto.`}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
