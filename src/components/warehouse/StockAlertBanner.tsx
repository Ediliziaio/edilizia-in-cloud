import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, X, ChevronDown, ChevronUp } from "lucide-react";

interface StockAlertBannerProps {
  companyId: string;
}

interface LottoAlert {
  id: string;
  codice_lotto: string;
  descrizione: string;
  quantita: number;
  unita_misura: string | null;
  data_scadenza: string;
  posizione: string | null;
  daysLeft: number;
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  return Math.floor((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function StockAlertBanner({ companyId }: StockAlertBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const { data: alertLotti = [] } = useQuery<LottoAlert[]>({
    queryKey: ["stock-lotti-alerts", companyId],
    queryFn: async () => {
      const in30days = new Date();
      in30days.setDate(in30days.getDate() + 30);
      const { data } = await supabase
        .from("stock_lotti")
        .select("id, codice_lotto, descrizione, quantita, unita_misura, data_scadenza, posizione")
        .eq("company_id", companyId)
        .not("data_scadenza", "is", null)
        .lte("data_scadenza", in30days.toISOString().split("T")[0])
        .gt("quantita", 0)
        .order("data_scadenza", { ascending: true });
      return (data || []).map((l: any) => ({ ...l, daysLeft: daysUntil(l.data_scadenza) }));
    },
    enabled: !!companyId,
    refetchInterval: 60 * 60 * 1000, // every hour
    refetchIntervalInBackground: false,
  });

  if (dismissed || alertLotti.length === 0) return null;

  const scadutiCount = alertLotti.filter((l) => l.daysLeft < 0).length;
  const inScadenzaCount = alertLotti.filter((l) => l.daysLeft >= 0).length;

  const VISIBLE_MAX = 3;
  const visibleLotti = expanded ? alertLotti : alertLotti.slice(0, VISIBLE_MAX);

  return (
    <Alert variant="destructive" className="relative border-orange-300 bg-orange-50 text-orange-900">
      <AlertTriangle className="h-4 w-4 text-orange-600" aria-hidden="true" />
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <AlertTitle className="text-orange-800 flex items-center gap-2 flex-wrap">
            Lotti in scadenza
            {scadutiCount > 0 && (
              <Badge className="bg-red-100 text-red-800 text-xs">{scadutiCount} scadut{scadutiCount === 1 ? "o" : "i"}</Badge>
            )}
            {inScadenzaCount > 0 && (
              <Badge className="bg-orange-100 text-orange-800 text-xs">{inScadenzaCount} entro 30 gg</Badge>
            )}
          </AlertTitle>
          <AlertDescription className="mt-1">
            <div className="space-y-1 mt-2">
              {visibleLotti.map((l) => (
                <div key={l.id} className="flex items-center gap-2 text-xs flex-wrap">
                  <span className="font-mono font-medium">{l.codice_lotto}</span>
                  <span className="text-orange-700">{l.descrizione}</span>
                  <span className="text-orange-600">({l.quantita} {l.unita_misura || "pz"})</span>
                  <Badge
                    className={`text-[10px] px-1.5 ${
                      l.daysLeft < 0
                        ? "bg-red-100 text-red-800"
                        : l.daysLeft <= 7
                        ? "bg-orange-200 text-orange-900"
                        : "bg-yellow-100 text-yellow-800"
                    }`}
                  >
                    {l.daysLeft < 0
                      ? `Scaduto ${Math.abs(l.daysLeft)}g fa`
                      : l.daysLeft === 0
                      ? "Scade oggi"
                      : `${l.daysLeft}g`}
                  </Badge>
                  {l.posizione && <span className="text-muted-foreground">📍 {l.posizione}</span>}
                </div>
              ))}
            </div>
            {alertLotti.length > VISIBLE_MAX && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-1 h-6 text-xs text-orange-700 hover:text-orange-900 p-0"
                onClick={() => setExpanded((e) => !e)}
              >
                {expanded ? (
                  <><ChevronUp className="h-3 w-3 mr-1" aria-hidden="true" />Mostra meno</>
                ) : (
                  <><ChevronDown className="h-3 w-3 mr-1" aria-hidden="true" />Vedi tutti ({alertLotti.length})</>
                )}
              </Button>
            )}
          </AlertDescription>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-orange-600 hover:text-orange-800 hover:bg-orange-100 shrink-0"
          onClick={() => setDismissed(true)}
          aria-label="Chiudi avvisi lotti"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>
    </Alert>
  );
}
