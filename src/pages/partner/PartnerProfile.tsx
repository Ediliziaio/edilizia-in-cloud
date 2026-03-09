import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, User, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export default function PartnerProfile() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: referrer, isLoading } = useQuery({
    queryKey: ["my-referrer-full", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("referrers")
        .select("*, referral_tiers(name, icon)")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [partnerType, setPartnerType] = useState("referrer");
  const [payoutMethod, setPayoutMethod] = useState("bank_transfer");
  const [iban, setIban] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [bank, setBank] = useState("");
  const [fiscalCode, setFiscalCode] = useState("");

  useEffect(() => {
    if (referrer) {
      setName(referrer.name || "");
      setPhone(referrer.phone || "");
      setPartnerType(referrer.partner_type || "referrer");
      setPayoutMethod(referrer.payout_method || "bank_transfer");
      const details = (referrer.payout_details as any) || {};
      setIban(details.iban || "");
      setAccountHolder(details.account_holder || "");
      setBank(details.bank || "");
      setFiscalCode(details.fiscal_code || "");
    }
  }, [referrer]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("referrers")
        .update({
          name,
          phone: phone || null,
          partner_type: partnerType,
          payout_method: payoutMethod,
          payout_details: {
            iban,
            account_holder: accountHolder,
            bank,
            fiscal_code: fiscalCode,
          },
        })
        .eq("id", referrer!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-referrer-full", user?.id] });
      toast.success("Profilo aggiornato");
    },
    onError: (err: any) => {
      toast.error("Errore", { description: err.message });
    },
  });

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  if (!referrer) return null;

  return (
    <div className="space-y-6 p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold tracking-tight">Profilo Partner</h1>

      {/* Personal info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4" /> Informazioni Personali
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={referrer.email} disabled className="bg-muted" />
          </div>
          <div className="space-y-1.5">
            <Label>Telefono</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+39 333 1234567" />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo Partner</Label>
            <Select value={partnerType} onValueChange={setPartnerType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="referrer">Referrer</SelectItem>
                <SelectItem value="agency">Agenzia</SelectItem>
                <SelectItem value="reseller">Rivenditore</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Payment info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4" /> Dati di Pagamento
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Metodo di Pagamento</Label>
            <Select value={payoutMethod} onValueChange={setPayoutMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bank_transfer">Bonifico bancario</SelectItem>
                <SelectItem value="paypal">PayPal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {payoutMethod === "bank_transfer" && (
            <>
              <div className="space-y-1.5">
                <Label>IBAN</Label>
                <Input value={iban} onChange={(e) => setIban(e.target.value)} placeholder="IT60 X054 2811 1010 0000 0123 456" />
              </div>
              <div className="space-y-1.5">
                <Label>Intestatario</Label>
                <Input value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Banca</Label>
                <Input value={bank} onChange={(e) => setBank(e.target.value)} />
              </div>
            </>
          )}
          <div className="space-y-1.5">
            <Label>Codice Fiscale</Label>
            <Input value={fiscalCode} onChange={(e) => setFiscalCode(e.target.value)} placeholder="RSSMRA80A01H501X" />
          </div>
        </CardContent>
      </Card>

      {/* Terms */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <Badge variant={referrer.has_accepted_terms ? "default" : "secondary"}>
              {referrer.has_accepted_terms ? "✓ Termini Accettati" : "Termini non accettati"}
            </Badge>
            {referrer.terms_accepted_at && (
              <span className="text-xs text-muted-foreground">
                Accettato il: {format(new Date(referrer.terms_accepted_at), "dd/MM/yyyy")}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="w-full">
        {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
        Salva Profilo
      </Button>
    </div>
  );
}
