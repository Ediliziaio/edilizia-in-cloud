import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Loader2, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface UserActivityLogTabProps {
  userId: string;
}

const ACTION_LABELS: Record<string, string> = {
  user_created: "Utente creato",
  login: "Login",
  logout: "Logout",
  password_changed: "Password cambiata",
  role_changed: "Ruolo modificato",
  permissions_updated: "Permessi aggiornati",
  session_revoked: "Sessione revocata",
  account_locked: "Account bloccato",
  account_unlocked: "Account sbloccato",
};

const ACTION_COLORS: Record<string, string> = {
  login: "bg-green-600/10 text-green-700 border-green-600/20",
  logout: "bg-muted text-muted-foreground",
  password_changed: "bg-blue-600/10 text-blue-700 border-blue-600/20",
  account_locked: "bg-destructive/10 text-destructive border-destructive/20",
  account_unlocked: "bg-orange-600/10 text-orange-700 border-orange-600/20",
};

export function UserActivityLogTab({ userId }: UserActivityLogTabProps) {
  const [actionFilter, setActionFilter] = useState<string>("all");

  const { data: logs, isLoading } = useQuery({
    queryKey: ["user-audit-log", userId, actionFilter],
    queryFn: async () => {
      let query = supabase
        .from("user_audit_log")
        .select("*")
        .or(`actor_id.eq.${userId},target_user_id.eq.${userId}`)
        .order("created_at", { ascending: false })
        .limit(100);

      if (actionFilter !== "all") {
        query = query.eq("action", actionFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const exportCsv = () => {
    if (!logs || logs.length === 0) return;
    const headers = ["Data", "Azione", "Attore", "Dettagli"];
    const rows = logs.map((log) => [
      format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss"),
      ACTION_LABELS[log.action] || log.action,
      log.actor_id,
      JSON.stringify(log.details || {}),
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${v}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `activity-log-${userId.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Log Attività</CardTitle>
          <CardDescription>{logs?.length || 0} eventi registrati</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filtra azione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte le azioni</SelectItem>
              <SelectItem value="login">Login</SelectItem>
              <SelectItem value="logout">Logout</SelectItem>
              <SelectItem value="password_changed">Password cambiata</SelectItem>
              <SelectItem value="role_changed">Ruolo modificato</SelectItem>
              <SelectItem value="permissions_updated">Permessi aggiornati</SelectItem>
              <SelectItem value="session_revoked">Sessione revocata</SelectItem>
              <SelectItem value="account_locked">Account bloccato</SelectItem>
              <SelectItem value="account_unlocked">Account sbloccato</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!logs?.length}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {(!logs || logs.length === 0) ? (
          <div className="text-center py-8">
            <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Nessun evento registrato.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {logs.map((log) => (
              <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg border bg-card">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className={ACTION_COLORS[log.action] || ""}>
                      {ACTION_LABELS[log.action] || log.action}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: it })}
                    </span>
                  </div>
                  {log.details && typeof log.details === "object" && Object.keys(log.details).length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {Object.entries(log.details as Record<string, unknown>)
                        .filter(([_, v]) => v !== null && v !== undefined)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(" • ")}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
