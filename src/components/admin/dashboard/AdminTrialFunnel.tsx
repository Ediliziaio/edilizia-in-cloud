import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock, CheckCircle, XCircle } from "lucide-react";

interface Props {
  trialCount: number;
  activeCount: number;
  expiredCount: number;
  trialExpiringSoon: number;
}

export function AdminTrialFunnel({ trialCount, activeCount, expiredCount, trialExpiringSoon }: Props) {
  const totalStarted = trialCount + activeCount + expiredCount;
  const conversionRate = totalStarted > 0 ? Math.round((activeCount / totalStarted) * 100) : 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Funnel Trial → Paid</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-500" />
              <span className="text-sm">In Trial</span>
            </div>
            <Badge variant="outline">{trialCount}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span className="text-sm">Scadono a breve</span>
            </div>
            <Badge variant={trialExpiringSoon > 0 ? "destructive" : "outline"}>{trialExpiringSoon}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              <span className="text-sm">Convertiti (Active)</span>
            </div>
            <Badge variant="default">{activeCount}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-destructive" />
              <span className="text-sm">Persi (Expired)</span>
            </div>
            <Badge variant="secondary">{expiredCount}</Badge>
          </div>
          <div className="pt-2 border-t">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Conversion Rate</span>
              <span className={`text-lg font-bold ${conversionRate >= 50 ? "text-emerald-600" : conversionRate >= 25 ? "text-amber-600" : "text-destructive"}`}>
                {conversionRate}%
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
