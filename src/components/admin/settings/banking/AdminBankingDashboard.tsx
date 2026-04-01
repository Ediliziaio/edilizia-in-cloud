import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Landmark, RefreshCw, AlertTriangle, Loader2, Wifi, WifiOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

const formatEur = (val: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(val);

interface CompanyBankingStatus {
  company_id: string;
  company_name: string;
  connections_count: number;
  active_connections: number;
  expired_connections: number;
  accounts_count: number;
  total_balance: number;
  last_sync_at: string | null;
  transactions_count: number;
}

export default function AdminBankingDashboard() {
  const [companies, setCompanies] = useState<CompanyBankingStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);

    // Recupera tutte le company con connessioni bancarie
    const { data: connections } = await supabase
      .from("bank_connections")
      .select(`
        company_id,
        status,
        last_sync_at,
        expires_at,
        accounts_count,
        companies(name)
      `)
      .neq("status", "disconnected");

    if (!connections || connections.length === 0) {
      setCompanies([]);
      setLoading(false);
      return;
    }

    // Aggrega per company
    const companyMap: Record<string, CompanyBankingStatus> = {};

    for (const conn of connections) {
      const cId = conn.company_id;
      if (!companyMap[cId]) {
        companyMap[cId] = {
          company_id: cId,
          company_name: (conn as any).companies?.name || cId,
          connections_count: 0,
          active_connections: 0,
          expired_connections: 0,
          accounts_count: 0,
          total_balance: 0,
          last_sync_at: null,
          transactions_count: 0,
        };
      }
      companyMap[cId].connections_count++;
      if (conn.status === "active") companyMap[cId].active_connections++;
      if (conn.status === "expired") companyMap[cId].expired_connections++;
      companyMap[cId].accounts_count += conn.accounts_count || 0;
      if (conn.last_sync_at && (!companyMap[cId].last_sync_at || conn.last_sync_at > companyMap[cId].last_sync_at!)) {
        companyMap[cId].last_sync_at = conn.last_sync_at;
      }
    }

    // Recupera saldi e conteggio transazioni per ogni company
    const companyIds = Object.keys(companyMap);

    const { data: balances } = await supabase
      .from("bank_accounts")
      .select("company_id, current_balance")
      .in("company_id", companyIds)
      .eq("is_active", true);

    for (const bal of balances || []) {
      if (companyMap[bal.company_id]) {
        companyMap[bal.company_id].total_balance += bal.current_balance || 0;
      }
    }

    const { data: txCounts } = await supabase
      .from("bank_transactions")
      .select("company_id")
      .in("company_id", companyIds);

    // Conta per company
    const txCountMap: Record<string, number> = {};
    for (const tx of txCounts || []) {
      txCountMap[tx.company_id] = (txCountMap[tx.company_id] || 0) + 1;
    }
    for (const cId of companyIds) {
      companyMap[cId].transactions_count = txCountMap[cId] || 0;
    }

    setCompanies(Object.values(companyMap).sort((a, b) => b.total_balance - a.total_balance));
    setLoading(false);
  }

  async function handleSyncAll() {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("bank-sync-all-companies");
      if (error) throw error;
      if (data?.success) {
        toast.success(`Sincronizzate ${data.companies_synced} aziende, ${data.transactions_fetched} transazioni`);
        loadData();
      }
    } catch (e: any) {
      toast.error("Errore: " + e.message);
    }
    setSyncing(false);
  }

  // Aggregati
  const totals = companies.reduce(
    (acc, c) => ({
      companies: acc.companies + 1,
      connections: acc.connections + c.connections_count,
      activeConnections: acc.activeConnections + c.active_connections,
      expiredConnections: acc.expiredConnections + c.expired_connections,
      accounts: acc.accounts + c.accounts_count,
      balance: acc.balance + c.total_balance,
      transactions: acc.transactions + c.transactions_count,
    }),
    { companies: 0, connections: 0, activeConnections: 0, expiredConnections: 0, accounts: 0, balance: 0, transactions: 0 },
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Landmark className="h-5 w-5" /> Dashboard Bancaria
        </h2>
        <Button onClick={handleSyncAll} disabled={syncing} size="sm">
          {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Sync Globale
        </Button>
      </div>

      {/* KPI */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Aziende Collegate</p>
            <p className="text-2xl font-bold">{totals.companies}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Connessioni Attive</p>
            <p className="text-2xl font-bold text-green-600">{totals.activeConnections}</p>
            {totals.expiredConnections > 0 && (
              <p className="text-xs text-red-600 mt-1">{totals.expiredConnections} scadute</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Liquidità Totale</p>
            <p className={`text-2xl font-bold ${totals.balance >= 0 ? "text-green-600" : "text-red-600"}`}>
              {formatEur(totals.balance)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Transazioni Totali</p>
            <p className="text-2xl font-bold">{totals.transactions.toLocaleString("it-IT")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Company Table */}
      {companies.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nessuna azienda con connessioni bancarie
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Azienda</th>
                <th className="text-center p-3 font-medium">Connessioni</th>
                <th className="text-center p-3 font-medium">Conti</th>
                <th className="text-right p-3 font-medium">Liquidità</th>
                <th className="text-center p-3 font-medium">Transazioni</th>
                <th className="text-center p-3 font-medium">Ultimo Sync</th>
                <th className="text-center p-3 font-medium">Stato</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.company_id} className="border-t hover:bg-accent/50">
                  <td className="p-3 font-medium">{c.company_name}</td>
                  <td className="p-3 text-center">{c.connections_count}</td>
                  <td className="p-3 text-center">{c.accounts_count}</td>
                  <td className={`p-3 text-right font-semibold ${c.total_balance >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {formatEur(c.total_balance)}
                  </td>
                  <td className="p-3 text-center">{c.transactions_count.toLocaleString("it-IT")}</td>
                  <td className="p-3 text-center text-xs text-muted-foreground">
                    {c.last_sync_at
                      ? formatDistanceToNow(new Date(c.last_sync_at), { addSuffix: true, locale: it })
                      : "Mai"}
                  </td>
                  <td className="p-3 text-center">
                    {c.expired_connections > 0 ? (
                      <Badge variant="destructive" className="gap-1">
                        <AlertTriangle className="h-3 w-3" /> {c.expired_connections} scadute
                      </Badge>
                    ) : c.active_connections > 0 ? (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 gap-1" variant="secondary">
                        <Wifi className="h-3 w-3" /> Attivo
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1">
                        <WifiOff className="h-3 w-3" /> Inattivo
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
