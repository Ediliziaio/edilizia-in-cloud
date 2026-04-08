import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight } from "lucide-react";
import type { FotoAnalisi } from "@/modules/render/lib/promptBuilder";

interface Props {
  analisi: FotoAnalisi | null;
  nuovoMateriale?: string;
  nuovoColore?: string;
}

export default function StructuralChangeBox({ analisi, nuovoMateriale, nuovoColore }: Props) {
  if (!analisi || !nuovoMateriale) return null;

  const materialeLabels: Record<string, string> = {
    pvc: "PVC",
    alluminio: "Alluminio",
    legno: "Legno",
    legno_alluminio: "Legno-Alluminio",
    acciaio_corten: "Acciaio Corten",
    acciaio_minimale: "Acciaio Minimale",
  };

  return (
    <Card className="border-accent/30 bg-accent/5">
      <CardContent className="py-3">
        <p className="text-xs font-semibold text-accent-foreground mb-2">🔄 Cambio Strutturale</p>
        <div className="flex items-center gap-3 text-sm">
          <div className="flex-1 text-center">
            <p className="text-muted-foreground text-xs">Attuale</p>
            <p className="font-medium text-foreground">{analisi.materiale_attuale?.replace(/_/g, " ")}</p>
            <p className="text-xs text-muted-foreground">{analisi.colore_attuale}</p>
          </div>
          <ArrowRight className="h-4 w-4 text-primary shrink-0" />
          <div className="flex-1 text-center">
            <p className="text-muted-foreground text-xs">Nuovo</p>
            <p className="font-medium text-primary">{materialeLabels[nuovoMateriale] || nuovoMateriale}</p>
            {nuovoColore && <p className="text-xs text-muted-foreground">{nuovoColore}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
