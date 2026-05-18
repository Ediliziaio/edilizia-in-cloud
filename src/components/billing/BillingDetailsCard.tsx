/**
 * BillingDetailsCard — v8.6.58
 *
 * Form per inserire/modificare i dati di fatturazione del cliente,
 * che possono differire dall'anagrafica company (es. holding paga per
 * sussidiaria, P.IVA diversa, indirizzo legale diverso).
 *
 * Persistenza: company_billing_details (1:1 con companies).
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Receipt, Save, Info, Loader2 } from "lucide-react";
import { useBillingDetails, useSaveBillingDetails, type BillingDetailsInput } from "@/hooks/useBillingDetails";

const EMPTY: BillingDetailsInput = {
  legal_name: "",
  vat_number: "",
  tax_code: "",
  address_line1: "",
  address_line2: "",
  postal_code: "",
  city: "",
  province: "",
  country: "IT",
  pec: "",
  sdi_code: "",
  invoice_email: "",
  payment_method: "card",
};

export function BillingDetailsCard() {
  const { data, isLoading } = useBillingDetails();
  const save = useSaveBillingDetails();
  const [form, setForm] = useState<BillingDetailsInput>(EMPTY);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data) {
      setForm({
        legal_name: data.legal_name ?? "",
        vat_number: data.vat_number ?? "",
        tax_code: data.tax_code ?? "",
        address_line1: data.address_line1 ?? "",
        address_line2: data.address_line2 ?? "",
        postal_code: data.postal_code ?? "",
        city: data.city ?? "",
        province: data.province ?? "",
        country: data.country ?? "IT",
        pec: data.pec ?? "",
        sdi_code: data.sdi_code ?? "",
        invoice_email: data.invoice_email ?? "",
        payment_method: data.payment_method ?? "card",
      });
      setDirty(false);
    }
  }, [data]);

  const update = (k: keyof BillingDetailsInput, v: string | null) => {
    setForm((p) => ({ ...p, [k]: v }));
    setDirty(true);
  };

  const handleSave = () => {
    save.mutate(form, { onSuccess: () => setDirty(false) });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Receipt className="h-5 w-5 text-muted-foreground" />
          <CardTitle>Dati di fatturazione</CardTitle>
        </div>
        <CardDescription>
          Anagrafica fiscale per le fatture EdiliziaInCloud — può differire dall'anagrafica aziendale del profilo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-2/3" />
          </div>
        ) : (
          <>
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Questi dati vengono usati per emettere le fatture del tuo abbonamento.
                I metodi di pagamento (carta) si gestiscono dal portale Stripe sotto.
              </AlertDescription>
            </Alert>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="bd-legal-name">Ragione sociale / Nome*</Label>
                <Input
                  id="bd-legal-name"
                  value={form.legal_name ?? ""}
                  onChange={(e) => update("legal_name", e.target.value)}
                  placeholder="es. Rossi Costruzioni S.r.l."
                  maxLength={200}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="bd-vat">Partita IVA</Label>
                <Input
                  id="bd-vat"
                  value={form.vat_number ?? ""}
                  onChange={(e) => update("vat_number", e.target.value)}
                  placeholder="IT12345678901"
                  maxLength={20}
                />
                <p className="text-[10px] text-muted-foreground">Per ditte individuali: solo Codice Fiscale</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="bd-cf">Codice Fiscale</Label>
                <Input
                  id="bd-cf"
                  value={form.tax_code ?? ""}
                  onChange={(e) => update("tax_code", e.target.value.toUpperCase())}
                  placeholder="RSSMRA80A01H501Z"
                  maxLength={16}
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="bd-addr1">Indirizzo*</Label>
                <Input
                  id="bd-addr1"
                  value={form.address_line1 ?? ""}
                  onChange={(e) => update("address_line1", e.target.value)}
                  placeholder="Via Roma 12"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="bd-addr2">Indirizzo (riga 2)</Label>
                <Input
                  id="bd-addr2"
                  value={form.address_line2 ?? ""}
                  onChange={(e) => update("address_line2", e.target.value)}
                  placeholder="Scala B, Interno 5 (opzionale)"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="bd-cap">CAP*</Label>
                <Input
                  id="bd-cap"
                  value={form.postal_code ?? ""}
                  onChange={(e) => update("postal_code", e.target.value)}
                  placeholder="20100"
                  maxLength={10}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="bd-city">Città*</Label>
                <Input
                  id="bd-city"
                  value={form.city ?? ""}
                  onChange={(e) => update("city", e.target.value)}
                  placeholder="Milano"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="bd-prov">Provincia (sigla)*</Label>
                <Input
                  id="bd-prov"
                  value={form.province ?? ""}
                  onChange={(e) => update("province", e.target.value.toUpperCase().slice(0, 2))}
                  placeholder="MI"
                  maxLength={2}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="bd-country">Paese</Label>
                <Select
                  value={form.country ?? "IT"}
                  onValueChange={(v) => update("country", v)}
                >
                  <SelectTrigger id="bd-country">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IT">Italia</SelectItem>
                    <SelectItem value="SM">San Marino</SelectItem>
                    <SelectItem value="CH">Svizzera</SelectItem>
                    <SelectItem value="FR">Francia</SelectItem>
                    <SelectItem value="DE">Germania</SelectItem>
                    <SelectItem value="ES">Spagna</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="pt-3 border-t space-y-3">
              <h4 className="text-sm font-semibold">Contatti fiscali (per Italia)</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="bd-pec">PEC</Label>
                  <Input
                    id="bd-pec"
                    type="email"
                    value={form.pec ?? ""}
                    onChange={(e) => update("pec", e.target.value)}
                    placeholder="azienda@pec.it"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="bd-sdi">Codice destinatario SDI</Label>
                  <Input
                    id="bd-sdi"
                    value={form.sdi_code ?? ""}
                    onChange={(e) => update("sdi_code", e.target.value.toUpperCase())}
                    placeholder="0000000 oppure 7 caratteri"
                    maxLength={7}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Lascia "0000000" se ricevi via PEC
                  </p>
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="bd-inv-email">Email per copia PDF fattura (opzionale)</Label>
                  <Input
                    id="bd-inv-email"
                    type="email"
                    value={form.invoice_email ?? ""}
                    onChange={(e) => update("invoice_email", e.target.value)}
                    placeholder="amministrazione@tuaazienda.it"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t">
              {dirty && (
                <span className="text-xs text-amber-600 mr-auto">
                  • Modifiche non salvate
                </span>
              )}
              <Button
                onClick={handleSave}
                disabled={!dirty || save.isPending}
              >
                {save.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-1.5" />
                )}
                Salva dati fatturazione
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
