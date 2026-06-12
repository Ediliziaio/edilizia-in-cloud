import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface FunnelData {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  converted: number;
}

interface EmailFunnelChartProps {
  data: FunnelData;
}

/**
 * EmailFunnelChart — funnel email come barre proporzionali con percentuale di
 * conversione step-by-step. Ogni stadio mostra: conteggio assoluto + % rispetto
 * allo stadio precedente (es. "Aperte 45% delle consegnate"). Molto più
 * leggibile del bar chart recharts precedente, che mostrava solo i numeri.
 */
export function EmailFunnelChart({ data }: EmailFunnelChartProps) {
  const steps = [
    { name: "Inviate", value: data.sent, color: "bg-blue-500", prevLabel: null as string | null },
    { name: "Consegnate", value: data.delivered, color: "bg-emerald-500", prevLabel: "inviate" },
    { name: "Aperte", value: data.opened, color: "bg-amber-500", prevLabel: "consegnate" },
    { name: "Cliccate", value: data.clicked, color: "bg-violet-500", prevLabel: "aperte" },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Funnel di conversione</CardTitle>
        <p className="text-xs text-muted-foreground">
          Quanti destinatari avanzano a ogni passo
        </p>
      </CardHeader>
      <CardContent>
        {data.sent === 0 ? (
          <div className="flex h-44 items-center justify-center text-sm text-muted-foreground">
            Nessun dato disponibile. Invia la tua prima campagna per vedere il funnel.
          </div>
        ) : (
          <div className="space-y-3">
            {steps.map((step, i) => {
              const widthPct = data.sent > 0 ? (step.value / data.sent) * 100 : 0;
              const prevVal = i === 0 ? step.value : steps[i - 1].value;
              const convPct = prevVal > 0 ? (step.value / prevVal) * 100 : 0;
              return (
                <div key={step.name}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground">{step.name}</span>
                    <span className="tabular-nums text-muted-foreground">
                      <strong className="text-foreground">{step.value.toLocaleString("it-IT")}</strong>
                      {step.prevLabel && (
                        <span className="ml-1.5 text-xs">
                          ({convPct.toFixed(0)}% delle {step.prevLabel})
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="h-6 w-full overflow-hidden rounded-md bg-muted">
                    <div
                      className={`h-full rounded-md ${step.color} transition-all`}
                      style={{ width: `${Math.max(widthPct, 1.5)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
