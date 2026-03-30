import { useMyTaskCount } from "@/hooks/useMyTaskCount";
import { useAuth } from "@/contexts/AuthContext";
import { AlertTriangle, CalendarDays, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface MyDayHeaderProps {
  estimatedHoursToday?: number;
}

export function MyDayHeader({ estimatedHoursToday }: MyDayHeaderProps) {
  const { profile } = useAuth();
  const { data: count } = useMyTaskCount();

  const ora = new Date().getHours();
  const saluto = ora < 12 ? "Buongiorno" : ora < 18 ? "Buon pomeriggio" : "Buonasera";
  const nome = profile?.first_name || "utente";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">{saluto}, {nome} 👋</h2>
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      <div className={`grid grid-cols-1 gap-3 ${estimatedHoursToday ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <CalendarDays className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{count?.dueToday ?? 0}</p>
              <p className="text-xs text-muted-foreground">Da fare oggi</p>
            </div>
          </CardContent>
        </Card>

        <Card className={count?.overdue ? "border-destructive/30" : ""}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg bg-destructive/10 p-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-bold">{count?.overdue ?? 0}</p>
              <p className="text-xs text-muted-foreground">Scadute</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg bg-muted p-2">
              <Clock className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold">{count?.total ?? 0}</p>
              <p className="text-xs text-muted-foreground">Totale aperte</p>
            </div>
          </CardContent>
        </Card>

        {estimatedHoursToday != null && estimatedHoursToday > 0 && (
          <Card className="border-primary/20">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">~{estimatedHoursToday}h</p>
                <p className="text-xs text-muted-foreground">Stimate oggi</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
