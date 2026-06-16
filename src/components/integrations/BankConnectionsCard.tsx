/**
 * BankConnectionsCard — Open Banking (Enable Banking) per l'azienda.
 * Collega un conto corrente (consenso PSD2) e importa i movimenti per la
 * riconciliazione. Tutto passa dall'edge function sicura `bank-eb`.
 *
 * Flusso consenso: "Collega conto" → scegli banca → start-auth → redirect alla
 * banca → l'utente autorizza → ritorna su questa pagina con ?code=&state= →
 * finalize + sync automatici.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/formatters";
import { toast } from "sonner";
import { Landmark, Plus, RefreshCw, Loader2, CheckCircle2 } from "lucide-react";

interface BankConnection {
  id: string;
  institution_name: string | null;
  status: string | null;
  accounts_count: number | null;
  last_sync_at: string | null;
  expires_at: string | null;
}
interface BankAccount {
  id: string;
  connection_id: string | null;
  account_name: string | null;
  iban: string | null;
  currency: string | null;
  current_balance: number | null;
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  created: { label: "In attesa di consenso", cls: "bg-amber-100 text-amber-700" },
  linked: { label: "Collegato", cls: "bg-emerald-100 text-emerald-700" },
  expired: { label: "Scaduto — ricollega", cls: "bg-rose-100 text-rose-700" },
  error: { label: "Errore", cls: "bg-rose-100 text-rose-700" },
};

interface BankConnectionsCardProps {
  /** Path su cui Enable Banking reindirizza dopo il consenso (deve essere registrato come Allowed redirect URL). */
  redirectPath?: string;
  /** Chiamato dopo un collegamento/sync riuscito, per far aggiornare la pagina che ospita la card. */
  onChanged?: () => void;
}

export default function BankConnectionsCard({
  redirectPath = "/azienda/impostazioni/integrazioni",
  onChanged,
}: BankConnectionsCardProps = {}) {
  const companyId = useEffectiveCompanyId();
  const { canViewTesoreria, isLoading: permsLoading } = usePermissions();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [aspsps, setAspsps] = useState<Array<{ name: string; logo?: string }>>([]);
  const [loadingAspsps, setLoadingAspsps] = useState(false);
  const [selectedBank, setSelectedBank] = useState<string>("");
  const [connecting, setConnecting] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const finalizingRef = useRef(false);

  const { data: connections = [] } = useQuery({
    queryKey: ["bank-connections", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_connections")
        .select("id, institution_name, status, accounts_count, last_sync_at, expires_at")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BankConnection[];
    },
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["bank-accounts", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("id, connection_id, account_name, iban, currency, current_balance")
        .eq("company_id", companyId!)
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as BankAccount[];
    },
  });

  // ── Callback dal consenso bancario: ?code=&state= ─────────────────────────
  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const errParam = searchParams.get("error");
    if (errParam) {
      toast.error("Consenso non concesso o annullato.");
      const next = new URLSearchParams(searchParams);
      next.delete("error"); next.delete("state");
      setSearchParams(next, { replace: true });
      return;
    }
    if (!code || finalizingRef.current) return;
    finalizingRef.current = true;
    (async () => {
      const t = toast.loading("Collegamento conto in corso…");
      try {
        const { data, error } = await supabase.functions.invoke("bank-eb", { body: { action: "finalize", code, state } });
        if (error || (data && data.error)) throw new Error((data && data.error) || error?.message || "Errore");
        // sync movimenti subito dopo
        if (data?.connection_id) {
          await supabase.functions.invoke("bank-eb", { body: { action: "sync", connection_id: data.connection_id } });
        }
        toast.success("Conto collegato e movimenti importati", { id: t });
        qc.invalidateQueries({ queryKey: ["bank-connections", companyId] });
        qc.invalidateQueries({ queryKey: ["bank-accounts", companyId] });
        onChanged?.();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Errore nel collegamento", { id: t });
      } finally {
        const next = new URLSearchParams(searchParams);
        next.delete("code"); next.delete("state");
        setSearchParams(next, { replace: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const openConnect = async () => {
    setOpen(true);
    setSelectedBank("");
    setLoadingAspsps(true);
    try {
      const { data, error } = await supabase.functions.invoke("bank-eb", { body: { action: "list-aspsps" } });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      setAspsps(data.aspsps ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossibile caricare le banche");
    } finally {
      setLoadingAspsps(false);
    }
  };

  const startConnect = async () => {
    if (!selectedBank) return;
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("bank-eb", { body: { action: "start-auth", aspsp_name: selectedBank, redirect_path: redirectPath } });
      if (error || data?.error || !data?.url) throw new Error(data?.error || error?.message || "Errore");
      window.location.href = data.url; // redirect al consenso banca
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore avvio collegamento");
      setConnecting(false);
    }
  };

  const syncNow = async (connectionId: string) => {
    setSyncingId(connectionId);
    const t = toast.loading("Sincronizzazione movimenti…");
    try {
      const { data, error } = await supabase.functions.invoke("bank-eb", { body: { action: "sync", connection_id: connectionId } });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      toast.success(`Importati ${data?.imported ?? 0} movimenti`, { id: t });
      qc.invalidateQueries({ queryKey: ["bank-connections", companyId] });
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore sincronizzazione", { id: t });
    } finally {
      setSyncingId(null);
    }
  };

  // Sicurezza: solo admin o utenti col permesso Tesoreria possono vedere/gestire
  // i conti bancari. La RLS + l'edge function bank-eb applicano lo stesso vincolo
  // lato server; qui nascondiamo la card a chi non è autorizzato.
  if (permsLoading) return null;
  if (!canViewTesoreria) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Landmark className="h-4 w-4 text-blue-600" />
          Conti bancari <span className="text-xs font-normal text-muted-foreground">(Open Banking)</span>
        </CardTitle>
        <Button size="sm" onClick={openConnect}>
          <Plus className="h-4 w-4 mr-1" /> Collega conto
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {connections.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Collega il conto corrente dell'azienda per importare i movimenti e riconciliarli con fatture e costi.
          </p>
        ) : (
          connections.map((c) => {
            const st = STATUS_LABEL[c.status ?? ""] ?? { label: c.status ?? "—", cls: "bg-muted text-muted-foreground" };
            const accs = accounts.filter((a) => a.connection_id === c.id);
            return (
              <div key={c.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{c.institution_name ?? "Banca"}</span>
                    <Badge className={`text-[10px] px-1.5 py-0 border-0 ${st.cls}`}>{st.label}</Badge>
                  </div>
                  {c.status === "linked" && (
                    <Button size="sm" variant="outline" onClick={() => syncNow(c.id)} disabled={syncingId === c.id}>
                      {syncingId === c.id ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                      Sincronizza
                    </Button>
                  )}
                </div>
                {accs.length > 0 && (
                  <div className="space-y-1">
                    {accs.map((a) => (
                      <div key={a.id} className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                          {a.account_name || a.iban || "Conto"}
                        </span>
                        {a.current_balance != null && (
                          <span className="tabular-nums">{formatCurrency(Number(a.current_balance))}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {c.last_sync_at && (
                  <p className="text-[10px] text-muted-foreground">Ultimo sync: {new Date(c.last_sync_at).toLocaleString("it-IT")}</p>
                )}
              </div>
            );
          })
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Collega un conto bancario</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Scegli la banca: verrai reindirizzato al sito della banca per autorizzare la sola lettura dei movimenti (consenso PSD2, valido 90 giorni).
            </p>
            {loadingAspsps ? (
              <div className="flex items-center justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : (
              <Select value={selectedBank} onValueChange={setSelectedBank}>
                <SelectTrigger><SelectValue placeholder="Seleziona la banca…" /></SelectTrigger>
                <SelectContent>
                  {aspsps.map((b) => (
                    <SelectItem key={b.name} value={b.name}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annulla</Button>
            <Button onClick={startConnect} disabled={!selectedBank || connecting}>
              {connecting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Continua sul sito della banca
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
