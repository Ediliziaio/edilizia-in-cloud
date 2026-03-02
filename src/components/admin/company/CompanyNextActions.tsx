import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lightbulb, AlertTriangle, Clock, CreditCard, ListChecks, UserX } from "lucide-react";
import { differenceInDays } from "date-fns";

interface CompanyNextActionsProps {
  status: string;
  trialEndsAt: string | null;
  onboardingPct: number;
  daysSinceLastOrder: number | null;
  paymentMethod: string;
}

interface Action {
  icon: typeof Lightbulb;
  message: string;
  priority: "high" | "medium" | "low";
}

export function getNextActions({
  status, trialEndsAt, onboardingPct, daysSinceLastOrder, paymentMethod,
}: CompanyNextActionsProps): Action[] {
  const actions: Action[] = [];
  const hasPayment = paymentMethod !== "none" && paymentMethod !== "";

  // Trial expiring soon
  if (status === "trial" && trialEndsAt) {
    const daysLeft = differenceInDays(new Date(trialEndsAt), new Date());
    if (daysLeft <= 3 && daysLeft >= 0) {
      actions.push({ icon: AlertTriangle, message: `Trial scade tra ${daysLeft}gg — Proponi piano Pro`, priority: "high" });
    } else if (daysLeft <= 7) {
      actions.push({ icon: Clock, message: `Trial scade tra ${daysLeft}gg — Invia reminder upgrade`, priority: "medium" });
    }
  }

  // Onboarding incomplete
  if (onboardingPct < 100) {
    const prio = onboardingPct < 40 ? "high" : "medium";
    actions.push({ icon: ListChecks, message: `Onboarding incompleto (${onboardingPct}%) — Invia checklist`, priority: prio });
  }

  // No payment method
  if (!hasPayment && (status === "trial" || status === "active")) {
    actions.push({ icon: CreditCard, message: "Nessun metodo pagamento — Genera link checkout", priority: "medium" });
  }

  // Inactive
  if (daysSinceLastOrder !== null && daysSinceLastOrder > 14 && status === "active") {
    actions.push({ icon: UserX, message: `Inattiva da ${daysSinceLastOrder}gg — Schedula follow-up`, priority: daysSinceLastOrder > 30 ? "high" : "medium" });
  }

  // Expired
  if (status === "expired") {
    actions.push({ icon: AlertTriangle, message: "Trial scaduto — Contatta per conversione o estensione", priority: "high" });
  }

  return actions.sort((a, b) => {
    const p = { high: 0, medium: 1, low: 2 };
    return p[a.priority] - p[b.priority];
  });
}

const priorityColors: Record<string, string> = {
  high: "text-red-600 bg-red-500/10",
  medium: "text-amber-600 bg-amber-500/10",
  low: "text-blue-600 bg-blue-500/10",
};

export function CompanyNextActions(props: CompanyNextActionsProps) {
  const actions = getNextActions(props);
  if (actions.length === 0) return null;

  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardContent className="py-3 px-4">
        <div className="flex items-center gap-2 mb-2">
          <Lightbulb className="h-4 w-4 text-amber-600" />
          <span className="text-sm font-semibold">Azioni suggerite</span>
          <Badge variant="secondary" className="text-[10px]">{actions.length}</Badge>
        </div>
        <div className="space-y-1.5">
          {actions.map((action, i) => {
            const Icon = action.icon;
            const colors = priorityColors[action.priority];
            return (
              <div key={i} className="flex items-center gap-2.5 text-sm">
                <div className={`p-1 rounded ${colors}`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <span>{action.message}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
