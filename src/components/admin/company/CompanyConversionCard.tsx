import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Zap, Clock, CheckCircle, XCircle, CreditCard, Send, CalendarPlus, ArrowUpRight } from "lucide-react";
import { differenceInDays } from "date-fns";

interface CompanyConversionCardProps {
  trialEndsAt: string | null;
  onboardingPct: number;
  paymentMethod: string;
  onExtendTrial?: (days: number) => void;
  isExtendingTrial?: boolean;
}

export function CompanyConversionCard({
  trialEndsAt, onboardingPct, paymentMethod, onExtendTrial, isExtendingTrial,
}: CompanyConversionCardProps) {
  const daysLeft = trialEndsAt ? differenceInDays(new Date(trialEndsAt), new Date()) : null;
  const hasPayment = paymentMethod !== "none" && paymentMethod !== "";
  const urgency = daysLeft !== null && daysLeft <= 3 ? "destructive" : daysLeft !== null && daysLeft <= 7 ? "secondary" : "outline";

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          Conversione Trial
          {daysLeft !== null && (
            <Badge variant={urgency} className="ml-auto">
              <Clock className="h-3 w-3 mr-1" />
              {daysLeft > 0 ? `${daysLeft} giorni rimasti` : "Scaduto"}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Onboarding progress */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-medium">Onboarding</span>
            <span className="text-sm font-semibold">{onboardingPct}%</span>
          </div>
          <Progress value={onboardingPct} className="h-2" />
        </div>

        {/* Payment method */}
        <div className="flex items-center justify-between">
          <span className="text-sm">Metodo pagamento</span>
          {hasPayment ? (
            <Badge variant="outline" className="text-green-600 border-green-600/30">
              <CheckCircle className="h-3 w-3 mr-1" />
              Configurato
            </Badge>
          ) : (
            <Badge variant="outline" className="text-red-600 border-red-600/30">
              <XCircle className="h-3 w-3 mr-1" />
              Mancante
            </Badge>
          )}
        </div>

        {/* CTAs */}
        <div className="flex flex-wrap gap-2 pt-2">
          {onExtendTrial && daysLeft !== null && daysLeft <= 7 && (
            <Button size="sm" variant="outline" onClick={() => onExtendTrial(7)} disabled={isExtendingTrial}>
              <CalendarPlus className="h-3.5 w-3.5 mr-1" />
              Estendi 7gg
            </Button>
          )}
          {!hasPayment && (
            <Button size="sm" variant="outline">
              <CreditCard className="h-3.5 w-3.5 mr-1" />
              Genera checkout
            </Button>
          )}
          <Button size="sm" variant="default">
            <ArrowUpRight className="h-3.5 w-3.5 mr-1" />
            Proponi upgrade
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
