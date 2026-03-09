import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Landmark, LayoutDashboard, CreditCard, ArrowLeftRight, Link, RefreshCw, Loader2, ShieldOff } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import TreasuryOverview from "@/components/tesoreria/TreasuryOverview";
import BankAccountsList from "@/components/tesoreria/BankAccountsList";
import TransactionsFeed from "@/components/tesoreria/TransactionsFeed";
import BankConnectionsList from "@/components/tesoreria/BankConnectionsList";

export default function Tesoreria() {
  const { effectiveCompany } = useAuth();
  const [searchParams] = useSearchParams();
  const [syncing, setSyncing] = useState(false);
  const [tesoreriaEnabled, setTesoreriaEnabled] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  const bankCallback = searchParams.get("bank_callback");

  useEffect(() => {
    if (effectiveCompany?.id) {
      checkTesoreriaEnabled();
    }
  }, [effectiveCompany?.id]);

  useEffect(() => {
    if (bankCallback === "1") {
      setActiveTab("connessioni");
    }
  }, [bankCallback]);

  async function checkTesoreriaEnabled() {
    const { data } = await supabase
      .from("companies")
      .select("tesoreria_enabled")
      .eq("id", effectiveCompany!.id)
      .single();
    setTesoreriaEnabled((data as any)?.tesoreria_enabled ?? false);
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

  if (tesoreriaEnabled === null) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!tesoreriaEnabled) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
        <ShieldOff className="h-16 w-16 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Funzionalità non attiva</h2>
        <p className="text-muted-foreground max-w-md">
          Contatta il tuo amministratore di sistema per abilitare il modulo Tesoreria.
        </p>
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
        <TabsList>
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
        </TabsList>

        <TabsContent value="overview">
          <TreasuryOverview companyId={effectiveCompany?.id || ""} />
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
      </Tabs>
    </div>
  );
}
