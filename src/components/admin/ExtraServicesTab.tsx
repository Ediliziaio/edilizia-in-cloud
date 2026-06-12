/**
 * ExtraServicesTab — P&L unificato dei servizi extra rivenduti.
 *
 * Tab "Servizi Extra" del Revenue Platform (super admin): per ogni servizio
 * (SMS, WhatsApp, Email, AI, Render) mostra ricavo incassato dalle aziende,
 * costo provider pagato dalla piattaforma e margine — "mi entrano 10€ da
 * SMS, ne ho pagati 3 al provider".
 *
 * Fonte: RPC get_extra_services_economics(_from,_to) — SECURITY DEFINER con
 * guard super_admin. WhatsApp ed Email hanno il costo provider non tracciato
 * a DB (fatturazione Meta diretta / piano Resend): mostrati come "n.d." e
 * ESCLUSI dal margine totale per non gonfiarlo.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { subDays, startOfMonth } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MessageSquare, Mail, Sparkles, Zap, Smartphone, Coins, TrendingUp, PiggyBank,
} from "lucide-react";

const eur = (v: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v);

interface ServizioRow {
  key: string;
  label: string;
  revenue: number;
  cost: number | null;
  cost_tracked: boolean;
  cost_note?: string;
  n_operazioni: number;
}

interface EconomicsData {
  servizi: ServizioRow[];
  totals: { revenue: number; cost_tracked: number; margin_tracked: number };
}

const SERVICE_ICONS: Record<string, React.ReactNode> = {
  sms: <Smartphone className="h-4 w-4 text-sky-600" />,
  whatsapp: <MessageSquare className="h-4 w-4 text-emerald-600" />,
  email: <Mail className="h-4 w-4 text-violet-600" />,
  ai: <Zap className="h-4 w-4 text-amber-600" />,
  render: <Sparkles className="h-4 w-4 text-pink-600" />,
};

type Periodo = "30d" | "mese" | "90d";

function periodoRange(p: Periodo): { from: Date; to: Date } {
  const to = new Date();
  if (p === "mese") return { from: startOfMonth(to), to };
  if (p === "90d") return { from: subDays(to, 90), to };
  return { from: subDays(to, 30), to };
}

export default function ExtraServicesTab() {
  const [periodo, setPeriodo] = useState<Periodo>("30d");

  const { data, isLoading } = useQuery({
    queryKey: ["extra-services-economics", periodo],
    queryFn: async (): Promise<EconomicsData> => {
      const { from, to } = periodoRange(periodo);
      const { data, error } = await supabase.rpc("get_extra_services_economics" as never, {
        _from: from.toISOString(),
        _to: to.toISOString(),
      } as never);
      if (error) throw error;
      const parsed = data as unknown as EconomicsData;
      return {
        servizi: (parsed.servizi ?? []).map((s) => ({
          ...s,
          revenue: Number(s.revenue ?? 0),
          cost: s.cost == null ? null : Number(s.cost),
          n_operazioni: Number(s.n_operazioni ?? 0),
        })),
        totals: {
          revenue: Number(parsed.totals?.revenue ?? 0),
          cost_tracked: Number(parsed.totals?.cost_tracked ?? 0),
          margin_tracked: Number(parsed.totals?.margin_tracked ?? 0),
        },
      };
    },
    staleTime: 2 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const totals = data?.totals;
  const marginPct =
    totals && totals.revenue > 0 ? (totals.margin_tracked / totals.revenue) * 100 : 0;

  const kpis = [
    {
      icon: <Coins className="h-4 w-4" />,
      label: "Ricavo servizi extra",
      value: eur(totals?.revenue ?? 0),
      sub: "incassato dalle aziende nel periodo",
    },
    {
      icon: <TrendingUp className="h-4 w-4" />,
      label: "Costo provider",
      value: eur(totals?.cost_tracked ?? 0),
      sub: "Telnyx + OpenRouter/OpenAI + render API",
    },
    {
      icon: <PiggyBank className="h-4 w-4" />,
      label: "Margine",
      value: eur(totals?.margin_tracked ?? 0),
      sub: `${marginPct.toFixed(1)}% sui servizi con costo tracciato`,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">
          Ricavi e costi dei servizi rivenduti oltre il piano (wallet/consumi, esclusi abbonamenti).
        </p>
        <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="30d">Ultimi 30 giorni</SelectItem>
            <SelectItem value="mese">Mese corrente</SelectItem>
            <SelectItem value="90d">Ultimi 90 giorni</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
                {k.icon}
                {k.label}
              </div>
              <p className="text-2xl font-bold tabular-nums mt-1">{k.value}</p>
              <p className="text-xs text-muted-foreground">{k.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dettaglio per servizio</CardTitle>
          <CardDescription>
            WhatsApp ed Email: il costo provider non transita dal database
            (fatturazione Meta diretta / piano email) — escluso dal margine totale.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Servizio</TableHead>
                <TableHead className="text-right">Operazioni</TableHead>
                <TableHead className="text-right">Ricavo</TableHead>
                <TableHead className="text-right">Costo provider</TableHead>
                <TableHead className="text-right">Margine</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.servizi ?? []).map((s) => {
                const margin = s.cost_tracked && s.cost != null ? s.revenue - s.cost : null;
                const marginPctRow =
                  margin != null && s.revenue > 0 ? (margin / s.revenue) * 100 : null;
                return (
                  <TableRow key={s.key}>
                    <TableCell>
                      <span className="flex items-center gap-2 font-medium">
                        {SERVICE_ICONS[s.key]}
                        {s.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.n_operazioni.toLocaleString("it-IT")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{eur(s.revenue)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.cost_tracked && s.cost != null ? (
                        <span className="text-muted-foreground">{eur(s.cost)}</span>
                      ) : (
                        <Badge variant="outline" className="text-[10px]" title={s.cost_note}>
                          n.d.
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {margin != null ? (
                        <span className={`font-medium ${margin >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {eur(margin)}
                          {marginPctRow != null && (
                            <span className="text-xs text-muted-foreground font-normal ml-1">
                              ({marginPctRow.toFixed(0)}%)
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
