import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { CreditUsageBar } from "@/modules/ai-agents/components/CreditUsageBar";
import { formatEur } from "@/modules/ai-agents/lib/creditCalculator";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Mail, Bot, MessageSquare, Wallet, ArrowUpRight, ArrowDownRight, Clock, CreditCard, Zap, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";

interface WalletData {
  type: "email" | "ai" | "whatsapp";
  label: string;
  icon: React.ReactNode;
  balance: number;
  spent: number;
  recharged: number;
  blocked: boolean;
}

interface CreditLogEntry {
  id: string;
  type: string;
  amount_eur: number;
  balance_before: number;
  balance_after: number;
  description: string | null;
  campaign_id: string | null;
  created_at: string;
}

const PACKAGES = [
  { amount: 10, label: "€10", emails: "~" },
  { amount: 25, label: "€25", emails: "~" },
  { amount: 50, label: "€50", emails: "~" },
  { amount: 100, label: "€100", emails: "~" },
];

export default function SettingsCredits() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const [activeTab, setActiveTab] = useState("riepilogo");
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();

  // Toast on payment success/cancel
  useEffect(() => {
    const payment = searchParams.get("payment");
    if (payment === "success") {
      toast.success("Pagamento completato! I crediti verranno accreditati a breve.");
    } else if (payment === "cancelled") {
      toast.info("Pagamento annullato.");
    }
  }, [searchParams]);

  // Fetch email credits
  const { data: emailCredits, isLoading: emailLoading } = useQuery({
    queryKey: ["email-credits", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from("email_credits")
        .select("*")
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Fetch AI credits
  const { data: aiCredits, isLoading: aiLoading } = useQuery({
    queryKey: ["ai-credits-settings", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from("ai_credits" as never)
        .select("*")
        .eq("company_id" as never, companyId as never)
        .maybeSingle();
      if (error) throw error;
      return data as { balance_eur: number; total_spent_eur: number; total_recharged_eur: number; calls_blocked: boolean } | null;
    },
    enabled: !!companyId,
  });

  // Fetch WhatsApp credits
  const { data: waCredits, isLoading: waLoading } = useQuery({
    queryKey: ["wa-credits-settings", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from("whatsapp_credits" as never)
        .select("*")
        .eq("company_id" as never, companyId as never)
        .maybeSingle();
      if (error) throw error;
      return data as { balance_eur: number; total_spent_eur: number; total_recharged_eur: number; sends_blocked: boolean } | null;
    },
    enabled: !!companyId,
  });

  // Fetch email credits log
  const { data: emailLog, isLoading: logLoading } = useQuery({
    queryKey: ["email-credits-log", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("email_credits_log")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as CreditLogEntry[];
    },
    enabled: !!companyId,
  });

  // Fetch price per email from platform_settings
  const { data: pricePerEmail } = useQuery({
    queryKey: ["email-price-per-email"],
    queryFn: async () => {
      const { data } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", "credits_email_price_per_email")
        .maybeSingle();
      return parseFloat(data?.value || "0.003");
    },
  });

  // Fetch auto-topup config
  const { data: autoTopup } = useQuery({
    queryKey: ["auto-topup-config", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from("company_auto_topup")
        .select("*")
        .eq("company_id", companyId)
        .eq("wallet_type", "email")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Auto topup state
  const [topupEnabled, setTopupEnabled] = useState(false);
  const [topupThreshold, setTopupThreshold] = useState("5");
  const [topupAmount, setTopupAmount] = useState("25");

  useEffect(() => {
    if (autoTopup) {
      setTopupEnabled(autoTopup.enabled);
      setTopupThreshold(String(autoTopup.threshold_eur));
      setTopupAmount(String(autoTopup.topup_amount_eur));
    }
  }, [autoTopup]);

  // Save auto topup
  const saveTopupMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("No company");
      const payload = {
        company_id: companyId,
        wallet_type: "email",
        enabled: topupEnabled,
        threshold_eur: parseFloat(topupThreshold) || 5,
        topup_amount_eur: parseFloat(topupAmount) || 25,
      };
      const { error } = await supabase
        .from("company_auto_topup")
        .upsert(payload, { onConflict: "company_id,wallet_type" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configurazione auto top-up salvata");
      queryClient.invalidateQueries({ queryKey: ["auto-topup-config", companyId] });
    },
    onError: (e) => toast.error("Errore: " + e.message),
  });

  // Purchase credits
  const [purchaseLoading, setPurchaseLoading] = useState<number | null>(null);
  const handlePurchase = async (amount: number) => {
    if (!companyId) return;
    setPurchaseLoading(amount);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout-session", {
        body: { company_id: companyId, type: "email_credits", amount_eur: amount },
      });
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      } else {
        toast.error(data?.error || "Errore nella creazione della sessione di pagamento");
      }
    } catch (e: any) {
      toast.error(e.message || "Errore");
    } finally {
      setPurchaseLoading(null);
    }
  };

  const isLoading = emailLoading || aiLoading;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  const wallets: WalletData[] = [
    {
      type: "email",
      label: "Email Marketing",
      icon: <Mail className="h-5 w-5" />,
      balance: emailCredits?.balance_eur ?? 0,
      spent: emailCredits?.total_spent_eur ?? 0,
      recharged: emailCredits?.total_recharged_eur ?? 0,
      blocked: emailCredits?.sends_blocked ?? false,
    },
    {
      type: "ai",
      label: "Agenti AI",
      icon: <Bot className="h-5 w-5" />,
      balance: aiCredits?.balance_eur ?? 0,
      spent: aiCredits?.total_spent_eur ?? 0,
      recharged: aiCredits?.total_recharged_eur ?? 0,
      blocked: aiCredits?.calls_blocked ?? false,
    },
    {
      type: "whatsapp",
      label: "WhatsApp",
      icon: <MessageSquare className="h-5 w-5" />,
      balance: 0,
      spent: 0,
      recharged: 0,
      blocked: false,
    },
  ];

  const totalBalance = wallets.reduce((s, w) => s + w.balance, 0);
  const hasBlocked = wallets.some((w) => w.blocked);
  const emailsPerEur = pricePerEmail ? Math.floor(1 / pricePerEmail) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Crediti & Saldo</h1>
        <p className="text-muted-foreground">Riepilogo dei saldi per email, AI e WhatsApp</p>
      </div>

      {hasBlocked && (
        <Alert variant="destructive">
          <AlertDescription>
            ⚠️ Uno o più servizi sono bloccati per saldo insufficiente. Ricarica i crediti per ripristinare il servizio.
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="riepilogo">Riepilogo</TabsTrigger>
          <TabsTrigger value="ricarica">Ricarica Email</TabsTrigger>
          <TabsTrigger value="ricarica-ai">Ricarica AI</TabsTrigger>
          <TabsTrigger value="storico">Storico Movimenti</TabsTrigger>
        </TabsList>

        <TabsContent value="riepilogo" className="space-y-6">
          {/* Total balance hero */}
          <Card className="border-2 border-primary">
            <CardContent className="p-6 flex items-center gap-4">
              <Wallet className="h-8 w-8 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Saldo Totale</p>
                <p className="text-4xl font-extrabold text-primary">{formatEur(totalBalance)}</p>
              </div>
            </CardContent>
          </Card>

          {/* Wallet cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {wallets.map((w) => (
              <Card
                key={w.type}
                className={w.blocked ? "border-destructive" : ""}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                    {w.icon}
                    {w.label}
                    {w.blocked && <Badge variant="destructive" className="text-[10px]">Bloccato</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className={`text-3xl font-extrabold ${w.blocked ? "text-destructive" : "text-foreground"}`}>
                    {formatEur(w.balance)}
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <ArrowDownRight className="h-3 w-3 text-destructive" />
                      Speso: {formatEur(w.spent)}
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <ArrowUpRight className="h-3 w-3 text-emerald-500" />
                      Ricaricato: {formatEur(w.recharged)}
                    </div>
                  </div>
                  {w.recharged > 0 && (
                    <CreditUsageBar
                      spentEur={w.spent}
                      rechargedEur={w.recharged}
                      label={`Utilizzo ${w.label}`}
                    />
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="ricarica" className="space-y-6">
          {/* Credit Packages */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="h-4 w-4" /> Acquista Crediti Email
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Ogni euro corrisponde a circa {emailsPerEur.toLocaleString()} email.
                Seleziona un pacchetto per procedere al pagamento.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {PACKAGES.map((pkg) => {
                  const estimatedEmails = pricePerEmail ? Math.floor(pkg.amount / pricePerEmail) : 0;
                  return (
                    <Card key={pkg.amount} className="text-center hover:border-primary transition-colors">
                      <CardContent className="pt-6 pb-4 space-y-3">
                        <p className="text-3xl font-extrabold text-primary">{pkg.label}</p>
                        <p className="text-xs text-muted-foreground">
                          ~{estimatedEmails.toLocaleString()} email
                        </p>
                        <Button
                          onClick={() => handlePurchase(pkg.amount)}
                          disabled={purchaseLoading !== null}
                          className="w-full"
                          size="sm"
                        >
                          {purchaseLoading === pkg.amount ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "Acquista"
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Auto Top-up */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4" /> Auto Top-up
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Ricarica automaticamente i crediti email quando il saldo scende sotto la soglia impostata.
              </p>
              <div className="flex items-center gap-3">
                <Switch
                  checked={topupEnabled}
                  onCheckedChange={setTopupEnabled}
                />
                <Label className="text-sm">
                  {topupEnabled ? "Abilitato" : "Disabilitato"}
                </Label>
              </div>
              {topupEnabled && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm">Soglia (€)</Label>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={topupThreshold}
                      onChange={(e) => setTopupThreshold(e.target.value)}
                      placeholder="5"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Quando il saldo scende sotto questa soglia, verrà effettuata una ricarica automatica.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">Importo ricarica (€)</Label>
                    <Input
                      type="number"
                      min="5"
                      step="5"
                      value={topupAmount}
                      onChange={(e) => setTopupAmount(e.target.value)}
                      placeholder="25"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Importo che verrà addebitato sul metodo di pagamento salvato.
                    </p>
                  </div>
                </div>
              )}
              <Button
                onClick={() => saveTopupMutation.mutate()}
                disabled={saveTopupMutation.isPending}
                size="sm"
              >
                {saveTopupMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Salva Configurazione
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ricarica-ai" className="space-y-6">
          {/* AI Credit Packages */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Bot className="h-4 w-4" /> Acquista Crediti Agenti AI
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 mb-4">
                <div className="text-sm text-muted-foreground">
                  Saldo attuale: <span className="font-bold text-foreground">{formatEur(aiCredits?.balance_eur ?? 0)}</span>
                </div>
                {aiCredits?.calls_blocked && (
                  <Badge variant="destructive" className="text-[10px]">Chiamate bloccate</Badge>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[10, 25, 50, 100].map((amount) => (
                  <Card key={amount} className="text-center hover:border-primary transition-colors">
                    <CardContent className="pt-6 pb-4 space-y-3">
                      <p className="text-3xl font-extrabold text-primary">€{amount}</p>
                      <p className="text-xs text-muted-foreground">Crediti AI</p>
                      <Button
                        onClick={async () => {
                          setPurchaseLoading(amount + 1000);
                          try {
                            const { data, error } = await supabase.functions.invoke("create-checkout-session", {
                              body: { company_id: companyId, type: "ai_credits", amount_eur: amount },
                            });
                            if (error) throw error;
                            if (data?.url) window.location.href = data.url;
                            else toast.error(data?.error || "Errore");
                          } catch (e: any) {
                            toast.error(e.message || "Errore");
                          } finally {
                            setPurchaseLoading(null);
                          }
                        }}
                        disabled={purchaseLoading !== null}
                        className="w-full"
                        size="sm"
                      >
                        {purchaseLoading === amount + 1000 ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Acquista"
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* AI Auto Top-up */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4" /> Auto Top-up AI
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Ricarica automaticamente i crediti AI quando il saldo scende sotto la soglia impostata.
                La configurazione segue le stesse impostazioni dell'auto top-up email nella sezione "Ricarica Email".
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="storico" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" /> Storico Movimenti Email
              </CardTitle>
            </CardHeader>
            <CardContent>
              {logLoading ? (
                <Skeleton className="h-48" />
              ) : !emailLog || emailLog.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nessun movimento registrato.</p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Importo</TableHead>
                        <TableHead>Saldo Prima</TableHead>
                        <TableHead>Saldo Dopo</TableHead>
                        <TableHead>Descrizione</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {emailLog.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="font-mono text-xs">
                            {format(new Date(log.created_at), "dd/MM/yy HH:mm", { locale: it })}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                log.type === "deduction" ? "destructive" :
                                log.type === "topup" ? "default" :
                                "secondary"
                              }
                              className="text-[10px]"
                            >
                              {log.type === "deduction" ? "Detrazione" :
                               log.type === "topup" ? "Ricarica" :
                               log.type === "bonus" ? "Bonus" :
                               log.type === "refund" ? "Rimborso" :
                               log.type}
                            </Badge>
                          </TableCell>
                          <TableCell className={`font-mono font-semibold ${
                            log.type === "deduction" ? "text-destructive" : "text-emerald-600"
                          }`}>
                            {log.type === "deduction" ? "-" : "+"}{formatEur(Math.abs(log.amount_eur))}
                          </TableCell>
                          <TableCell className="font-mono text-muted-foreground text-xs">
                            {formatEur(log.balance_before)}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {formatEur(log.balance_after)}
                          </TableCell>
                          <TableCell className="text-xs max-w-[200px] truncate">
                            {log.description || "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
