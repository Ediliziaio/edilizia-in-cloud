/**
 * BonusRipartizioneCard — la ripartizione bonus vista dalla scheda commessa
 * (sola lettura). Serve a rispondere a UNA domanda: quanto deve bonificare il
 * cliente su ciascuna pratica, e con che causale.
 *
 * Compare solo se l'azienda ha acceso "Bonus edilizi multipli" e la commessa
 * ha davvero delle righe salvate.
 */
import { useQuery } from "@tanstack/react-query";
import { Percent, Copy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/formatters";
import { useBonusFiscaliFlags } from "@/hooks/useBonusFiscaliFlags";
import {
  parseBonusLines,
  lordoRiga,
  ritenutaRiga,
  detrazioneRiga,
  totaliBonus,
  causaleBonificoParlante,
  type DatiCausale,
} from "@/lib/orders/bonusFiscali";

interface Props {
  orderId: string;
  vatRate: number;
  hasBuildingBonus: boolean;
  datiCausale?: DatiCausale;
}

export function BonusRipartizioneCard({ orderId, vatRate, hasBuildingBonus, datiCausale }: Props) {
  const { bonusMultipli } = useBonusFiscaliFlags();

  const { data: lines = [] } = useQuery({
    queryKey: ["order-bonus-lines", orderId],
    enabled: !!orderId && hasBuildingBonus && bonusMultipli,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("order_bonus_lines")
        .select("*")
        .eq("order_id", orderId)
        .order("position");
      if (error) throw error;
      return parseBonusLines(data);
    },
  });

  if (!bonusMultipli || !hasBuildingBonus || lines.length === 0) return null;

  const totali = totaliBonus(lines, vatRate);

  const copia = async (testo: string) => {
    try {
      await navigator.clipboard.writeText(testo);
      toast.success("Causale copiata", { description: "Incollala nel bonifico del cliente." });
    } catch {
      toast.error("Copia non riuscita", { description: "Seleziona il testo e copialo a mano." });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Percent className="h-4 w-4 text-amber-600" />
          Bonus edilizi — {lines.length} pratiche
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Ogni riga è un bonifico parlante a sé: se il cliente ne fa uno solo, una delle detrazioni
          salta.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {lines.map((line) => {
          const lordo = lordoRiga(line, vatRate);
          const ritenuta = ritenutaRiga(line, vatRate);
          const causale = line.causale?.trim() || causaleBonificoParlante(line, datiCausale);
          return (
            <div key={line.position} className="rounded-md border p-2.5 space-y-1.5">
              <div className="flex items-start justify-between gap-3">
                <span className="text-sm font-medium">{line.label || "Agevolazione"}</span>
                <span className="text-sm font-semibold tabular-nums shrink-0">
                  {formatCurrency(lordo)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] sm:grid-cols-3">
                <span className="text-muted-foreground">
                  Imponibile <span className="text-foreground tabular-nums">{formatCurrency(line.imponibile)}</span>
                </span>
                <span className="text-muted-foreground">
                  Ritenuta 11% <span className="text-amber-700 tabular-nums">−{formatCurrency(ritenuta)}</span>
                </span>
                <span className="text-muted-foreground">
                  Detrazione cliente{" "}
                  <span className="text-emerald-700 tabular-nums">
                    {formatCurrency(detrazioneRiga(line, vatRate))}
                  </span>
                </span>
              </div>
              <div className="flex items-start gap-2">
                <p className="text-[11px] text-muted-foreground leading-relaxed flex-1 min-w-0">{causale}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[11px] shrink-0"
                  onClick={() => copia(causale)}
                >
                  <Copy className="h-3 w-3 mr-1" />
                  Copia
                </Button>
              </div>
            </div>
          );
        })}

        <div className="rounded-md bg-muted/50 p-2.5 space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Totale bonifici (IVA inclusa)</span>
            <span className="tabular-nums">{formatCurrency(totali.lordo)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Ritenuta 11% trattenuta dalla banca</span>
            <span className="tabular-nums text-amber-700">−{formatCurrency(totali.ritenuta)}</span>
          </div>
          <div className="flex justify-between font-semibold border-t pt-1">
            <span>Incasso netto</span>
            <span className="tabular-nums">{formatCurrency(totali.netto)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
