import { useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useBillingActivationGate } from "@/hooks/useBillingActivationGate";
import { useStartCardSetup, useOpenBillingPortal } from "@/hooks/useBilling";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Building2, CreditCard, CheckCircle2, Loader2, Lock, LogOut, ShieldCheck, AlertTriangle,
} from "lucide-react";

/**
 * BillingActivationGuard — blocca l'intero gestionale finché l'azienda non ha
 * inserito i dati di fatturazione E una carta di pagamento (anche su piano free).
 *
 * Quando l'azienda è in regola passa i children (il gestionale). Altrimenti
 * mostra una schermata di attivazione a tutto schermo:
 *  - company_admin → form dati fatturazione + CTA "Aggiungi carta"
 *  - altri ruoli   → messaggio "contatta l'amministratore" + logout
 */

interface BillingFields {
  business_name: string;
  vat_number: string;
  fiscal_code: string;
  pec: string;
  sdi_code: string;
  legal_address: string;
  legal_city: string;
  legal_postal_code: string;
  legal_province: string;
}

/**
 * Chi lavora su piu' aziende non deve restare in trappola.
 *
 * Il guard sostituisce TUTTA l'app, sidebar compresa: se l'azienda attiva e'
 * bloccata, il selettore aziende non e' piu' raggiungibile e l'unico bottone
 * e' «Esci». Ma la scelta dell'azienda vive anche in `active_company_selection`
 * lato database, quindi al rientro si ricade sulla stessa schermata: uscire non
 * serve a niente. Successo l'8 settembre 2026 a pratiche@greenenergygroup.it,
 * passata su Energia Piu' (abbonamento scaduto il 23 agosto) e rimasta fuori
 * anche da Green Energy, che era regolare.
 */
function AltreAziende() {
  const { multiCompanyAccesses, selectedMultiCompanyId, switchMultiCompany } = useAuth();
  const altre = multiCompanyAccesses.filter((a) => a.company_id !== selectedMultiCompanyId);
  if (altre.length === 0) return null;

  return (
    <div className="mt-2 flex w-full flex-col gap-1.5 border-t pt-3">
      <p className="text-xs text-muted-foreground">Hai accesso anche a:</p>
      {altre.map((a) => (
        <Button
          key={a.company_id}
          variant="secondary"
          size="sm"
          className="w-full"
          onClick={() => switchMultiCompany(a.company_id)}
        >
          <Building2 className="mr-2 h-4 w-4" />
          Passa a {a.company?.name ?? "un'altra azienda"}
        </Button>
      ))}
    </div>
  );
}

function StepBadge({ done, n }: { done: boolean; n: number }) {
  return done ? (
    <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" />
  ) : (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-muted-foreground/40 text-xs font-semibold text-muted-foreground">
      {n}
    </span>
  );
}

function BillingDataForm({
  companyId,
  initial,
  done,
}: {
  companyId: string;
  initial: Partial<BillingFields>;
  done: boolean;
}) {
  const { refreshAuth } = useAuth();
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState<BillingFields>({
    business_name: initial.business_name ?? "",
    vat_number: initial.vat_number ?? "",
    fiscal_code: initial.fiscal_code ?? "",
    pec: initial.pec ?? "",
    sdi_code: initial.sdi_code ?? "",
    legal_address: initial.legal_address ?? "",
    legal_city: initial.legal_city ?? "",
    legal_postal_code: initial.legal_postal_code ?? "",
    legal_province: initial.legal_province ?? "",
  });

  const set = (k: keyof BillingFields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }));

  const missingRequired =
    !f.business_name.trim() || !f.vat_number.trim() || !f.legal_address.trim() ||
    !f.legal_city.trim() || !f.legal_postal_code.trim();

  const handleSave = async () => {
    if (missingRequired) {
      toast.error("Compila tutti i campi obbligatori (*)");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("companies")
        .update({
          business_name: f.business_name.trim(),
          vat_number: f.vat_number.trim(),
          fiscal_code: f.fiscal_code.trim() || null,
          pec: f.pec.trim() || null,
          sdi_code: f.sdi_code.trim() || null,
          legal_address: f.legal_address.trim(),
          legal_city: f.legal_city.trim(),
          legal_postal_code: f.legal_postal_code.trim(),
          legal_province: f.legal_province.trim() || null,
        })
        .eq("id", companyId);
      if (error) throw error;
      toast.success("Dati di fatturazione salvati");
      await refreshAuth();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore nel salvataggio";
      toast.error("Impossibile salvare i dati", { description: msg });
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <p className="text-sm text-muted-foreground">
        Dati di fatturazione completi: <strong>{initial.business_name}</strong> · P.IVA {initial.vat_number}.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">Ragione sociale *</Label>
        <Input value={f.business_name} onChange={set("business_name")} placeholder="Es. Rossi Costruzioni S.r.l." className="h-9 text-sm" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Partita IVA *</Label>
          <Input value={f.vat_number} onChange={set("vat_number")} placeholder="IT01234567890" className="h-9 text-sm" inputMode="numeric" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Codice fiscale</Label>
          <Input value={f.fiscal_code} onChange={set("fiscal_code")} className="h-9 text-sm" />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Indirizzo sede legale *</Label>
        <Input value={f.legal_address} onChange={set("legal_address")} placeholder="Via e numero civico" className="h-9 text-sm" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="space-y-1 col-span-1 sm:col-span-2">
          <Label className="text-xs">Città *</Label>
          <Input value={f.legal_city} onChange={set("legal_city")} className="h-9 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">CAP *</Label>
          <Input value={f.legal_postal_code} onChange={set("legal_postal_code")} className="h-9 text-sm" inputMode="numeric" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Prov.</Label>
          <Input value={f.legal_province} onChange={set("legal_province")} placeholder="MI" maxLength={2} className="h-9 text-sm uppercase" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">PEC</Label>
          <Input value={f.pec} onChange={set("pec")} className="h-9 text-sm" inputMode="email" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Codice destinatario (SDI)</Label>
          <Input value={f.sdi_code} onChange={set("sdi_code")} className="h-9 text-sm" />
        </div>
      </div>
      <Button onClick={handleSave} disabled={saving || missingRequired} className="w-full sm:w-auto">
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Salva dati di fatturazione
      </Button>
    </div>
  );
}

function PaymentStep({ done }: { done: boolean; companyId?: string; method: string }) {
  const startSetup = useStartCardSetup();

  if (done) {
    return <p className="text-sm text-muted-foreground">Carta registrata. ✔</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Registra una <strong>carta</strong>: l'incasso è automatico. Nessun addebito finché non usi strumenti a consumo.
      </p>
      <Button onClick={() => startSetup.mutate()} disabled={startSetup.isPending} className="w-full sm:w-auto">
        <CreditCard className="mr-2 h-4 w-4" />
        {startSetup.isPending ? "Apertura…" : "Aggiungi carta"}
      </Button>
    </div>
  );
}

export function BillingActivationGuard({ children }: { children: ReactNode }) {
  const { effectiveCompany, signOut } = useAuth();
  const { isBlocked, needsBillingData, needsPaymentMethod, subscriptionExpired, canManage } = useBillingActivationGate();
  const openPortal = useOpenBillingPortal();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = effectiveCompany as any;
  const initial = useMemo<Partial<BillingFields>>(() => ({
    business_name: c?.business_name ?? "",
    vat_number: c?.vat_number ?? "",
    fiscal_code: c?.fiscal_code ?? "",
    pec: c?.pec ?? "",
    sdi_code: c?.sdi_code ?? "",
    legal_address: c?.legal_address ?? "",
    legal_city: c?.legal_city ?? "",
    legal_postal_code: c?.legal_postal_code ?? "",
    legal_province: c?.legal_province ?? "",
  }), [c]);

  if (!isBlocked) return <>{children}</>;

  // ── Lockout duro: abbonamento scaduto/cancellato (chi non paga più) ──
  if (subscriptionExpired) {
    return (
      <div className="min-h-[100dvh] w-full flex items-center justify-center bg-muted/30 px-4 py-8">
        <Card className="w-full max-w-md border-destructive/30">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-7 w-7 text-destructive" />
            </div>
            <h1 className="text-xl font-semibold">Abbonamento scaduto</h1>
            <p className="text-sm text-muted-foreground">
              Il tuo abbonamento non è più attivo e il gestionale è bloccato.
              {canManage
                ? " Rinnova per riattivare subito la piattaforma e i tuoi dati."
                : " Contatta l'amministratore della tua azienda per rinnovare."}
            </p>
            {canManage && (
              <Button className="mt-2 w-full" onClick={() => openPortal.mutate()} disabled={openPortal.isPending}>
                {openPortal.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
                Rinnova abbonamento
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => signOut()} className="mt-1">
              <LogOut className="mr-2 h-4 w-4" /> Esci
            </Button>
            <AltreAziende />
          </CardContent>
        </Card>
      </div>
    );
  }

  const billingDone = !needsBillingData;
  const paymentDone = !needsPaymentMethod;

  return (
    <div className="min-h-[100dvh] w-full overflow-y-auto bg-muted/30 px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-5">
        {/* Intestazione */}
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <ShieldCheck className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-xl font-semibold">Completa l'attivazione dell'azienda</h1>
          <p className="text-sm text-muted-foreground">
            Per usare il gestionale servono i dati di fatturazione e un metodo di pagamento.
            {" "}È richiesto anche con il piano gratuito; nessun addebito finché non usi servizi a consumo.
          </p>
        </div>

        {!canManage ? (
          /* Utente non-admin: non può completare → contatta l'amministratore */
          <Card className="border-amber-300 bg-amber-50/70">
            <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
              <Lock className="h-8 w-8 text-amber-600" />
              <p className="font-semibold">Attivazione non ancora completata</p>
              <p className="text-sm text-muted-foreground">
                L'amministratore della tua azienda deve inserire i dati di fatturazione e la
                carta di pagamento per attivare il gestionale. Contattalo per procedere.
              </p>
              <Button variant="outline" size="sm" onClick={() => signOut()} className="mt-1">
                <LogOut className="mr-2 h-4 w-4" /> Esci
              </Button>
              <AltreAziende />
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Step 1 — Dati di fatturazione */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <StepBadge done={billingDone} n={1} />
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  Dati di fatturazione
                </CardTitle>
              </CardHeader>
              <CardContent>
                {effectiveCompany?.id && (
                  <BillingDataForm companyId={effectiveCompany.id} initial={initial} done={billingDone} />
                )}
              </CardContent>
            </Card>

            {/* Step 2 — Metodo di pagamento */}
            <Card className={billingDone ? "" : "opacity-90"}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <StepBadge done={paymentDone} n={2} />
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  Metodo di pagamento
                </CardTitle>
              </CardHeader>
              <CardContent>
                <PaymentStep
                  done={paymentDone}
                  companyId={effectiveCompany?.id}
                  method={String(c?.payment_method ?? "none").toLowerCase()}
                />
              </CardContent>
            </Card>

            <div className="flex items-center justify-between pt-1">
              <p className="text-xs text-muted-foreground">
                Una volta completati entrambi i passaggi, il gestionale si sblocca automaticamente.
              </p>
              <Button variant="ghost" size="sm" onClick={() => signOut()}>
                <LogOut className="mr-2 h-4 w-4" /> Esci
              </Button>
            </div>
            <AltreAziende />
          </>
        )}
      </div>
    </div>
  );
}

export default BillingActivationGuard;
