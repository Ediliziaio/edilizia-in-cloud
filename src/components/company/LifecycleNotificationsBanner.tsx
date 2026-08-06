import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
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

  /**
   * Quante notifiche mostrare in testa alla pagina. Oltre questa soglia
   * l'avviso smette di essere un avviso e diventa un muro da scavalcare.
   */
  const MAX_VISIBILI = 2;

  const { data: notifications = [] } = useQuery({
    queryKey: queryKeys.lifecycleNotifications.byCompany(companyId),
    queryFn: async ({ signal }) => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("lifecycle_notifications")
        .select("id, notification_type, title, message, is_read, is_dismissed, created_at")
        .eq("company_id", companyId)
        .eq("is_dismissed", false)
        .order("created_at", { ascending: false })
        .limit(50)
        .abortSignal(signal);
      if (error) throw error;
      return data as LifecycleNotification[];
    },
    enabled: !!companyId,
    staleTime: 60000,
  });

  /**
   * Una card per TIPO, non per riga. Il cron che genera questi avvisi gira
   * ogni giorno: cinque giorni di cash flow negativo producevano cinque
   * banner identici uno sotto l'altro. Il fatto e' uno solo — "il mese
   * prossimo vai sotto" — e va detto una volta, con da quando lo si sta
   * dicendo.
   */
  const gruppi = useMemo(() => {
    const perTipo = new Map<string, { n: LifecycleNotification; ids: string[]; dal: string }>();
    // La query e' gia' ordinata dal piu' recente: il primo che incontro e'
    // quello da mostrare, gli altri sono repliche piu' vecchie.
    for (const n of notifications) {
      const g = perTipo.get(n.notification_type);
      if (g) {
        g.ids.push(n.id);
        g.dal = n.created_at; // l'ultimo visto e' il piu' vecchio del gruppo
      } else {
        perTipo.set(n.notification_type, { n, ids: [n.id], dal: n.created_at });
      }
    }
    return Array.from(perTipo.values());
  }, [notifications]);

  const visibili = gruppi.slice(0, MAX_VISIBILI);
  const nascosti = gruppi.length - visibili.length;

  const dismissMutation = useMutation({
    // Si chiude il GRUPPO, non la singola riga: chiudere una replica e
    // vedersene comparire un'altra identica sotto e' peggio che non poterle
    // chiudere affatto.
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("lifecycle_notifications")
        .update({ is_dismissed: true })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.lifecycleNotifications.byCompany(companyId) });
    },
    onError: () => {
      toast.error("Errore nel nascondere la notifica");
    },
  });

  if (gruppi.length === 0) return null;

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
      {visibili.map(({ n, ids, dal }) => (
        <Alert key={n.notification_type} variant={getVariant(n.notification_type)}>
          {getIcon(n.notification_type)}
          <AlertDescription className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="font-medium">{n.title}</span>
              <span className="ml-2 text-sm">{n.message}</span>
              {ids.length > 1 && (
                <span className="ml-2 text-xs opacity-70">
                  · te lo segnaliamo da {daQuando(dal)}
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              aria-label="Nascondi questo avviso"
              onClick={() => dismissMutation.mutate(ids)}
            >
              <X className="h-3 w-3" />
            </Button>
          </AlertDescription>
        </Alert>
      ))}
      {nascosti > 0 && (
        <p className="text-xs text-muted-foreground px-1">
          e altri {nascosti} avvisi di tipo diverso
        </p>
      )}
    </div>
  );
}

/**
 * "da 5 giorni" / "da ieri" / "da oggi" — serve a distinguere un problema
 * nuovo da uno che ti trascini: e' l'informazione che il banner ripetuto
 * cinque volte cercava di dare, senza riuscirci.
 */
function daQuando(iso: string): string {
  const giorni = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (giorni <= 0) return "oggi";
  if (giorni === 1) return "ieri";
  return `${giorni} giorni`;
}
