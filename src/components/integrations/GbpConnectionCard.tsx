/**
 * GbpConnectionCard — Google Business Profile (Google My Business) connection UI
 *
 * Triggers OAuth popup (gbp-oauth?action=start), receives postMessage callback,
 * lets the user pick a location (if multiple), supports manual review sync
 * and disconnect.
 *
 * Wired in ReputationManager.tsx → tab "integrazioni" → al posto della card
 * generica "Google Business Profile" precedente.
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CheckCircle2, AlertTriangle, RefreshCw, Trash2, Star, Building2 } from "lucide-react";

type GbpConnection = {
  id: string;
  google_account_email: string | null;
  status: string;
  gbp_account_id: string | null;
  gbp_location_id: string | null;
  gbp_location_name: string | null;
  gbp_location_address: string | null;
  last_sync_at: string | null;
  last_sync_review_count: number | null;
  last_error: string | null;
};

type GbpLocation = {
  gbp_account_id: string;
  gbp_location_id: string;
  display_name: string | null;
  address: string | null;
  primary_phone: string | null;
};

const POPUP_POLL_INTERVAL_MS = 800;
const POPUP_MAX_WAIT_MS = 5 * 60_000;

export default function GbpConnectionCard() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const popupRef = useRef<Window | null>(null);
  const pollRef = useRef<number | null>(null);
  const maxWaitRef = useRef<number | null>(null);

  const getAccessToken = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Sessione scaduta");
    return session.access_token;
  }, []);

  // ── Query: connection state ───────────────────────────────────────────────
  // 2026-05-27: staleTime=0 + refetchOnWindowFocus="always" — quando l'utente
  // torna sulla finestra parent dopo aver chiuso il popup OAuth, la card si
  // aggiorna immediatamente. Senza questi, la query restava su valore stale
  // (default 5min) e l'utente vedeva "Non collegato" anche dopo OAuth completato.
  const { data: connection, refetch: refetchConnection } = useQuery({
    queryKey: ["gbp-connection", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from("gbp_connections")
        .select("id, google_account_email, status, gbp_account_id, gbp_location_id, gbp_location_name, gbp_location_address, last_sync_at, last_sync_review_count, last_error")
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      return data as GbpConnection | null;
    },
    enabled: !!companyId,
    staleTime: 0,
    refetchOnWindowFocus: "always",
  });

  const isConnected = connection?.status === "connected";
  const hasLocation = isConnected && !!connection?.gbp_location_id;

  // ── Query: locations cache (solo se manca la selezione) ───────────────────
  const { data: locations = [] } = useQuery({
    queryKey: ["gbp-locations-cache", connection?.id],
    queryFn: async () => {
      if (!connection?.id) return [];
      const { data, error } = await supabase
        .from("gbp_locations_cache")
        .select("gbp_account_id, gbp_location_id, display_name, address, primary_phone")
        .eq("connection_id", connection.id);
      if (error) throw error;
      return (data ?? []) as GbpLocation[];
    },
    enabled: isConnected && !hasLocation,
  });

  // ── OAuth popup flow ──────────────────────────────────────────────────────
  const cleanupPopup = useCallback(() => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (maxWaitRef.current) {
      window.clearTimeout(maxWaitRef.current);
      maxWaitRef.current = null;
    }
    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.close();
    }
    popupRef.current = null;
    setConnecting(false);
  }, []);

  useEffect(() => () => cleanupPopup(), [cleanupPopup]);

  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      const data = ev.data;
      if (!data || data.source !== "gbp-oauth") return;
      if (data.status === "ok") {
        toast.success("Google Business Profile collegato");
        queryClient.invalidateQueries({ queryKey: ["gbp-connection", companyId] });
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
      const fnUrl = `${supabaseUrl}/functions/v1/gbp-oauth?action=start`;
      const res = await fetch(fnUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error ?? "Impossibile avviare OAuth");

      const w = 520, h = 640;
      const left = window.screenX + (window.outerWidth - w) / 2;
      const top = window.screenY + (window.outerHeight - h) / 2;
      popupRef.current = window.open(json.url, "gbp_oauth", `width=${w},height=${h},left=${left},top=${top}`);
      if (!popupRef.current) throw new Error("Popup bloccato dal browser");

      // Polling closure (in caso l'utente chiuda senza completare)
      pollRef.current = window.setInterval(() => {
        if (popupRef.current?.closed) {
          cleanupPopup();
          refetchConnection(); // forza un ricontrollo
        }
      }, POPUP_POLL_INTERVAL_MS);
      maxWaitRef.current = window.setTimeout(cleanupPopup, POPUP_MAX_WAIT_MS);
    } catch (e) {
      toast.error((e as Error).message);
      setConnecting(false);
    }
  }, [companyId, getAccessToken, cleanupPopup, refetchConnection]);

  // ── Select location ───────────────────────────────────────────────────────
  const selectLocationMutation = useMutation({
    mutationFn: async () => {
      if (!connection?.id) throw new Error("Connessione non disponibile");
      const chosen = locations.find((l) => l.gbp_location_id === selectedLocationId);
      if (!chosen) throw new Error("Seleziona una location");
      const accessToken = await getAccessToken();
      const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || "";
      const res = await fetch(`${supabaseUrl}/functions/v1/gbp-oauth?action=select_location`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          connection_id: connection.id,
          gbp_account_id: chosen.gbp_account_id,
          gbp_location_id: chosen.gbp_location_id,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Errore selezione location");
      return json;
    },
    onSuccess: () => {
      toast.success("Location selezionata");
      queryClient.invalidateQueries({ queryKey: ["gbp-connection", companyId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Sync reviews ──────────────────────────────────────────────────────────
  const syncMutation = useMutation({
    mutationFn: async () => {
      setSyncing(true);
      const { data, error } = await supabase.functions.invoke("gbp-sync-reviews", {
        body: { company_id: companyId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Sincronizzazione completata: ${data?.synced ?? 0} recensioni`);
      queryClient.invalidateQueries({ queryKey: ["gbp-connection", companyId] });
      queryClient.invalidateQueries({ queryKey: ["gbp-reviews", companyId] });
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
      const res = await fetch(`${supabaseUrl}/functions/v1/gbp-oauth?action=disconnect`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Errore disconnessione");
      return json;
    },
    onSuccess: () => {
      toast.success("Google Business Profile scollegato");
      queryClient.invalidateQueries({ queryKey: ["gbp-connection", companyId] });
      setDisconnectOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const lastSyncText = useMemo(() => {
    if (!connection?.last_sync_at) return null;
    const d = new Date(connection.last_sync_at);
    return d.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
  }, [connection?.last_sync_at]);

  return (
    <>
      <Card className="border-l-4 border-l-[#4285F4]">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                <Star className="h-5 w-5 text-[#4285F4]" />
              </div>
              <div>
                <CardTitle className="text-base">Google Business Profile</CardTitle>
                <CardDescription>
                  Recensioni Google, scheda locale, alert nuove recensioni
                </CardDescription>
              </div>
            </div>
            {hasLocation ? (
              <Badge className="bg-emerald-600 hover:bg-emerald-600">
                <CheckCircle2 className="mr-1 h-3 w-3" /> Collegato
              </Badge>
            ) : isConnected ? (
              <Badge variant="secondary">
                <AlertTriangle className="mr-1 h-3 w-3" /> Seleziona location
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
                Collega la scheda Google della tua impresa per importare automaticamente le
                recensioni, ricevere alert su nuove valutazioni e rispondere direttamente da qui.
              </p>
              <Button onClick={handleConnect} disabled={connecting || !companyId} className="w-full">
                {connecting ? "Connessione in corso..." : "Collega Google Business Profile"}
              </Button>
            </>
          )}

          {isConnected && !hasLocation && (
            <div className="space-y-3">
              <div className="rounded-lg bg-blue-50 p-3 text-sm">
                <p className="font-medium text-blue-900">Account Google collegato</p>
                <p className="text-blue-700 text-xs mt-1">{connection?.google_account_email}</p>
              </div>
              {locations.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nessuna scheda Google Business trovata. Verifica di averne una verificata su
                  business.google.com con lo stesso account.
                </p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Trovate {locations.length} schede. Seleziona quale collegare:
                  </p>
                  <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Scegli la scheda Google Business" />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map((loc) => (
                        <SelectItem key={loc.gbp_location_id} value={loc.gbp_location_id}>
                          <div className="flex flex-col">
                            <span className="font-medium">{loc.display_name ?? "Senza nome"}</span>
                            {loc.address && (
                              <span className="text-xs text-muted-foreground">{loc.address}</span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={() => selectLocationMutation.mutate()}
                    disabled={!selectedLocationId || selectLocationMutation.isPending}
                    className="w-full"
                  >
                    Conferma selezione
                  </Button>
                </>
              )}
            </div>
          )}

          {hasLocation && (
            <div className="space-y-3">
              <div className="rounded-lg bg-emerald-50 p-3">
                <div className="flex items-start gap-2">
                  <Building2 className="h-4 w-4 text-emerald-700 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-emerald-900">
                      {connection?.gbp_location_name ?? "Scheda collegata"}
                    </p>
                    {connection?.gbp_location_address && (
                      <p className="text-xs text-emerald-700 mt-0.5">
                        {connection.gbp_location_address}
                      </p>
                    )}
                    <p className="text-xs text-emerald-700 mt-1">
                      Account: {connection?.google_account_email}
                    </p>
                  </div>
                </div>
              </div>

              {lastSyncText && (
                <p className="text-xs text-muted-foreground">
                  Ultima sincronizzazione: {lastSyncText} ·{" "}
                  {connection?.last_sync_review_count ?? 0} recensioni
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
                  Sincronizza ora
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
            <AlertDialogTitle>Scollegare Google Business Profile?</AlertDialogTitle>
            <AlertDialogDescription>
              Le recensioni già importate restano in EiC, ma non riceverai più nuovi aggiornamenti
              da Google. Puoi ricollegare in qualsiasi momento.
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
