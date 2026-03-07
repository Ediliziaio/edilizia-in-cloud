import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { CreditCard, Wallet, TrendingUp, Clock, AlertTriangle, ShieldAlert } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { CreditUsageBar } from "../components/CreditUsageBar";
import { useAgentCredits, useCreditTopups, useCreditUsage, useUsageByAgent } from "../hooks/useAgentCredits";
import { estimateConversationsRemaining, formatEur, formatMinutes } from "../lib/creditCalculator";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

const TOPUP_OPTIONS = [
  { amount: 10, label: "€10" },
  { amount: 20, label: "€20", popular: true },
  { amount: 50, label: "€50" },
  { amount: 100, label: "€100" },
];

export default function AgentCreditsPage() {
  const { data: credits, isLoading } = useAgentCredits();
  const { data: topups } = useCreditTopups();
  const { data: usage } = useCreditUsage();
  const { data: usageByAgent } = useUsageByAgent();
  const queryClient = useQueryClient();

  const [selectedAmount, setSelectedAmount] = useState<number | null>(20);
  const [customAmount, setCustomAmount] = useState("");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isTopupLoading, setIsTopupLoading] = useState(false);
  const [fallbackCompanyId, setFallbackCompanyId] = useReactState<string | null>(null);

  // Fetch company_id from profile as fallback when credits wallet doesn't exist yet
  useEffect(() => {
    if (!credits?.company_id) {
      supabase.from("profiles").select("company_id").limit(1).maybeSingle().then(({ data }) => {
        if (data?.company_id) setFallbackCompanyId(data.company_id as string);
      });
    }
  }, [credits?.company_id]);

  const balance = credits?.balance_eur ?? 0;
  const spent = credits?.total_spent_eur ?? 0;
  const recharged = credits?.total_recharged_eur ?? 0;
  const blocked = credits?.calls_blocked ?? false;

  // Estimate avg cost per min from usage
  const avgCostPerMin = usageByAgent && usageByAgent.length > 0
    ? usageByAgent.reduce((s, u) => s + u.cost, 0) / Math.max(1, usageByAgent.reduce((s, u) => s + u.minutes, 0))
    : 0.04;

  const estConversations = estimateConversationsRemaining(balance, avgCostPerMin, 5);

  const balanceColor = blocked || balance <= 0
    ? "text-destructive"
    : balance <= (credits?.alert_threshold_eur ?? 5)
    ? "text-amber-500"
    : "text-primary";

  const borderColor = blocked || balance <= 0
    ? "border-destructive"
    : balance <= (credits?.alert_threshold_eur ?? 5)
    ? "border-amber-500"
    : "border-primary";

  const topupAmount = selectedAmount ?? (customAmount ? parseFloat(customAmount) : 0);

  const handleTopup = async () => {
    if (topupAmount < 5) {
      toast.error("Importo minimo €5.00");
      return;
    }
    setIsTopupLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("topup-credits", {
        body: {
          companyId: credits?.company_id || fallbackCompanyId,
          amountEur: topupAmount,
          paymentMethod: "manual_admin",
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Ricarica di ${formatEur(topupAmount)} completata! Fattura: ${data.invoice_number}`);
      queryClient.invalidateQueries({ queryKey: ["ai-credits"] });
      queryClient.invalidateQueries({ queryKey: ["ai-credit-topups"] });
      setShowConfirmDialog(false);
    } catch (err) {
      toast.error("Errore durante la ricarica");
      console.error(err);
    } finally {
      setIsTopupLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[200px]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Crediti & Utilizzo</h1>

      {/* Hero Card — Balance */}
      <Card className={`border-2 ${borderColor}`}>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left — Balance */}
            <div>
              <p className="text-sm font-semibold text-muted-foreground">Saldo Disponibile</p>
              <p className={`text-5xl font-extrabold mt-1 ${balanceColor}`}>
                {formatEur(balance)}
              </p>

              <div className="mt-4">
                <CreditUsageBar spentEur={spent} rechargedEur={recharged} />
              </div>

              <p className="text-xs text-muted-foreground mt-3">
                Stima chiamate rimanenti: <span className="font-mono font-medium text-foreground">~{estConversations} conversazioni da 5 min</span>
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

            {/* Right — Auto-recharge */}
            <div>
              <p className="text-sm font-semibold text-foreground">Ricarica Automatica</p>
              <div className="flex items-center gap-2 mt-2">
                <Switch checked={credits?.auto_recharge_enabled ?? false} disabled />
                <span className="text-sm text-muted-foreground">
                  {credits?.auto_recharge_enabled ? "Attiva" : "Disattivata"}
                </span>
              </div>
              {credits?.auto_recharge_enabled ? (
                <Card className="bg-primary/5 border-primary/20 mt-3">
                  <CardContent className="p-4 space-y-2 text-sm">
                    <p>✅ Ricarica automatica attiva</p>
                    <p>Soglia: <span className="font-mono">{formatEur(credits.auto_recharge_threshold)}</span></p>
                    <p>Importo: <span className="font-mono">{formatEur(credits.auto_recharge_amount)}</span></p>
                  </CardContent>
                </Card>
              ) : (
                <p className="text-xs text-muted-foreground mt-2">
                  Con la ricarica automatica non perdi mai una chiamata.
                  <br />Soglia alert: {formatEur(credits?.alert_threshold_eur ?? 5)}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Manual Topup */}
      <div>
        <h2 className="text-lg font-bold">Ricarica Manuale</h2>
        <p className="text-sm text-muted-foreground">Seleziona un importo o inseriscine uno personalizzato.</p>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4">
          {TOPUP_OPTIONS.map((opt) => (
            <Card
              key={opt.amount}
              className={`cursor-pointer transition hover:shadow-md ${
                selectedAmount === opt.amount ? "border-2 border-primary bg-primary/5" : "border"
              }`}
              onClick={() => { setSelectedAmount(opt.amount); setCustomAmount(""); }}
            >
              <CardContent className="p-5 text-center relative">
                {opt.popular && (
                  <Badge className="absolute top-2 right-2 text-[10px]">Popolare</Badge>
                )}
                <p className="text-3xl font-extrabold">{opt.label}</p>
                <p className="text-xs text-muted-foreground mt-1 font-mono">
                  ~{estimateConversationsRemaining(opt.amount, avgCostPerMin, 5)} conv. da 5 min
                </p>
              </CardContent>
            </Card>
          ))}
          <Card
            className={`cursor-pointer transition hover:shadow-md ${
              selectedAmount === null && customAmount ? "border-2 border-primary bg-primary/5" : "border border-dashed"
            }`}
            onClick={() => setSelectedAmount(null)}
          >
            <CardContent className="p-5 text-center space-y-2">
              <p className="text-sm text-muted-foreground">Personalizzato</p>
              <Input
                type="number"
                min={5}
                max={500}
                step={1}
                placeholder="€"
                value={customAmount}
                onChange={(e) => { setCustomAmount(e.target.value); setSelectedAmount(null); }}
                className="text-center text-lg font-mono"
              />
              <p className="text-[10px] text-muted-foreground">Min €5</p>
            </CardContent>
          </Card>
        </div>

        <Button
          className="w-full mt-4"
          size="lg"
          disabled={topupAmount < 5}
          onClick={() => setShowConfirmDialog(true)}
        >
          <CreditCard className="h-4 w-4 mr-2" /> Ricarica {topupAmount >= 5 ? formatEur(topupAmount) : ""}
        </Button>
      </div>

      {/* Usage by Agent */}
      {usageByAgent && usageByAgent.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" /> Utilizzo per Agente
            </CardTitle>
          </CardHeader>
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
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px] font-mono">{u.llm} + {u.tts}</Badge>
                      </TableCell>
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

      {/* Recent conversations */}
      {usage && usage.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ultime Conversazioni</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data/Ora</TableHead>
                    <TableHead>Durata</TableHead>
                    <TableHead>LLM</TableHead>
                    <TableHead>Costo €</TableHead>
                    <TableHead>Saldo Dopo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usage.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-mono text-xs">
                        {format(new Date(u.created_at), "dd/MM/yy HH:mm", { locale: it })}
                      </TableCell>
                      <TableCell className="font-mono">{formatMinutes(u.duration_min)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] font-mono">{u.llm_model}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-primary">{formatEur(u.cost_billed_total, 4)}</TableCell>
                      <TableCell className="font-mono text-muted-foreground">{formatEur(u.balance_after)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Topup History */}
      {topups && topups.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="h-4 w-4" /> Storico Ricariche
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Importo</TableHead>
                    <TableHead>Metodo</TableHead>
                    <TableHead>N. Fattura</TableHead>
                    <TableHead>Stato</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topups.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono text-xs">
                        {format(new Date(t.created_at), "dd/MM/yy HH:mm", { locale: it })}
                      </TableCell>
                      <TableCell>
                        <Badge variant={
                          t.type === "auto" ? "default" :
                          t.type === "promotional" ? "secondary" :
                          t.type === "adjustment" ? "outline" : "default"
                        } className="text-[10px]">
                          {t.type === "manual" ? "Manuale" :
                           t.type === "auto" ? "Automatica" :
                           t.type === "promotional" ? "Promozionale" : "Aggiustamento"}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono font-semibold">{formatEur(t.amount_eur)}</TableCell>
                      <TableCell className="text-sm">{t.payment_method || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{t.invoice_number || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={t.status === "completed" ? "default" : t.status === "failed" ? "destructive" : "secondary"} className="text-[10px]">
                          {t.status === "completed" ? "Completato" :
                           t.status === "failed" ? "Fallito" :
                           t.status === "refunded" ? "Rimborsato" : "In attesa"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {!credits && (
        <p className="text-sm text-muted-foreground text-center py-8">
          Nessun portafoglio crediti attivo. Contatta l'amministratore.
        </p>
      )}

      {/* Confirm Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conferma Ricarica</DialogTitle>
          </DialogHeader>
          <Card className="bg-muted/50">
            <CardContent className="p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Importo:</span>
                <span className="font-mono font-bold">{formatEur(topupAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span>Saldo dopo ricarica:</span>
                <span className="font-mono">{formatEur(balance + topupAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span>Fattura:</span>
                <span className="text-xs text-muted-foreground">Generata automaticamente</span>
              </div>
            </CardContent>
          </Card>
          <DialogFooter className="flex-col gap-2">
            <Button onClick={handleTopup} disabled={isTopupLoading} className="w-full">
              {isTopupLoading ? "Elaborazione..." : `Conferma e Ricarica ${formatEur(topupAmount)}`}
            </Button>
            <Button variant="ghost" onClick={() => setShowConfirmDialog(false)} className="w-full">
              Annulla
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
