import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Landmark, LayoutDashboard, CreditCard, ArrowLeftRight, Link, Link2, RefreshCw, Loader2, TrendingUp, Settings, Receipt } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import TreasuryOverview from "@/components/tesoreria/TreasuryOverview";
import BankAccountsList from "@/components/tesoreria/BankAccountsList";
import TransactionsFeed from "@/components/tesoreria/TransactionsFeed";
import BankConnectionsList from "@/components/tesoreria/BankConnectionsList";
import BankReconciliation from "@/components/tesoreria/BankReconciliation";
import CashFlowForecast from "@/components/tesoreria/CashFlowForecast";
import BankAlertRules from "@/components/tesoreria/BankAlertRules";
import CategorizationRules from "@/components/tesoreria/CategorizationRules";
import ExpenseReports from "@/components/tesoreria/ExpenseReports";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { UpgradeScopriWall } from "@/components/subscription/UpgradeScopriBanner";

const TREASURY_TABS = new Set([
  "overview",
  "conti",
  "transazioni",
  "connessioni",
  "riconciliazione",
  "previsioni",
  "note-spese",
  "impostazioni",
]);

function getSafeTab(searchParams: URLSearchParams) {
  const requested = searchParams.get("tab");
  return requested && TREASURY_TABS.has(requested) ? requested : "overview";
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Errore sconosciuto";
}

export default function Tesoreria() {
  const { effectiveCompany } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState(() => getSafeTab(searchParams));
  const [refreshKey, setRefreshKey] = useState(0);
  const { isScopriPlan } = useSubscriptionLimits();
  const [hasConnections, setHasConnections] = useState<boolean | null>(null);

  const bankCallback = searchParams.get("bank_callback");

  const handleTabChange = useCallback((value: string) => {
    if (!TREASURY_TABS.has(value)) return;
    setActiveTab(value);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === "overview") next.delete("tab");
      else next.set("tab", value);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const checkConnections = useCallback(async () => {
    if (!effectiveCompany?.id) {
      setHasConnections(false);
      return;
    }

    const { count, error } = await supabase
      .from("bank_connections")
      .select("id", { count: "exact", head: true })
      .eq("company_id", effectiveCompany.id)
      .neq("status", "disconnected");

    if (error) {
      toast.error("Impossibile verificare le connessioni bancarie", { description: error.message });
      setHasConnections(false);
      return;
    }

    setHasConnections((count ?? 0) > 0);
  }, [effectiveCompany?.id]);

  const handleConnectionChanged = useCallback(async () => {
    await checkConnections();
    setRefreshKey((value) => value + 1);
  }, [checkConnections]);

  useEffect(() => {
    if (effectiveCompany?.id) {
      void checkConnections();
    } else {
      // No company context: show onboarding after brief delay
      const t = setTimeout(() => setHasConnections(false), 2000);
      return () => clearTimeout(t);
    }
  }, [effectiveCompany?.id, checkConnections]);

  useEffect(() => {
    const safeTab = getSafeTab(searchParams);
    setActiveTab((current) => (current === safeTab ? current : safeTab));
  }, [searchParams]);

  useEffect(() => {
    if (bankCallback !== "1") return;
    handleTabChange("connessioni");
    void handleConnectionChanged();
  }, [bankCallback, handleConnectionChanged, handleTabChange]);

  async function handleSync() {
    if (!effectiveCompany?.id) {
      toast.error("Azienda non disponibile");
      return;
    }

    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("bank-sync", {
        body: { company_id: effectiveCompany.id },
      });
      if (error) {
        let errBody: { error?: string; message?: string } | null = null;
        try {
          const ctx = (error as { context?: unknown }).context;
          if (ctx instanceof Response) errBody = await ctx.json();
        } catch {
          errBody = null;
        }
        throw new Error(errBody?.error ?? errBody?.message ?? error.message ?? "Errore");
      }
      if (data?.success) {
        toast.success(`Sincronizzati ${data.accounts_synced} conti, ${data.transactions_fetched} transazioni`);
        await handleConnectionChanged();
      } else {
        toast.error("Sincronizzazione fallita");
      }
    } catch (e: unknown) {
      toast.error("Errore: " + getErrorMessage(e));
    } finally {
      setSyncing(false);
    }
  }

  if (isScopriPlan) return <UpgradeScopriWall type="banca_psd2" inline />;

  // 2026-05-27 (UX audit): se manca effectiveCompany?.id, prima si vedeva
  // uno spinner finto da 2 secondi (setTimeout) → poi se ne andava sull'empty
  // state con companyId="" → 8 query Supabase fallivano silenziosamente.
  // Gate esplicito: niente company, niente render.
  if (!effectiveCompany?.id) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
        Seleziona un'azienda per visualizzare la tesoreria.
      </div>
    );
  }

  if (hasConnections === null) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!hasConnections) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/40 px-4 py-5 shadow-sm sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-[0_4px_12px_rgba(249,115,22,0.3)]">
              <Landmark className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold leading-tight tracking-tight text-slate-900 sm:text-2xl">Tesoreria</h1>
              <p className="mt-0.5 text-sm text-slate-500">Gestisci conti bancari e monitora il cash flow in tempo reale.</p>
            </div>
          </div>
        </div>
        {activeTab !== "connessioni" && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-muted-foreground/30 bg-muted/20 py-20 gap-5 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Landmark className="h-8 w-8 text-primary" />
            </div>
            <div className="space-y-2 max-w-md">
              <h2 className="text-xl font-semibold">Collega il tuo conto bancario</h2>
              <p className="text-muted-foreground text-sm">
                Connetti il tuo conto tramite Open Banking (PSD2) per visualizzare saldi, transazioni e riconciliare automaticamente i movimenti.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center text-xs text-muted-foreground">
              <Badge variant="outline">Open Banking · PSD2</Badge>
              <Badge variant="outline">Sicuro e crittografato</Badge>
              <Badge variant="outline">Aggiornamento automatico</Badge>
            </div>
            <Button onClick={() => handleTabChange("connessioni")} className="mt-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm hover:from-orange-600 hover:to-amber-600">
              <Link className="h-4 w-4 mr-2" />
              Collega primo conto
            </Button>
          </div>
        )}
        {activeTab === "connessioni" && (
          <div className="space-y-4">
            <Button variant="ghost" size="sm" onClick={() => handleTabChange("overview")}>
              Torna alla panoramica
            </Button>
            <BankConnectionsList
              companyId={effectiveCompany?.id || ""}
              hasPendingCallback={bankCallback === "1"}
              onConnectionChanged={handleConnectionChanged}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/40 px-4 py-5 shadow-sm sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-[0_4px_12px_rgba(249,115,22,0.3)]">
              <Landmark className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold leading-tight tracking-tight text-slate-900 sm:text-2xl">Tesoreria</h1>
              <p className="mt-0.5 text-sm text-slate-500">
                Gestisci conti bancari e monitora il cash flow in tempo reale.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-xs">Open Banking · PSD2</Badge>
            <Button onClick={handleSync} disabled={syncing} size="sm" className="bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm hover:from-orange-600 hover:to-amber-600">
              {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Sincronizza
            </Button>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          <TabsTrigger value="overview" className="gap-2">
            <LayoutDashboard className="h-4 w-4" /> Overview
          </TabsTrigger>
          <TabsTrigger value="conti" className="gap-2">
            <CreditCard className="h-4 w-4" /> Conti
          </TabsTrigger>
          <TabsTrigger value="transazioni" className="gap-2">
            <ArrowLeftRight className="h-4 w-4" /> Transazioni
          </TabsTrigger>
          <TabsTrigger value="connessioni" className="gap-2">
            <Link className="h-4 w-4" /> Connessioni
          </TabsTrigger>
          <TabsTrigger value="riconciliazione" className="gap-2">
            <Link2 className="h-4 w-4" /> Riconciliazione
          </TabsTrigger>
          <TabsTrigger value="previsioni" className="gap-2">
            <TrendingUp className="h-4 w-4" /> Previsioni
          </TabsTrigger>
          <TabsTrigger value="note-spese" className="gap-2">
            <Receipt className="h-4 w-4" /> Note Spese
          </TabsTrigger>
          <TabsTrigger value="impostazioni" className="gap-2">
            <Settings className="h-4 w-4" /> Impostazioni
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <TreasuryOverview companyId={effectiveCompany?.id || ""} refreshKey={refreshKey} onNavigateToTransactions={() => handleTabChange("transazioni")} />
        </TabsContent>
        <TabsContent value="conti">
          <BankAccountsList companyId={effectiveCompany?.id || ""} refreshKey={refreshKey} />
        </TabsContent>
        <TabsContent value="transazioni">
          <TransactionsFeed companyId={effectiveCompany?.id || ""} refreshKey={refreshKey} />
        </TabsContent>
        <TabsContent value="connessioni">
          <BankConnectionsList
            companyId={effectiveCompany?.id || ""}
            hasPendingCallback={bankCallback === "1"}
            onConnectionChanged={handleConnectionChanged}
          />
        </TabsContent>
        <TabsContent value="riconciliazione">
          <BankReconciliation companyId={effectiveCompany?.id || ""} refreshKey={refreshKey} />
        </TabsContent>
        <TabsContent value="previsioni">
          <CashFlowForecast companyId={effectiveCompany?.id || ""} refreshKey={refreshKey} />
        </TabsContent>
        <TabsContent value="note-spese">
          <ExpenseReports companyId={effectiveCompany?.id || ""} refreshKey={refreshKey} />
        </TabsContent>
        <TabsContent value="impostazioni">
          <div className="space-y-8">
            <BankAlertRules companyId={effectiveCompany?.id || ""} />
            <CategorizationRules companyId={effectiveCompany?.id || ""} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
