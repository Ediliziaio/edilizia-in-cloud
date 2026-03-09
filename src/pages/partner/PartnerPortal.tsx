import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Users, DollarSign, TrendingUp, Gift, Copy, Check } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function PartnerPortal() {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);

  // Fetch referrer linked to current user
  const { data: referrer, isLoading: loadingReferrer } = useQuery({
    queryKey: ["my-referrer", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referrers")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Fetch referred companies
  const { data: referredCompanies = [], isLoading: loadingCompanies } = useQuery({
    queryKey: ["my-referral-companies", referrer?.id],
    enabled: !!referrer?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referral_companies")
        .select("*")
        .eq("referrer_id", referrer!.id)
        .order("referred_at", { ascending: false });
      if (error) throw error;

      // Fetch company names
      if (data.length === 0) return [];
      const companyIds = data.map((rc: any) => rc.company_id);
      const { data: companies } = await supabase
        .from("companies")
        .select("id, name, status")
        .in("id", companyIds);

      return data.map((rc: any) => ({
        ...rc,
        company: companies?.find((c: any) => c.id === rc.company_id),
      }));
    },
  });

  // Fetch payouts
  const { data: payouts = [], isLoading: loadingPayouts } = useQuery({
    queryKey: ["my-referral-payouts", referrer?.id],
    enabled: !!referrer?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referral_payouts")
        .select("*")
        .eq("referrer_id", referrer!.id)
        .order("paid_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const copyReferralLink = () => {
    if (!referrer?.referral_code) return;
    const link = `${window.location.origin}/home?ref=${referrer.referral_code}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Link copiato!");
    setTimeout(() => setCopied(false), 2000);
  };

  if (loadingReferrer) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!referrer) {
    return (
      <div className="max-w-2xl mx-auto mt-20 text-center space-y-4">
        <Gift className="h-16 w-16 mx-auto text-muted-foreground" />
        <h2 className="text-2xl font-bold">Portale Partner non disponibile</h2>
        <p className="text-muted-foreground">
          Il tuo account non è associato a un profilo partner. Contatta l'amministratore per attivare il tuo accesso al programma referral.
        </p>
      </div>
    );
  }

  const totalEarned = referrer.total_earned || 0;
  const totalPaid = referrer.total_paid || 0;
  const balance = totalEarned - totalPaid;
  const activeCompanies = referredCompanies.filter((rc: any) => rc.is_active).length;

  return (
    <div className="space-y-6 p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Portale Partner</h1>
          <p className="text-muted-foreground">Benvenuto, {referrer.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <code className="bg-muted px-3 py-1.5 rounded text-sm font-mono">{referrer.referral_code}</code>
          <Button variant="outline" size="sm" onClick={copyReferralLink}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Aziende Referenziate</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{referredCompanies.length}</p>
            <p className="text-xs text-muted-foreground">{activeCompanies} attive</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5" /> Totale Guadagnato</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(totalEarned)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5"><DollarSign className="h-3.5 w-3.5" /> Totale Pagato</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(totalPaid)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5"><DollarSign className="h-3.5 w-3.5" /> Saldo Disponibile</CardDescription>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${balance > 0 ? "text-green-600" : ""}`}>{formatCurrency(balance)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Commission info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Il tuo piano commissioni</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Badge variant="secondary" className="text-sm">
              {referrer.commission_type === "percentage" 
                ? `${referrer.commission_value}% ricorrente` 
                : `${formatCurrency(referrer.commission_value)} fisso`}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {referrer.commission_type === "percentage" 
                ? "Guadagni una percentuale sull'abbonamento mensile di ogni azienda che porti" 
                : "Guadagni un importo fisso per ogni azienda che porti"}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="companies">
        <TabsList>
          <TabsTrigger value="companies">Aziende ({referredCompanies.length})</TabsTrigger>
          <TabsTrigger value="payouts">Pagamenti ({payouts.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="companies" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {loadingCompanies ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : referredCompanies.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p>Nessuna azienda referenziata ancora</p>
                  <p className="text-sm">Condividi il tuo link per iniziare a guadagnare</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Azienda</TableHead>
                      <TableHead>Stato</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Attiva</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {referredCompanies.map((rc: any) => (
                      <TableRow key={rc.id}>
                        <TableCell className="font-medium">{rc.company?.name || "—"}</TableCell>
                        <TableCell>
                          <Badge variant={rc.company?.status === "active" ? "default" : "secondary"}>
                            {rc.company?.status || "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(rc.referred_at), "dd MMM yyyy", { locale: it })}
                        </TableCell>
                        <TableCell>
                          <Badge variant={rc.is_active ? "default" : "outline"}>
                            {rc.is_active ? "Attiva" : "Inattiva"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payouts" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {loadingPayouts ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : payouts.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <DollarSign className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p>Nessun pagamento registrato</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Importo</TableHead>
                      <TableHead>Periodo</TableHead>
                      <TableHead>Metodo</TableHead>
                      <TableHead>Data Pagamento</TableHead>
                      <TableHead>Note</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payouts.map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-bold">{formatCurrency(p.amount)}</TableCell>
                        <TableCell className="text-sm">
                          {format(new Date(p.period_start), "dd/MM/yy")} — {format(new Date(p.period_end), "dd/MM/yy")}
                        </TableCell>
                        <TableCell className="text-sm">{p.payment_method || "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(p.paid_at), "dd MMM yyyy", { locale: it })}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{p.notes || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
