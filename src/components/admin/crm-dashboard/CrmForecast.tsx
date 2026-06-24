/**
 * CrmForecast — il calcolatore "la matematica convince" (alla Dan Kennedy):
 * se invii N email a questi tassi, ottieni X clienti e Y€. Interattivo (slider),
 * pre-compilato col valore medio cliente REALE; i tassi sono assunzioni editabili.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Calculator, ArrowRight } from "lucide-react";

const eur0 = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Math.round(n || 0));

function Slider({ label, value, min, max, step, suffix, onChange }: { label: string; value: number; min: number; max: number; step: number; suffix?: string; onChange: (n: number) => void }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-[12px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums">
          {value.toLocaleString("it-IT")}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer accent-primary"
      />
    </div>
  );
}

export function CrmForecast({ companyId }: { companyId: string }) {
  const q = useQuery({
    queryKey: ["crm-dash", "forecast-avg", companyId],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_opportunities")
        .select("value")
        .eq("company_id", companyId)
        .eq("status", "won")
        .limit(5000);
      if (error) return 0;
      const rows = (data ?? []) as { value: number | null }[];
      if (!rows.length) return 0;
      return rows.reduce((s, r) => s + (r.value ?? 0), 0) / rows.length;
    },
  });

  const avgDefault = Math.round(q.data || 0) || 1500;
  const [emails, setEmails] = useState(1000);
  const [replyRate, setReplyRate] = useState(5);
  const [toClient, setToClient] = useState(20);
  const [avgValue, setAvgValue] = useState<number | null>(null);
  const av = avgValue ?? avgDefault;

  const out = useMemo(() => {
    const replies = emails * (replyRate / 100);
    const clienti = replies * (toClient / 100);
    return { replies, clienti, revenue: clienti * av };
  }, [emails, replyRate, toClient, av]);

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Calculator className="h-4 w-4" aria-hidden="true" /> Proiezione · la matematica
          <span className="ml-auto text-xs font-normal text-muted-foreground">what-if</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-3">
            <Slider label="Email da inviare" value={emails} min={0} max={10000} step={100} onChange={setEmails} />
            <Slider label="Tasso risposta" value={replyRate} min={0} max={30} step={0.5} suffix="%" onChange={setReplyRate} />
            <Slider label="Risposta → cliente" value={toClient} min={0} max={100} step={1} suffix="%" onChange={setToClient} />
            <div>
              <div className="mb-1 flex justify-between text-[12px]">
                <span className="text-muted-foreground">Valore medio cliente</span>
                <span className="font-semibold tabular-nums">{eur0(av)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={20000}
                step={100}
                value={av}
                onChange={(e) => setAvgValue(Number(e.target.value))}
                className="h-1.5 w-full cursor-pointer accent-primary"
              />
            </div>
          </div>

          <div className="flex flex-col justify-center gap-2 rounded-lg border p-3" style={{ borderColor: "hsl(160 84% 39% / 0.4)" }}>
            <div className="flex items-center gap-2 text-[13px]">
              <span className="font-semibold tabular-nums">{Math.round(emails).toLocaleString("it-IT")}</span>
              <span className="text-muted-foreground">email</span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <span className="font-semibold tabular-nums">{Math.round(out.replies).toLocaleString("it-IT")}</span>
              <span className="text-muted-foreground">risposte</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold leading-none" style={{ color: "hsl(160 84% 39%)" }}>
                {Math.round(out.clienti).toLocaleString("it-IT")}
              </span>
              <span className="text-sm text-muted-foreground">clienti previsti</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold leading-none">{eur0(out.revenue)}</span>
              <span className="text-sm text-muted-foreground">fatturato previsto</span>
            </div>
            <p className="text-[11px] text-muted-foreground">Stessi tassi, più volume: la macchina scala in modo prevedibile.</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
