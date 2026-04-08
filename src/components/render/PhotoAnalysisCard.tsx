import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Eye, AlertTriangle, CheckCircle, RefreshCw } from "lucide-react";
import type { FotoAnalisi } from "@/modules/render/lib/promptBuilder";

interface Props {
  analysisData: FotoAnalisi | null;
  loading: boolean;
  error?: string;
  onRetry?: () => void;
}

const conditionColor: Record<string, string> = {
  buone: "text-green-600",
  usurato: "text-yellow-600",
  danneggiato: "text-orange-600",
  fatiscente: "text-red-600",
};

const conditionIcon: Record<string, typeof CheckCircle> = {
  buone: CheckCircle,
  usurato: AlertTriangle,
  danneggiato: AlertTriangle,
  fatiscente: AlertTriangle,
};

export default function PhotoAnalysisCard({ analysisData, loading, error, onRetry }: Props) {
  if (loading) {
    return (
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-center gap-3 py-4">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <div>
            <p className="text-sm font-medium text-foreground">Analisi AI in corso...</p>
            <p className="text-xs text-muted-foreground">Identifico tipo finestra, materiali e condizioni</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/20 bg-destructive/5">
        <CardContent className="py-4 space-y-2">
          <p className="text-sm text-destructive">{error}</p>
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry} className="gap-2">
              <RefreshCw className="h-3.5 w-3.5" />
              Riprova Analisi
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  if (!analysisData) return null;

  const CondIcon = conditionIcon[analysisData.condizioni] || AlertTriangle;

  return (
    <Card className="border-primary/20">
      <CardContent className="py-4 space-y-3">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Analisi Automatica</span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="space-y-1">
            <span className="text-muted-foreground">Tipo apertura</span>
            <p className="font-medium text-foreground">{analysisData.tipo_apertura?.replace(/_/g, " ")}</p>
          </div>
          <div className="space-y-1">
            <span className="text-muted-foreground">Materiale attuale</span>
            <p className="font-medium text-foreground">{analysisData.materiale_attuale?.replace(/_/g, " ")}</p>
          </div>
          <div className="space-y-1">
            <span className="text-muted-foreground">Colore attuale</span>
            <p className="font-medium text-foreground">{analysisData.colore_attuale}</p>
          </div>
          <div className="space-y-1">
            <span className="text-muted-foreground">Condizioni</span>
            <p className={`font-medium flex items-center gap-1 ${conditionColor[analysisData.condizioni] || ""}`}>
              <CondIcon className="h-3 w-3" />
              {analysisData.condizioni}
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-muted-foreground">Stile edificio</span>
            <p className="font-medium text-foreground">{analysisData.stile_edificio}</p>
          </div>
          <div className="space-y-1">
            <span className="text-muted-foreground">N° ante</span>
            <p className="font-medium text-foreground">{analysisData.num_ante_attuale}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {analysisData.presenza_cassonetto && <Badge variant="outline" className="text-xs">Cassonetto</Badge>}
          {analysisData.presenza_davanzale && <Badge variant="outline" className="text-xs">Davanzale</Badge>}
          {analysisData.presenza_inferriata && <Badge variant="outline" className="text-xs">Inferriata</Badge>}
        </div>
      </CardContent>
    </Card>
  );
}
