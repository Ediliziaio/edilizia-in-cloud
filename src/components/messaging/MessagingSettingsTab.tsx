import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, CheckCircle2, ExternalLink, Phone, Send, CheckCheck, Loader2, Plus, Unplug, RefreshCw } from "lucide-react";
import { toast } from "sonner";

// Public Meta App ID — configure this with your own app
const META_APP_ID = "YOUR_META_APP_ID";

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  verified: { label: "Verificato", variant: "default" },
  pending: { label: "In sospeso", variant: "secondary" },
  not_verified: { label: "Non verificato", variant: "outline" },
};

const QUALITY_MAP: Record<string, { label: string; className: string }> = {
  green: { label: "Alta", className: "text-emerald-600" },
  yellow: { label: "Media", className: "text-amber-600" },
  red: { label: "Bassa", className: "text-destructive" },
  none: { label: "Nessuno", className: "text-muted-foreground" },
};

const TIER_MAP: Record<string, string> = {
  TIER_NOT_SET: "Non impostato",
  TIER_50: "50",
  TIER_250: "250",
  TIER_1K: "1K",
  TIER_10K: "10K",
  TIER_100K: "100K",
  TIER_UNLIMITED: "Illimitato",
};

declare global {
  interface Window {
    FB: any;
    fbAsyncInit: () => void;
  }
}

function useFacebookSDK() {
  const loaded = useRef(false);
  const [ready, setReady] = useState(!!window.FB);

  useEffect(() => {
    if (loaded.current || window.FB) {
      if (window.FB) setReady(true);
      return;
    }
    loaded.current = true;

    window.fbAsyncInit = () => {
      window.FB.init({
        appId: META_APP_ID,
        cookie: true,
        xfbml: false,
        version: "v21.0",
      });
      setReady(true);
    };

    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/it_IT/sdk.js";
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
  }, []);

  return ready;
}

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return "Mai";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Adesso";
  if (mins < 60) return `${mins} min fa`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h fa`;
  return `${Math.floor(hours / 24)}g fa`;
}

export function MessagingSettingsTab() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const fbReady = useFacebookSDK();
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [messagingLimitTier, setMessagingLimitTier] = useState<string | null>(null);
  const [lastStatusUpdate, setLastStatusUpdate] = useState<string | null>(null);

  const { data: config, isLoading } = useQuery({
    queryKey: ["whatsapp-config", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from("messaging_whatsapp_config")
        .select("*")
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const isConnected = config?.is_connected === true;

  const pollStatus = useCallback(async () => {
    if (!companyId || !isConnected) return;
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-status", {
        body: { company_id: companyId },
      });
      if (error) throw error;
      if (data?.success) {
        setMessagingLimitTier(data.messaging_limit_tier || null);
        setLastStatusUpdate(data.updated_at || new Date().toISOString());
        queryClient.invalidateQueries({ queryKey: ["whatsapp-config"] });
      }
    } catch (err) {
      logger.error("Status poll error:", err);
    }
  }, [companyId, isConnected, queryClient]);

  // Auto-poll every 60s when connected
  useEffect(() => {
    if (!isConnected) return;
    // Initial fetch
    pollStatus();
    const interval = setInterval(pollStatus, 60000);
    return () => clearInterval(interval);
  }, [isConnected, pollStatus]);

  const handleRefreshStatus = useCallback(async () => {
    setRefreshing(true);
    await pollStatus();
    setRefreshing(false);
  }, [pollStatus]);

  const handleConnectWhatsApp = useCallback(() => {
    if (!fbReady || !window.FB || !companyId) {
      toast.error("Errore", { description: "SDK Facebook non ancora caricato. Riprova tra un momento." });
      return;
    }

    setConnecting(true);

    window.FB.login(
      async (response: any) => {
        if (response.authResponse?.code) {
          try {
            const { data, error } = await supabase.functions.invoke("whatsapp-connect", {
              body: {
                code: response.authResponse.code,
                company_id: companyId,
                meta_app_id: META_APP_ID,
              },
            });

            if (error) throw error;
            if (data?.error) throw new Error(data.details || data.error);

            toast.success("WhatsApp collegato!", {
              description: data.phone_number
                ? `Numero ${data.phone_number} collegato con successo.`
                : "Account collegato con successo.",
            });

            queryClient.invalidateQueries({ queryKey: ["whatsapp-config"] });
          } catch (err: any) {
            logger.error("Connect error:", err);
            toast.error("Errore collegamento", {
              description: err?.message || "Impossibile completare il collegamento. Riprova.",
            });
          }
        } else {
          toast.error("Collegamento annullato", { description: "Hai annullato il processo di collegamento." });
        }
        setConnecting(false);
      },
      {
        config_id: "",
        response_type: "code",
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: "only_waba_sharing",
          sessionInfoVersion: 3,
        },
      }
    );
  }, [fbReady, companyId, queryClient]);

  const handleDisconnect = useCallback(async () => {
    if (!companyId || !config) return;
    setDisconnecting(true);
    try {
      const { error } = await supabase
        .from("messaging_whatsapp_config")
        .update({
          is_connected: false,
          access_token_encrypted: null,
          phone_number_id: null,
          waba_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq("company_id", companyId);

      if (error) throw error;

      toast.success("WhatsApp disconnesso", { description: "Il numero è stato scollegato con successo." });
      setMessagingLimitTier(null);
      setLastStatusUpdate(null);
      queryClient.invalidateQueries({ queryKey: ["whatsapp-config"] });
    } catch (err: any) {
      toast.error("Errore", { description: err?.message || "Impossibile disconnettere." });
    }
    setDisconnecting(false);
  }, [companyId, config, queryClient]);

  const handleVerifyNow = () => {
    window.open("https://business.facebook.com/settings/security/", "_blank", "noopener,noreferrer");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasConfig = !!config;
  const accountStatus = config?.account_status || "not_verified";
  const qualityRating = config?.quality_rating || "none";
  const statusInfo = STATUS_MAP[accountStatus] || STATUS_MAP.not_verified;
  const qualityInfo = QUALITY_MAP[qualityRating] || QUALITY_MAP.none;
  const tierLabel = messagingLimitTier ? (TIER_MAP[messagingLimitTier] || messagingLimitTier) : "—";

  return (
    <TooltipProvider>
      <div className="space-y-6 max-w-4xl">
        {/* Verification banner */}
        {accountStatus !== "verified" && (
          <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
            <CardContent className="flex items-start gap-4 p-4">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-sm">Verifica di WhatsApp Business in sospeso</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Costruisci fiducia con i tuoi clienti mostrando un nome verificato. Completa la verifica del tuo account Meta Business per sbloccare tutte le funzionalità.
                </p>
              </div>
              <Button variant="outline" size="sm" className="gap-1.5 flex-shrink-0" onClick={handleVerifyNow}>
                Verifica ora
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Account overview */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-emerald-500 flex items-center justify-center">
                <Phone className="h-5 w-5 text-white" />
              </div>
              <div>
                <CardTitle className="text-lg">WhatsApp Business</CardTitle>
                <CardDescription>
                  {hasConfig ? config.business_name || effectiveCompany?.name : effectiveCompany?.name}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Status row */}
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Stato dell'account:</span>
                <Badge variant={statusInfo.variant}>
                  {accountStatus === "verified" && <CheckCircle2 className="h-3 w-3 mr-1" />}
                  {statusInfo.label}
                </Badge>
                {isConnected && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={handleRefreshStatus}
                        disabled={refreshing}
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Ultimo aggiornamento: {formatTimeAgo(lastStatusUpdate)}</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Verifica Meta Business:</span>
                <Badge variant={accountStatus === "verified" ? "default" : "outline"}>
                  {accountStatus === "verified" ? "Completata" : "In sospeso"}
                </Badge>
              </div>
            </div>

            {/* Stats cards */}
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Send className="h-4 w-4" />
                    <span className="text-xs">Messaggi inviati (7gg)</span>
                  </div>
                  <p className="text-2xl font-bold">—</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <CheckCheck className="h-4 w-4" />
                    <span className="text-xs">Messaggi consegnati (7gg)</span>
                  </div>
                  <p className="text-2xl font-bold">—</p>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>

        {/* Phone numbers */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Numeri di telefono</CardTitle>
                <CardDescription>
                  {isConnected && config?.phone_number ? "1 Numero collegato" : "Nessun numero collegato"}
                </CardDescription>
              </div>
              {isConnected && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="gap-1.5 text-destructive hover:text-destructive"
                >
                  {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />}
                  Disconnetti
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isConnected && config?.phone_number ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Numero</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Limite</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead>Qualità</TableHead>
                    <TableHead className="text-right">Attività</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">{config.phone_number}</TableCell>
                    <TableCell>{config.business_name || "—"}</TableCell>
                    <TableCell>{tierLabel}</TableCell>
                    <TableCell>
                      <Badge variant="default">Collegato</Badge>
                    </TableCell>
                    <TableCell>
                      <span className={qualityInfo.className}>{qualityInfo.label}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          window.open(
                            "https://business.facebook.com/latest/whatsapp_manager/phone_numbers/",
                            "_blank",
                            "noopener,noreferrer"
                          )
                        }
                        className="gap-1"
                      >
                        Gestisci
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Phone className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm mb-4">Collega il tuo numero WhatsApp Business per iniziare a ricevere e inviare messaggi.</p>
              </div>
            )}

            {!isConnected && (
              <div className="mt-4 flex justify-center">
                <Button onClick={handleConnectWhatsApp} disabled={connecting || !fbReady} className="gap-2">
                  {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {connecting ? "Collegamento in corso..." : "Collega numero WhatsApp"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
