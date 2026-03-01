import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Circle, ChevronDown, ChevronUp, Rocket, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { useOnboardingProgress } from "@/hooks/useOnboardingProgress";

export function OnboardingChecklist() {
  const { data, isLoading } = useOnboardingProgress();
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(true);

  if (isLoading || !data || data.pct === 100 || dismissed) return null;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Inizia con EdiliziaInCloud</CardTitle>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => setDismissed(true)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-2">
          <Progress value={data.pct} className="h-2 flex-1" />
          <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
            {data.completed}/{data.total}
          </span>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0 space-y-2">
          {data.steps.map((step) => (
            <Link
              key={step.key}
              to={step.href}
              className={`flex items-start gap-3 p-2.5 rounded-lg transition-colors ${
                step.done
                  ? "opacity-60"
                  : "hover:bg-primary/10"
              }`}
            >
              {step.done ? (
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
              )}
              <div>
                <p className={`text-sm font-medium ${step.done ? "line-through text-muted-foreground" : "text-foreground"}`}>
                  {step.label}
                </p>
                <p className="text-xs text-muted-foreground">{step.description}</p>
              </div>
            </Link>
          ))}
        </CardContent>
      )}
    </Card>
  );
}
