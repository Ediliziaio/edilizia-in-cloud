/**
 * GoogleAdsConnectionCard — Google Ads OAuth + customer picker + sync
 *
 * Pattern identico a GbpConnectionCard, con step aggiuntivo di selezione
 * Customer ID (azienda Google Ads). MCC manager_customer_id opzionale.
 *
 * Da mostrare in /azienda/marketing/pubblicita o in SettingsIntegrations come
 * card dedicata (in alternativa al wizard MetaIntegrationWizard esistente).
 */
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CheckCircle2, AlertTriangle, RefreshCw, Trash2, Megaphone } from "lucide-react";

type GoogleAdsConnection = {
  id: string;
  google_account_email: string | null;
  status: string;
  customer_id: string | null;
  customer_descriptive_name: string | null;
  customer_currency_code: string | null;
  manager_customer_id: string | null;
  is_manager: boolean | null;
  is_test_account: boolean | null;
  last_sync_at: string | null;
  last_sync_campaign_count: number | null;
  last_error: string | null;
};

type GoogleAdsCustomer = {
  customer_id: string;
  descriptive_name: string | null;
  currency_code: string | null;
  time_zone: string | null;
  is_manager: boolean | null;
  is_test_account: boolean | null;
};

const POPUP_POLL_INTERVAL_MS = 800;
const POPUP_MAX_WAIT_MS = 5 * 60_000;

export default function GoogleAdsConnectionCard() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedManagerId, setSelectedManagerId] = useState("");
  const popupRef = useRef<Window | null>(null);
  const pollRef = useRef<number | null>(null);
  const maxWaitRef = useRef<number | null>(null);

  const getAccessToken = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Sessione scaduta");
    return session.access_token;
  }, []);

  const { data: connection, refetch: refetchConnection } = useQuery({
    queryKey: ["google-ads-connection", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from("google_ads_connections")
        .select("id, google_account_email, status, customer_id, customer_descriptive_name, customer_currency_code, manager_customer_id, is_manager, is_test_account, last_sync_at, last_sync_campaign_count, last_error")
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      return data as GoogleAdsConnection | null;
    },
    enabled: !!companyId,
  });

  const isConnected = connection?.status === "connected" || connection?.status === "needs_customer_selection";
  const needsCustomerSelection = connection?.status === "needs_customer_selection" || (isConnected && !connection?.customer_id);
  const isReady = connection?.status === "connected" && !!connection?.customer_id;

  const { data: customers = [] } = useQuery({
    queryKey: ["google-ads-customers-cache", connection?.id],
    queryFn: async () => {
      if (!connection?.id) return [];
      const { data, error } = await supabase
        .from("google_ads_customers_cache")
        .select("customer_id, descriptive_name, currency_code, time_zone, is_manager, is_test_account")
        .eq("connection_id", connection.id)
        .order("is_manager", { ascending: true }); // non-manager first
      if (error) throw error;
      return (data ?? []) as GoogleAdsCustomer[];
    },
    enabled: isConnected && needsCustomerSelection,
  });

  const operationalCustomers = useMemo(
    () => customers.filter((c) => !c.is_manager),
    [customers],
  );
  const managerCustomers = useMemo(
    () => customers.filter((c) => c.is_manager),
    [customers],
  );

  // ── OAuth popup ───────────────────────────────────────────────────────────
  const cleanupPopup = useCallback(() => {
    if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
    if (maxWaitRef.current) { window.clearTimeout(maxWaitRef.current); maxWaitRef.current = null; }
    if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
    popupRef.current = null;
    setConnecting(false);
  }, []);

  useEffect(() => () => cleanupPopup(), [cleanupPopup]);

  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      const data = ev.data;
      if (!data || data.source !== "google-ads-oauth") return;
      if (data.status === "ok") {
        toast.success("Google Ads collegato — seleziona l'account");
        queryClient.invalidateQueries({ queryKey: ["google-ads-connection", companyId] });
      } else {
        toast.error(`Errore OAuth: ${data.message ?? "sconosciuto"}`);
      }
      cleanupPopup();
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [cleanupPopup, queryClient, companyId]);

  const handleConnect = useCallback(async () => {
    if (!companyId) return;
    setConnecting(true);
    try {
      const accessToken = await getAccessToken();
      const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || "";
      const res = await fetch(`${supabaseUrl}/functions/v1/google-ads-oauth?action=start`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error ?? "Impossibile avviare OAuth");

      const w = 520, h = 640;
      const left = window.screenX + (window.outerWidth - w) / 2;
      const top = window.screenY + (window.outerHeight - h) / 2;
      popupRef.current = window.open(json.url, "google_ads_oauth", `width=${w},height=${h},left=${left},top=${top}`);
      if (!popupRef.current) throw new Error("Popup bloccato dal browser");

      pollRef.current = window.setInterval(() => {
        if (popupRef.current?.closed) { cleanupPopup(); refetchConnection(); }
      }, POPUP_POLL_INTERVAL_MS);
      maxWaitRef.current = window.setTimeout(cleanupPopup, POPUP_MAX_WAIT_MS);
    } catch (e) {
      toast.error((e as Error).message);
      setConnecting(false);
    }
  }, [companyId, getAccessToken, cleanupPopup, refetchConnection]);

  // ── Select customer ──────────────────────────────────────────────────────
  const selectCustomerMutation = useMutation({
    mutationFn: async () => {
      if (!connection?.id) throw new Error("Connessione non disponibile");
      if (!selectedCustomerId) throw new Error("Seleziona un account Google Ads");
      const accessToken = await getAccessToken();
      const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || "";
      const res = await fetch(`${supabaseUrl}/functions/v1/google-ads-oauth?action=select_customer`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          connection_id: connection.id,
          customer_id: selectedCustomerId,
          manager_customer_id: selectedManagerId || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Errore selezione account");
      return json;
    },
    onSuccess: () => {
      toast.success("Account Google Ads collegato");
      queryClient.invalidateQueries({ queryKey: ["google-ads-connection", companyId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Sync ──────────────────────────────────────────────────────────────────
  const syncMutation = useMutation({
    mutationFn: async () => {
      setSyncing(true);
      const { data, error } = await supabase.functions.invoke("google-ads-sync-campaigns", {
        body: { company_id: companyId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Sync completata: ${data?.campaigns ?? 0} campagne`);
      queryClient.invalidateQueries({ queryKey: ["google-ads-connection", companyId] });
      queryClient.invalidateQueries({ queryKey: ["google-ads-campaigns", companyId] });
      setSyncing(false);
    },
    onError: (e: Error) => {
      toast.error(`Errore sync: ${e.message}`);
      setSyncing(false);
    },
  });

  // ── Disconnect ────────────────────────────────────────────────────────────
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const accessToken = await getAccessToken();
      const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || "";
      const res = await fetch(`${supabaseUrl}/functions/v1/google-ads-oauth?action=disconnect`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Errore disconnessione");
      return json;
    },
    onSuccess: () => {
      toast.success("Google Ads scollegato");
      queryClient.invalidateQueries({ queryKey: ["google-ads-connection", companyId] });
      setDisconnectOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const lastSyncText = useMemo(() => {
    if (!connection?.last_sync_at) return null;
    return new Date(connection.last_sync_at).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
  }, [connection?.last_sync_at]);

  return (
    <>
      <Card className="border-l-4 border-l-[#4285F4]">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                <Megaphone className="h-5 w-5 text-[#4285F4]" />
              </div>
              <div>
                <CardTitle className="text-base">Google Ads</CardTitle>
                <CardDescription>
                  Campagne Search/Display, insights, conversioni offline CRM
                </CardDescription>
              </div>
            </div>
            {isReady ? (
              <Badge className="bg-emerald-600 hover:bg-emerald-600">
                <CheckCircle2 className="mr-1 h-3 w-3" /> Collegato
              </Badge>
            ) : isConnected ? (
              <Badge variant="secondary">
                <AlertTriangle className="mr-1 h-3 w-3" /> Seleziona account
              </Badge>
            ) : (
              <Badge variant="outline">Non collegato</Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {!isConnected && (
            <>
              <p className="text-sm text-muted-foreground">
                Collega Google Ads per importare campagne, insights e ricevere alert su
                anomalie di spesa. Richiede Developer Token Google Ads approvato (config
                lato amministratore).
              </p>
              <Button onClick={handleConnect} disabled={connecting || !companyId} className="w-full">
                {connecting ? "Connessione in corso..." : "Collega Google Ads"}
              </Button>
            </>
          )}

          {isConnected && needsCustomerSelection && (
            <div className="space-y-3">
              <div className="rounded-lg bg-blue-50 p-3 text-sm">
                <p className="font-medium text-blue-900">Account Google collegato</p>
                <p className="text-blue-700 text-xs mt-1">{connection?.google_account_email}</p>
              </div>
              {operationalCustomers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nessun account Google Ads trovato. Verifica che l'utente abbia accesso a
                  un account Ads attivo (non solo Manager Account).
                </p>
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Account Google Ads</label>
                    <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Scegli l'account principale" />
                      </SelectTrigger>
                      <SelectContent>
                        {operationalCustomers.map((c) => (
                          <SelectItem key={c.customer_id} value={c.customer_id}>
                            <div className="flex flex-col">
                              <span className="font-medium">
                                {c.descriptive_name ?? "Senza nome"}
                                {c.is_test_account && <Badge variant="outline" className="ml-2 text-xs">Test</Badge>}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                ID: {c.customer_id} · {c.currency_code ?? ""}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {managerCustomers.length > 0 && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        Manager Account (MCC) <span className="text-muted-foreground">— opzionale</span>
                      </label>
                      <Select
                        value={selectedManagerId || "__none__"}
                        onValueChange={(v) => setSelectedManagerId(v === "__none__" ? "" : v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Nessun MCC (account standalone)" />
                        </SelectTrigger>
                        <SelectContent>
                          {/* Fix 2026-05-27: Radix Select non accetta value="" — sentinel "__none__" + map nel handler. */}
                          <SelectItem value="__none__">Nessun MCC</SelectItem>
                          {managerCustomers.map((c) => (
                            <SelectItem key={c.customer_id} value={c.customer_id}>
                              {c.descriptive_name ?? c.customer_id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <Button
                    onClick={() => selectCustomerMutation.mutate()}
                    disabled={!selectedCustomerId || selectCustomerMutation.isPending}
                    className="w-full"
                  >
                    Conferma selezione
                  </Button>
                </>
              )}
            </div>
          )}

          {isReady && (
            <div className="space-y-3">
              <div className="rounded-lg bg-emerald-50 p-3">
                <p className="text-sm font-medium text-emerald-900">
                  {connection?.customer_descriptive_name ?? "Account Google Ads"}
                </p>
                <p className="text-xs text-emerald-700 mt-0.5">
                  ID: {connection?.customer_id} · {connection?.customer_currency_code ?? ""}
                  {connection?.manager_customer_id && ` · MCC ${connection.manager_customer_id}`}
                </p>
                <p className="text-xs text-emerald-700 mt-1">
                  Account Google: {connection?.google_account_email}
                </p>
              </div>

              {lastSyncText && (
                <p className="text-xs text-muted-foreground">
                  Ultima sync: {lastSyncText} · {connection?.last_sync_campaign_count ?? 0} campagne
                </p>
              )}
              {connection?.last_error && (
                <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
                  <AlertTriangle className="inline h-3 w-3 mr-1" />
                  {connection.last_error}
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  variant="default"
                  onClick={() => syncMutation.mutate()}
                  disabled={syncing}
                  className="flex-1"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
                  Sincronizza campagne
                </Button>
                <Button variant="outline" onClick={() => setDisconnectOpen(true)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Scollegare Google Ads?</AlertDialogTitle>
            <AlertDialogDescription>
              Le campagne già importate restano in EiC ma non riceverai più aggiornamenti da
              Google Ads. Puoi ricollegare in qualsiasi momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnectMutation.isPending}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
            >
              Scollega
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
