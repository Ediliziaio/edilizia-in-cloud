import { useNavigate } from "react-router-dom";
import { useBillingMode } from "@/contexts/BillingModeContext";
import { useTopClientiByFatturato } from "@/hooks/billing/useDashboardBillingKPI";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { Users, ChevronRight } from "lucide-react";

export function ClienteSituazioneWidget() {
  const { isNative } = useBillingMode();
  const companyId = useEffectiveCompanyId();
  const { data: topClienti } = useTopClientiByFatturato(companyId, 5);
  const navigate = useNavigate();

  if (!isNative || !topClienti?.length) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          Situazione Top Clienti (anno corrente)
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="text-left py-2 font-medium">Cliente</th>
                <th className="text-right py-2 font-medium">Fatturato YTD</th>
                <th className="text-right py-2 font-medium">Da incassare</th>
                <th className="text-right py-2 font-medium w-24"></th>
              </tr>
            </thead>
            <tbody>
              {topClienti.map((c) => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="py-2 font-medium truncate max-w-[200px]">
                    {c.nome}
                  </td>
                  <td className="py-2 text-right font-mono text-xs">
                    {formatCurrency(c.fatturato)}
                  </td>
                  <td
                    className={cn(
                      "py-2 text-right font-mono text-xs",
                      c.daIncassare > 0
                        ? "text-amber-600 font-medium"
                        : "text-muted-foreground"
                    )}
                  >
                    {c.daIncassare > 0
                      ? formatCurrency(c.daIncassare)
                      : "✓ incassato"}
                  </td>
                  <td className="py-2 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-6 gap-1"
                      onClick={() =>
                        navigate(
                          `/azienda/fatturazione/documenti?cliente=${c.id}`
                        )
                      }
                    >
                      Fatture
                      <ChevronRight className="w-3 h-3" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
