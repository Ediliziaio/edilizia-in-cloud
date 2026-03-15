import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { CreditCard, Wallet, Clock, ShieldAlert, ArrowDown, ArrowUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { formatCurrency } from "@/lib/formatters";
import { formatEur, formatMinutes, estimateConversationsRemaining } from "@/modules/ai-agents/lib/creditCalculator";
import { useAgentCredits, useCreditTopups, useCreditUsage, useUsageByAgent } from "@/modules/ai-agents/hooks/useAgentCredits";
import { CreditUsageBar } from "@/modules/ai-agents/components/CreditUsageBar";
import { queryKeys } from "@/lib/queryKeys";
import { logger } from "@/utils/logger";

interface CreditTransaction {
  id: string;
  tipo: string;
  crediti: number;
  saldo_prima: number;
  saldo_dopo: number;
  descrizione: string | null;
  creato_il: string;
}

const TOPUP_OPTIONS = [
  { amount: 10, label: "€10" },
  { amount: 20, label: "€20", popular: true },
  { amount: 50, label: "€50" },
  { amount: 100, label: "€100" },
];

export function CreditiTab() {
  const companyId = useEffectiveCompanyId();
  const queryClient = useQueryClient();
  const { data: credits, isLoading } = useAgentCredits();
  const { data: topups } = useCreditTopups();
  const { data: usage } = useCreditUsage();
  const { data: usageByAgent } = useUsageByAgent();

  const [selectedAmount, setSelectedAmount] = useState<number | null>(20);
  const [customAmount, setCustomAmount] = useState("");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isTopupLoading, setIsTopupLoading] = useState(false);

  // Auto-recharge state
  const [autoRechargeEnabled, setAutoRechargeEnabled] = useState(false);
  const [autoRechargeThreshold, setAutoRechargeThreshold] = useState("5");
  const [autoRechargeAmount, setAutoRechargeAmount] = useState("20");
  const [isSavingAutoRecharge, setIsSavingAutoRecharge] = useState(false);

  // Credit transactions from new table
  const { data: transactions = [] } = useQuery({
    queryKey: ["ai-credit-transactions", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_credit_transactions" as never)
        .select("*")
        .eq("company_id", companyId!)
        .order("creato_il", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as CreditTransaction[];
    },
  });

  useEffect(() => {
    if (credits) {
      setAutoRechargeEnabled(credits.auto_recharge_enabled ?? false);
      setAutoRechargeThreshold(String(credits.auto_recharge_threshold ?? 5));
      setAutoRechargeAmount(String(credits.auto_recharge_amount ?? 20));
    }
  }, [credits]);

  const balance = credits?.balance_eur ?? 0;
  const spent = credits?.total_spent_eur ?? 0;
  const recharged = credits?.total_recharged_eur ?? 0;
  const blocked = credits?.calls_blocked ?? false;

  const avgCostPerMin = usageByAgent && usageByAgent.length > 0
    ? usageByAgent.reduce((s, u) => s + u.cost, 0) / Math.max(1, usageByAgent.reduce((s, u) => s + u.minutes, 0))
    : 0.04;

  const estConversations = estimateConversationsRemaining(balance, avgCostPerMin, 5);

  const balanceColor = blocked || balance <= 0 ? "text-destructive"
    : balance <= (credits?.alert_threshold_eur ?? 5) ? "text-amber-500"
    : "text-primary";

  const borderColor = blocked || balance <= 0 ? "border-destructive"
    : balance <= (credits?.alert_threshold_eur ?? 5) ? "border-amber-500"
    : "border-primary";

  const topupAmount = selectedAmount ?? (customAmount ? parseFloat(customAmount) : 0);

  const handleTopup = async () => {
    if (topupAmount < 5) { toast.error("Importo minimo €5.00"); return; }
    setIsTopupLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("topup-credits", {
        body: { companyId: credits?.company_id, amountEur: topupAmount, paymentMethod: "manual_admin" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Ricarica di ${formatEur(topupAmount)} completata!`);
      queryClient.invalidateQueries({ queryKey: queryKeys.aiCredits.all });
      setShowConfirmDialog(false);
    } catch {
      toast.error("Errore durante la ricarica");
    } finally {
      setIsTopupLoading(false);
    }
  };

  const handleSaveAutoRecharge = async () => {
    setIsSavingAutoRecharge(true);
    try {
      const cId = credits?.company_id;
      if (!cId) throw new Error("company_id mancante");
      const { error } = await supabase
        .from("ai_credits" as never)
        .update({
          auto_recharge_enabled: autoRechargeEnabled,
          auto_recharge_threshold: parseFloat(autoRechargeThreshold) || 5,
          auto_recharge_amount: parseFloat(autoRechargeAmount) || 20,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("company_id" as never, cId as never);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: queryKeys.aiCredits.all });
      toast.success("Impostazioni ricarica automatica salvate");
    } catch {
      toast.error("Errore nel salvataggio");
    } finally {
      setIsSavingAutoRecharge(false);
    }
  };

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-[200px]" /></div>;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-foreground">Crediti & Utilizzo</h2>

      {/* Hero Card — Balance */}
      <Card className={`border-2 ${borderColor}`}>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-sm font-semibold text-muted-foreground">Saldo Disponibile</p>
              <p className={`text-5xl font-extrabold mt-1 ${balanceColor}`}>{formatEur(balance)}</p>
              <div className="mt-4">
                <CreditUsageBar spentEur={spent} rechargedEur={recharged} />
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Stima: <span className="font-mono font-medium text-foreground">~{estConversations} conversazioni da 5 min</span>
              </p>
              {blocked && (
                <Card className="bg-destructive/10 border-destructive/30 mt-4">
                  <CardContent className="p-3 flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-destructive" />
                    <div>
                      <p className="text-sm font-semibold text-destructive">Chiamate bloccate — Saldo esaurito</p>
                      <p className="text-xs text-destructive/80">Ricarica subito per riattivare gli agenti.</p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Ricarica Automatica</p>
              <div className="flex items-center gap-2 mt-2">
                <Switch checked={autoRechargeEnabled} onCheckedChange={setAutoRechargeEnabled} />
                <span className="text-sm text-muted-foreground">{autoRechargeEnabled ? "Attiva" : "Disattivata"}</span>
              </div>
              {autoRechargeEnabled && (
                <div className="mt-3 space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Soglia (€)</Label>
                    <Input type="number" min={1} value={autoRechargeThreshold} onChange={(e) => setAutoRechargeThreshold(e.target.value)} className="w-24 font-mono" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Importo ricarica (€)</Label>
                    <Input type="number" min={5} step={5} value={autoRechargeAmount} onChange={(e) => setAutoRechargeAmount(e.target.value)} className="w-24 font-mono" />
                  </div>
                  <Button size="sm" onClick={handleSaveAutoRecharge} disabled={isSavingAutoRecharge}>
                    {isSavingAutoRecharge ? "Salvataggio..." : "Salva"}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Manual Topup */}
      <div>
        <h3 className="text-lg font-bold text-foreground">Ricarica Manuale</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4">
          {TOPUP_OPTIONS.map((opt) => (
            <Card
              key={opt.amount}
              className={`cursor-pointer transition hover:shadow-md ${selectedAmount === opt.amount ? "border-2 border-primary bg-primary/5" : "border"}`}
              onClick={() => { setSelectedAmount(opt.amount); setCustomAmount(""); }}
            >
              <CardContent className="p-5 text-center relative">
                {opt.popular && <Badge className="absolute top-2 right-2 text-[10px]">Popolare</Badge>}
                <p className="text-3xl font-extrabold">{opt.label}</p>
                <p className="text-xs text-muted-foreground mt-1 font-mono">~{estimateConversationsRemaining(opt.amount, avgCostPerMin, 5)} conv.</p>
              </CardContent>
            </Card>
          ))}
          <Card
            className={`cursor-pointer transition hover:shadow-md ${selectedAmount === null && customAmount ? "border-2 border-primary bg-primary/5" : "border border-dashed"}`}
            onClick={() => setSelectedAmount(null)}
          >
            <CardContent className="p-5 text-center space-y-2">
              <p className="text-sm text-muted-foreground">Personalizzato</p>
              <Input type="number" min={5} max={500} placeholder="€" value={customAmount} onChange={(e) => { setCustomAmount(e.target.value); setSelectedAmount(null); }} className="text-center text-lg font-mono" />
            </CardContent>
          </Card>
        </div>
        <Button className="w-full mt-4" size="lg" disabled={topupAmount < 5} onClick={() => setShowConfirmDialog(true)}>
          <CreditCard className="h-4 w-4 mr-2" /> Ricarica {topupAmount >= 5 ? formatEur(topupAmount) : ""}
        </Button>
      </div>

      {/* Usage by Agent */}
      {usageByAgent && usageByAgent.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4" /> Utilizzo per Agente</CardTitle></CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agente</TableHead>
                    <TableHead>LLM + TTS</TableHead>
                    <TableHead>Chiamate</TableHead>
                    <TableHead>Minuti</TableHead>
                    <TableHead>Costo (€)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usageByAgent.map((u) => (
                    <TableRow key={u.agent_id}>
                      <TableCell className="font-medium">{u.name}</TableCell>
                      <TableCell><Badge variant="secondary" className="text-[10px] font-mono">{u.llm} + {u.tts}</Badge></TableCell>
                      <TableCell>{u.calls}</TableCell>
                      <TableCell className="font-mono">{formatMinutes(u.minutes)}</TableCell>
                      <TableCell className="font-mono font-semibold text-primary">{formatEur(u.cost, 4)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Credit Transactions */}
      {transactions.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Wallet className="h-4 w-4" /> Storico Transazioni Crediti</CardTitle></CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Crediti</TableHead>
                    <TableHead>Saldo Dopo</TableHead>
                    <TableHead>Descrizione</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono text-xs">{format(new Date(t.creato_il), "dd/MM/yy HH:mm", { locale: it })}</TableCell>
                      <TableCell>
                        <Badge variant={t.tipo === "consumo" ? "destructive" : "default"} className="text-[10px]">
                          {t.tipo === "consumo" ? "Consumo" : t.tipo === "ricarica" ? "Ricarica" : t.tipo}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono">
                        <span className={t.crediti < 0 ? "text-destructive" : "text-primary"}>
                          {t.crediti < 0 ? "" : "+"}{t.crediti.toFixed(2)}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-muted-foreground">{t.saldo_dopo.toFixed(2)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{t.descrizione || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Topup History from legacy table */}
      {topups && topups.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Wallet className="h-4 w-4" /> Storico Ricariche</CardTitle></CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Importo</TableHead>
                    <TableHead>N. Fattura</TableHead>
                    <TableHead>Stato</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topups.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono text-xs">{format(new Date(t.created_at), "dd/MM/yy HH:mm", { locale: it })}</TableCell>
                      <TableCell><Badge variant="secondary" className="text-[10px]">{t.type === "manual" ? "Manuale" : t.type === "auto" ? "Automatica" : t.type}</Badge></TableCell>
                      <TableCell className="font-mono font-semibold">{formatEur(t.amount_eur)}</TableCell>
                      <TableCell className="font-mono text-xs">{t.invoice_number || "—"}</TableCell>
                      <TableCell><Badge variant={t.status === "completed" ? "default" : "secondary"} className="text-[10px]">{t.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirm Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Conferma Ricarica</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Stai per ricaricare <span className="font-bold text-foreground">{formatEur(topupAmount)}</span>.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>Annulla</Button>
            <Button onClick={handleTopup} disabled={isTopupLoading}>
              {isTopupLoading ? "Elaborazione..." : "Conferma"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
