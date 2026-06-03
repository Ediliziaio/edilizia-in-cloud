import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Coins, Sparkles, Mail, MessageCircle, Image as ImageIcon } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";

interface ConsumptionRow {
  credit_type: string;
  total_eur: number;
  tx_count: number;
}

// Ordine + etichette dei tool a costo (chiavi = credit_type della view unificata).
const TOOLS: { key: string; label: string; icon: typeof Coins }[] = [
  { key: "ai", label: "AI (Silvio/LLM)", icon: Sparkles },
  { key: "email", label: "Email", icon: Mail },
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { key: "render", label: "Render", icon: ImageIcon },
];

/**
 * Consumo dei tool a costo (email/AI/WhatsApp/render/firma) a livello piattaforma,
 * dal 1° del mese. Fonte: RPC get_platform_consumption_summary →
 * view credit_transactions_unified (direction='out'). Fail-soft: se l'RPC non è
 * ancora applicata mostra 0 senza rompere la dashboard.
 */
export function AdminConsumptionWidget() {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-consumption-summary"],
    queryFn: async (): Promise<ConsumptionRow[]> => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("get_platform_consumption_summary", {
        p_since: monthStart,
      });
      if (error) {
        // Fail-soft: RPC non ancora deployata o permesso assente → 0.
        return [];
      }
      return (data ?? []) as ConsumptionRow[];
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const byType = (t: string) => rows.find((r) => r.credit_type === t);
  const total = rows.reduce((s, r) => s + Number(r.total_eur || 0), 0);
  const totalTx = rows.reduce((s, r) => s + Number(r.tx_count || 0), 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400">
            <Coins className="h-4 w-4" />
          </span>
          Consumo tool a costo (mese)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold tracking-tight">{formatCurrency(total)}</p>
        <p className="text-xs text-muted-foreground mb-3">
          credito consumato dal 1° del mese · {totalTx.toLocaleString("it-IT")} operazioni
        </p>
        <div className="space-y-2 border-t pt-3">
          {TOOLS.map(({ key, label, icon: Icon }) => {
            const r = byType(key);
            const eur = Number(r?.total_eur || 0);
            return (
              <div key={key} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </span>
                <span className={eur > 0 ? "font-semibold" : "text-muted-foreground/60"}>
                  {formatCurrency(eur)}
                  {r?.tx_count ? (
                    <span className="text-xs text-muted-foreground ml-1">· {Number(r.tx_count).toLocaleString("it-IT")}</span>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
        {isLoading && <p className="text-xs text-muted-foreground mt-2">Caricamento…</p>}
      </CardContent>
    </Card>
  );
}
