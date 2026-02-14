import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardList, Clock, MessageSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

interface RecentActivity {
  id: string;
  type: "order" | "ticket";
  title: string;
  subtitle: string;
  created_at: string;
}

interface Props {
  activities: RecentActivity[];
}

export function AdminRecentActivity({ activities }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Attività Recente</CardTitle>
        <CardDescription>Ultimi ordini e ticket</CardDescription>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Clock className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p>Nessuna attività recente</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activities.map((activity) => (
              <div
                key={`${activity.type}-${activity.id}`}
                className="flex items-start gap-3 p-3 rounded-lg border"
              >
                <div className={`p-2 rounded-lg shrink-0 ${
                  activity.type === "order" ? "bg-green-100" : "bg-orange-100"
                }`}>
                  {activity.type === "order" ? (
                    <ClipboardList className="h-4 w-4 text-green-600" />
                  ) : (
                    <MessageSquare className="h-4 w-4 text-orange-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{activity.title}</p>
                  <p className="text-xs text-muted-foreground">{activity.subtitle}</p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatDistanceToNow(new Date(activity.created_at), {
                    addSuffix: true,
                    locale: it,
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
