import { useState, useEffect } from "react";
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

export default function Tesoreria() {
  const { effectiveCompany } = useAuth();
  const [searchParams] = useSearchParams();
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [hasConnections, setHasConnections] = useState<boolean | null>(null);

  const bankCallback = searchParams.get("bank_callback");

  useEffect(() => {
    if (effectiveCompany?.id) {
      checkConnections();
    } else {
      // No company context: show onboarding after brief delay
      const t = setTimeout(() => setHasConnections(false), 2000);
      return () => clearTimeout(t);
    }
  }, [effectiveCompany?.id]);

  useEffect(() => {
    if (bankCallback === "1") {
      setActiveTab("connessioni");
      setHasConnections(true);
    }
  }, [bankCallback]);

  async function checkConnections() {
    const { count } = await supabase
      .from("bank_connections")
      .select("id", { count: "exact", head: true })
      .eq("company_id", effectiveCompany!.id);
    setHasConnections((count ?? 0) > 0);
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("bank-sync", {
        body: { company_id: effectiveCompany?.id },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success(`Sincronizzati ${data.accounts_synced} conti, ${data.transactions_fetched} transazioni`);
      } else {
        toast.error("Sincronizzazione fallita");
      }
    } catch (e: any) {
      toast.error("Errore: " + e.message);
    }
    setSyncing(false);
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
        <div className="flex items-center gap-3">
          <Landmark className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Tesoreria</h1>
            <p className="text-muted-foreground text-sm">Gestisci i tuoi conti bancari e monitora il cash flow in tempo reale</p>
          </div>
        </div>
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
          <Button onClick={() => setActiveTab("connessioni")} className="mt-2">
            <Link className="h-4 w-4 mr-2" />
            Collega primo conto
          </Button>
        </div>
        {/* Render connections tab hidden so the user can complete the flow */}
        <div className={activeTab === "connessioni" ? "" : "hidden"}>
          <BankConnectionsList
            companyId={effectiveCompany?.id || ""}
            hasPendingCallback={bankCallback === "1"}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Landmark className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Tesoreria</h1>
            <p className="text-muted-foreground text-sm">
              Gestisci i tuoi conti bancari e monitora il cash flow in tempo reale
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-xs">Open Banking · PSD2</Badge>
          <Button onClick={handleSync} disabled={syncing} size="sm">
            {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Sincronizza
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="flex flex-wrap h-auto gap-1 p-1 w-full justify-start">
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
          <TreasuryOverview companyId={effectiveCompany?.id || ""} onNavigateToTransactions={() => setActiveTab("transazioni")} />
        </TabsContent>
        <TabsContent value="conti">
          <BankAccountsList companyId={effectiveCompany?.id || ""} />
        </TabsContent>
        <TabsContent value="transazioni">
          <TransactionsFeed companyId={effectiveCompany?.id || ""} />
        </TabsContent>
        <TabsContent value="connessioni">
          <BankConnectionsList
            companyId={effectiveCompany?.id || ""}
            hasPendingCallback={bankCallback === "1"}
          />
        </TabsContent>
        <TabsContent value="riconciliazione">
          <BankReconciliation companyId={effectiveCompany?.id || ""} />
        </TabsContent>
        <TabsContent value="previsioni">
          <CashFlowForecast companyId={effectiveCompany?.id || ""} />
        </TabsContent>
        <TabsContent value="note-spese">
          <ExpenseReports companyId={effectiveCompany?.id || ""} />
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
