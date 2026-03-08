import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { CreditUsageBar } from "@/modules/ai-agents/components/CreditUsageBar";
import { formatEur } from "@/modules/ai-agents/lib/creditCalculator";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Mail, Bot, MessageSquare, Wallet, ArrowUpRight, ArrowDownRight, Clock } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

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

export default function SettingsCredits() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const [activeTab, setActiveTab] = useState("riepilogo");

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Crediti & Saldo</h1>
        <p className="text-muted-foreground">Riepilogo dei saldi per email, AI e WhatsApp</p>
      </div>

      {hasBlocked && (
        <Alert variant="destructive">
          <AlertDescription>
            ⚠️ Uno o più servizi sono bloccati per saldo insufficiente. Contatta l'amministratore per ricaricare.
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="riepilogo">Riepilogo</TabsTrigger>
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
                                log.movement_type === "deduction" ? "destructive" :
                                log.movement_type === "topup" ? "default" :
                                "secondary"
                              }
                              className="text-[10px]"
                            >
                              {log.movement_type === "deduction" ? "Detrazione" :
                               log.movement_type === "topup" ? "Ricarica" :
                               log.movement_type === "bonus" ? "Bonus" :
                               log.movement_type === "refund" ? "Rimborso" :
                               log.movement_type}
                            </Badge>
                          </TableCell>
                          <TableCell className={`font-mono font-semibold ${
                            log.movement_type === "deduction" ? "text-destructive" : "text-emerald-600"
                          }`}>
                            {log.movement_type === "deduction" ? "-" : "+"}{formatEur(Math.abs(log.amount))}
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
