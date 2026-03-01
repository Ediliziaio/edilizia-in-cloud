import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AlertTriangle, Bell, X, Clock } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface LifecycleNotification {
  id: string;
  notification_type: string;
  title: string;
  message: string;
  is_read: boolean;
  is_dismissed: boolean;
  created_at: string;
}

export function LifecycleNotificationsBanner() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  const { data: notifications = [] } = useQuery({
    queryKey: ["lifecycle-notifications", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("lifecycle_notifications")
        .select("*")
        .eq("company_id", companyId)
        .eq("is_dismissed", false)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data as LifecycleNotification[];
    },
    enabled: !!companyId,
    staleTime: 60000,
  });

  const dismissMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("lifecycle_notifications")
        .update({ is_dismissed: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lifecycle-notifications", companyId] });
    },
    onError: () => {
      toast.error("Errore nel nascondere la notifica");
    },
  });

  if (notifications.length === 0) return null;

  const getIcon = (type: string) => {
    if (type.includes("trial")) return <Clock className="h-4 w-4" />;
    if (type.includes("inactivity")) return <AlertTriangle className="h-4 w-4" />;
    return <Bell className="h-4 w-4" />;
  };

  const getVariant = (type: string): "default" | "destructive" => {
    if (type.includes("expired") || type.includes("1d")) return "destructive";
    return "default";
  };

  return (
    <div className="space-y-2 px-6 pt-4">
      {notifications.map((n) => (
        <Alert key={n.id} variant={getVariant(n.notification_type)}>
          {getIcon(n.notification_type)}
          <AlertDescription className="flex items-center justify-between">
            <div>
              <span className="font-medium">{n.title}</span>
              <span className="ml-2 text-sm">{n.message}</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={() => dismissMutation.mutate(n.id)}
            >
              <X className="h-3 w-3" />
            </Button>
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
