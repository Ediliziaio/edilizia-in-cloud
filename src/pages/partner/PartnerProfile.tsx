import { useState, useEffect } from "react";
import { isValidIBAN, electronicFormatIBAN } from "ibantools";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Save, User, CreditCard, FileText, ShieldCheck, Clock3 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { fetchWithTimeout } from "@/lib/utils/fetchWithTimeout";
import {
  bankVerificationLabel,
  contractApprovalLabel,
  getBankVerificationStatus,
  getContractApprovalStatus,
  getReferralPayoutDetails,
} from "@/lib/referralCompliance";

const partnerSubmitPayoutDetails = supabase.rpc as unknown as (
  fn: "partner_submit_referral_payout_details",
  args: {
    p_name: string;
    p_phone: string | null;
    p_partner_type: string;
    p_payout_method: string;
    p_iban: string | null;
    p_account_holder: string | null;
    p_bank: string | null;
    p_fiscal_code: string | null;
  },
) => ReturnType<typeof supabase.rpc>;

const partnerSignContract = supabase.rpc as unknown as (
  fn: "partner_sign_referral_contract",
  args: {
    p_signed_name: string;
    p_ip_address: string;
    p_user_agent: string;
    p_contract_version: string;
  },
) => ReturnType<typeof supabase.rpc>;

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
  const [ibanError, setIbanError] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [bank, setBank] = useState("");
  const [fiscalCode, setFiscalCode] = useState("");
  const [contractSignerName, setContractSignerName] = useState("");
  const [contractAccepted, setContractAccepted] = useState(false);

  useEffect(() => {
    if (referrer) {
      setName(referrer.name || "");
      setPhone(referrer.phone || "");
      setPartnerType(referrer.partner_type || "referrer");
      setPayoutMethod(referrer.payout_method || "bank_transfer");
      const details = getReferralPayoutDetails(referrer.payout_details);
      setIban(details.iban || "");
      setAccountHolder(details.account_holder || "");
      setBank(details.bank || "");
      setFiscalCode(details.fiscal_code || "");
      setContractSignerName(details.contract?.signed_name || referrer.name || "");
    }
  }, [referrer]);

  const validateIban = (value: string) => {
    if (!value) { setIbanError(""); return; }
    const cleaned = value.replace(/\s/g, "").toUpperCase();
    if (!isValidIBAN(cleaned)) {
      setIbanError("IBAN non valido — verifica il numero");
    } else {
      setIbanError("");
      setIban(electronicFormatIBAN(cleaned) || cleaned);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Blocca il salvataggio se IBAN non valido
      if (payoutMethod === "bank_transfer" && !iban.trim()) {
        throw new Error("Inserisci l'IBAN per ricevere i payout tramite bonifico.");
      }
      if (payoutMethod === "bank_transfer" && iban) {
        if (!isValidIBAN(iban.replace(/\s/g, ""))) {
          throw new Error("IBAN non valido. Correggi prima di salvare.");
        }
      }
      if (payoutMethod === "bank_transfer" && !accountHolder) {
        throw new Error("Inserisci il nome dell'intestatario del conto.");
      }
      const currentDetails = getReferralPayoutDetails(referrer!.payout_details);
      const normalizedIban = electronicFormatIBAN(iban.replace(/\s/g, "").toUpperCase()) || iban.replace(/\s/g, "").toUpperCase();
      const bankChanged =
        payoutMethod === "bank_transfer" &&
        (
          normalizedIban !== (currentDetails.iban || "") ||
          accountHolder.trim() !== (currentDetails.account_holder || "") ||
          bank.trim() !== (currentDetails.bank || "") ||
          fiscalCode.trim() !== (currentDetails.fiscal_code || "")
        );
      const previousBankStatus = getBankVerificationStatus(currentDetails);
      const nextBankStatus = bankChanged || previousBankStatus === "rejected" || previousBankStatus === "draft"
        ? "pending"
        : previousBankStatus;
      const { error } = await partnerSubmitPayoutDetails("partner_submit_referral_payout_details", {
        p_name: name,
        p_phone: phone || null,
        p_partner_type: partnerType,
        p_payout_method: payoutMethod,
        p_iban: payoutMethod === "bank_transfer" ? normalizedIban : null,
        p_account_holder: payoutMethod === "bank_transfer" ? accountHolder.trim() : null,
        p_bank: payoutMethod === "bank_transfer" ? bank.trim() : null,
        p_fiscal_code: fiscalCode.trim() || null,
      });
      if (error) throw error;
      return { bankChanged, nextBankStatus };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["my-referrer-full", user?.id] });
      queryClient.invalidateQueries({ queryKey: queryKeys.partnerPayouts.referrer(user?.id) });
      queryClient.invalidateQueries({ queryKey: ["my-referrer-sidebar", user?.id] });
      toast.success(result?.nextBankStatus === "pending" ? "Dati conto inviati in verifica" : "Profilo aggiornato");
    },
    onError: (err) => {
      toast.error("Errore", { description: err instanceof Error ? err.message : "Errore imprevisto" });
    },
  });

  const signContractMutation = useMutation({
    mutationFn: async () => {
      if (!contractSignerName.trim()) throw new Error("Inserisci il nome completo del firmatario.");
      if (!contractAccepted) throw new Error("Devi confermare lettura e accettazione del contratto.");

      let ip = "unknown";
      try {
        const res = await fetchWithTimeout("https://api.ipify.org?format=json", {
          timeoutMs: 5_000,
          context: "partner.contract.ip",
        });
        const data = await res.json();
        ip = data.ip || "unknown";
      } catch { /* IP non disponibile: non blocca la firma locale */ }

      const currentDetails = getReferralPayoutDetails(referrer!.payout_details);
      const { error } = await partnerSignContract("partner_sign_referral_contract", {
        p_signed_name: contractSignerName.trim(),
        p_ip_address: ip,
        p_user_agent: navigator.userAgent,
        p_contract_version: currentDetails.contract?.version || "1.0",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-referrer-full", user?.id] });
      queryClient.invalidateQueries({ queryKey: queryKeys.partnerPayouts.referrer(user?.id) });
      queryClient.invalidateQueries({ queryKey: ["my-referrer-sidebar", user?.id] });
      setContractAccepted(false);
      toast.success("Contratto firmato e inviato per approvazione");
    },
    onError: (err) => {
      toast.error("Errore", { description: err instanceof Error ? err.message : "Errore imprevisto" });
    },
  });

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  if (!referrer) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <User className="h-12 w-12 mx-auto mb-4 opacity-40" />
            <h1 className="text-xl font-semibold text-foreground">Profilo partner non disponibile</h1>
            <p className="mt-2 text-sm">Il tuo account non è ancora associato a un profilo partner attivo.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const details = getReferralPayoutDetails(referrer.payout_details);
  const bankStatus = getBankVerificationStatus(details);
  const contractStatus = getContractApprovalStatus(details, referrer.has_accepted_terms);
  const bankBadgeVariant = bankStatus === "verified" ? "default" : bankStatus === "rejected" ? "destructive" : "secondary";
  const contractBadgeVariant = contractStatus === "approved" ? "default" : contractStatus === "rejected" ? "destructive" : "secondary";

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
                <Label>IBAN *</Label>
                <Input
                  value={iban}
                  onChange={(e) => { setIban(e.target.value); validateIban(e.target.value); }}
                  onBlur={() => validateIban(iban)}
                  placeholder="IT60 X054 2811 1010 0000 0123 456"
                  className={ibanError ? "border-destructive" : ""}
                />
                {ibanError && <p className="text-xs text-destructive">{ibanError}</p>}
                {!ibanError && iban && <p className="text-xs text-green-600">✓ IBAN valido</p>}
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
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {bankStatus === "verified" ? <ShieldCheck className="h-4 w-4 text-emerald-600" /> : <Clock3 className="h-4 w-4 text-amber-600" />}
                <div>
                  <p className="text-sm font-medium">Verifica conto corrente</p>
                  <p className="text-xs text-muted-foreground">
                    Ogni modifica dell'IBAN rimette il conto in verifica prima dei payout.
                  </p>
                </div>
              </div>
              <Badge variant={bankBadgeVariant}>{bankVerificationLabel(bankStatus)}</Badge>
            </div>
            {details.bank_verification?.rejection_reason && (
              <p className="mt-2 text-xs text-destructive">{details.bank_verification.rejection_reason}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Contract */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" /> Contratto Partner
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={contractBadgeVariant}>{contractApprovalLabel(contractStatus)}</Badge>
            {details.contract?.signed_at && (
              <span className="text-xs text-muted-foreground">
                Firmato il: {format(new Date(details.contract.signed_at), "dd/MM/yyyy")}
              </span>
            )}
          </div>
          {details.contract?.rejection_reason && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {details.contract.rejection_reason}
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            Il contratto regola commissioni, responsabilità, pagamenti, privacy e uso del marchio. Dopo la firma viene inviato al team per approvazione.
          </p>
          {contractStatus !== "approved" && (
            <div className="space-y-3 rounded-lg border p-3">
              <div className="space-y-1.5">
                <Label>Nome firmatario</Label>
                <Input value={contractSignerName} onChange={(e) => setContractSignerName(e.target.value)} placeholder="Nome e cognome / ragione sociale" />
              </div>
              <div className="flex items-start gap-3">
                <Checkbox
                  id="partner-contract-accept"
                  checked={contractAccepted}
                  onCheckedChange={(checked) => setContractAccepted(checked === true)}
                />
                <Label htmlFor="partner-contract-accept" className="cursor-pointer text-sm leading-relaxed">
                  Confermo di aver letto e accettato il contratto partner e autorizzo l'invio per approvazione.
                </Label>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => signContractMutation.mutate()}
                disabled={signContractMutation.isPending || !contractAccepted || !contractSignerName.trim()}
              >
                {signContractMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}
                Firma e invia per approvazione
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !!ibanError} className="w-full">
        {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
        Salva Profilo
      </Button>
    </div>
  );
}
