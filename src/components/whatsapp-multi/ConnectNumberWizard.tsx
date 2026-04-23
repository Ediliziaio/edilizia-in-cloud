// MP-FINAL — Wizard Connect Number 3 step canonico (da masterprompt MP04).
// Step 1: scegli purpose
// Step 2: inserisci dati Meta (numero, phone_id, waba, token, display_name)
// Step 3: riepilogo + conferma

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, ArrowRight, Info, Loader2 } from "lucide-react";
import {
  PURPOSE_LABELS,
  useConnectWANumber,
  useWhatsAppNumbersByPurpose,
  type WAPurpose,
} from "@/hooks/whatsapp/useWhatsAppNumbers";
import { PurposeSelector } from "./PurposeSelector";

type Step = 1 | 2 | 3;

interface Props {
  open: boolean;
  onClose: () => void;
  initialPurpose?: WAPurpose;
}

export function ConnectNumberWizard({ open, onClose, initialPurpose }: Props) {
  const { byPurpose } = useWhatsAppNumbersByPurpose();
  const disabledPurposes = (Object.keys(byPurpose) as WAPurpose[]).filter(
    (p) => (byPurpose[p] ?? []).length > 0,
  );

  const [step, setStep] = useState<Step>(initialPurpose ? 2 : 1);
  const [purpose, setPurpose] = useState<WAPurpose | null>(initialPurpose ?? null);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [displayName, setDisplayName] = useState("");

  const connect = useConnectWANumber();

  const reset = () => {
    setStep(1);
    setPurpose(null);
    setPhoneNumber("");
    setPhoneNumberId("");
    setWabaId("");
    setAccessToken("");
    setDisplayName("");
  };

  const canNext = (): boolean => {
    if (step === 1) return purpose !== null;
    if (step === 2) return !!(phoneNumber && phoneNumberId && wabaId && accessToken);
    return true;
  };

  const submit = () => {
    if (!purpose) return;
    connect.mutate(
      {
        purpose,
        phone_number: phoneNumber,
        phone_number_id: phoneNumberId,
        waba_id: wabaId,
        access_token: accessToken,
        display_name: displayName || undefined,
      },
      {
        onSuccess: () => {
          onClose();
          reset();
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          reset();
        }
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Collega nuovo numero WhatsApp — Step {step} di 3</DialogTitle>
          <DialogDescription>
            {step === 1 && "Scegli lo scopo del numero."}
            {step === 2 && "Inserisci i dati Meta Business Manager."}
            {step === 3 && "Riepilogo prima di registrare."}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <PurposeSelector
            selected={purpose}
            onSelect={setPurpose}
            disabledPurposes={disabledPurposes}
          />
        )}

        {step === 2 && (
          <div className="space-y-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Questi dati si trovano in <b>Meta Business Manager → WhatsApp → API setup</b>.
                In produzione preferisci il flusso OAuth Embedded Signup (via pagina Impostazioni).
                Inserimento manuale qui è pensato per staging/test.
              </AlertDescription>
            </Alert>
            <div className="space-y-1">
              <Label htmlFor="wz-phone">Numero (formato E.164)</Label>
              <Input
                id="wz-phone"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+390212345678"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="wz-pid">Phone Number ID</Label>
              <Input
                id="wz-pid"
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                placeholder="1234567890"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="wz-waba">WABA ID</Label>
              <Input
                id="wz-waba"
                value={wabaId}
                onChange={(e) => setWabaId(e.target.value)}
                placeholder="9876543210"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="wz-token">Access Token permanente</Label>
              <Textarea
                id="wz-token"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                rows={3}
                placeholder="EAAG..."
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="wz-display">Nome visualizzato (opzionale)</Label>
              <Input
                id="wz-display"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Bot Cantieri Rossi Srl"
              />
            </div>
          </div>
        )}

        {step === 3 && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <div className="text-sm space-y-1">
                <p><b>Riepilogo</b></p>
                <ul className="list-disc pl-5 space-y-0.5 text-xs">
                  <li>Scopo: <b>{purpose ? PURPOSE_LABELS[purpose] : "—"}</b></li>
                  <li>Numero: {phoneNumber || "—"}</li>
                  <li>Phone ID: <code>{phoneNumberId || "—"}</code></li>
                  <li>WABA: <code>{wabaId || "—"}</code></li>
                  <li>Display: {displayName || "(vuoto)"}</li>
                </ul>
                <p className="text-xs text-muted-foreground mt-2">
                  Il numero viene registrato in stato <code>pending</code>.
                  Dopo la verifica webhook da Meta passerà ad <code>active</code>.
                </p>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter className="gap-2">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep((s) => ((s - 1) as Step))}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Indietro
            </Button>
          )}
          {step < 3 ? (
            <Button disabled={!canNext()} onClick={() => setStep((s) => ((s + 1) as Step))}>
              Avanti
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button disabled={connect.isPending} onClick={submit}>
              {connect.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Connetti
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
