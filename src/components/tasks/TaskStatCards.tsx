import { Card, CardContent } from "@/components/ui/card";
import { ListTodo, AlertTriangle, Clock, CheckCircle2 } from "lucide-react";

interface TaskStatCardsProps {
  active: number;
  expiring: number;
  overdue: number;
  completedThisWeek: number;
}

export function TaskStatCards({ active, expiring, overdue, completedThisWeek }: TaskStatCardsProps) {
  const stats = [
    { label: "Attive", value: active, icon: ListTodo, color: "text-primary" },
    { label: "In scadenza (48h)", value: expiring, icon: Clock, color: "text-warning" },
    { label: "Scadute", value: overdue, icon: AlertTriangle, color: "text-destructive" },
    { label: "Completate (settimana)", value: completedThisWeek, icon: CheckCircle2, color: "text-success" },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className={`rounded-lg p-2 bg-muted ${stat.color}`}>
              <stat.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
