// MP-FINAL — Wizard Connect Number 3 step canonico (da masterprompt MP04).
// Step 1: scegli purpose
// Step 2: scegli modalità: Embedded Signup (rapido, consigliato) OPPURE manuale
//         (numero, phone_id, waba, token)
// Step 3: riepilogo + conferma (solo modalità manuale; Embedded chiude al volo)

import { useEffect, useState } from "react";
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
import { ArrowLeft, ArrowRight, Info, Loader2, Sparkles, KeyRound } from "lucide-react";
import {
  PURPOSE_LABELS,
  useConnectWANumber,
  useWhatsAppNumbersByPurpose,
  type WAPurpose,
} from "@/hooks/whatsapp/useWhatsAppNumbers";
import { PurposeSelector } from "./PurposeSelector";
import { WhatsAppEmbeddedSignupButton } from "./WhatsAppEmbeddedSignupButton";
import { isEmbeddedSignupSupported } from "@/hooks/whatsapp/useWhatsAppEmbeddedSignup";

type ConnectMode = "embedded" | "manual";

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

  // Su mobile (Capacitor) il flusso embedded non funziona → default manuale.
  const defaultMode: ConnectMode = isEmbeddedSignupSupported ? "embedded" : "manual";

  const [step, setStep] = useState<Step>(initialPurpose ? 2 : 1);
  const [purpose, setPurpose] = useState<WAPurpose | null>(initialPurpose ?? null);
  const [mode, setMode] = useState<ConnectMode>(defaultMode);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [displayName, setDisplayName] = useState("");

  const connect = useConnectWANumber();

  useEffect(() => {
    if (!open) return;
    setPurpose(initialPurpose ?? null);
    setStep(initialPurpose ? 2 : 1);
    setMode(defaultMode);
  }, [open, initialPurpose, defaultMode]);

  const reset = () => {
    setStep(1);
    setPurpose(null);
    setMode(defaultMode);
    setPhoneNumber("");
    setPhoneNumberId("");
    setWabaId("");
    setAccessToken("");
    setDisplayName("");
  };

  const canNext = (): boolean => {
    if (step === 1) return purpose !== null && !disabledPurposes.includes(purpose);
    if (step === 2) {
      if (mode === "embedded") return false; // Embedded chiude direttamente al success
      return !!(purpose && !disabledPurposes.includes(purpose) && phoneNumber && phoneNumberId && wabaId && accessToken);
    }
    return true;
  };

  const submit = () => {
    if (!purpose || disabledPurposes.includes(purpose)) return;
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
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-2xl overflow-y-auto p-4 sm:p-6">
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
            {/* Toggle modalità: visibile solo su web. Su Capacitor mobile
                il flusso Embedded non funziona (popup FB.login esterna +
                postMessage non raggiunge la webview), quindi mostriamo
                un banner informativo e teniamo sempre il flusso manuale. */}
            {isEmbeddedSignupSupported ? (
              <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/40 p-1">
                <button
                  type="button"
                  onClick={() => setMode("embedded")}
                  className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition ${mode === "embedded" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <Sparkles className="h-4 w-4" />
                  Collegamento guidato con Meta
                  <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                    consigliato
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode("manual")}
                  className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition ${mode === "manual" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <KeyRound className="h-4 w-4" />
                  Con i codici di Meta (avanzato)
                </button>
              </div>
            ) : (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Da questa app il collegamento guidato con Meta non è disponibile. Inserisci a mano i
                  codici di Meta (Phone Number ID e Access Token), oppure completa il collegamento dal
                  browser del computer.
                </AlertDescription>
              </Alert>
            )}

            {mode === "embedded" && purpose && (
              <div className="space-y-4 py-2 text-center">
                <div className="mx-auto w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
                  <Sparkles className="h-6 w-6 text-emerald-600" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">Collegamento rapido con Meta</p>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    Si apre una finestra ufficiale di Meta dove scegli l'account WhatsApp Business,
                    verifichi il numero e completi il collegamento senza copiare codici. Alla fine il
                    numero risulta «in attesa di verifica» finché Meta non conferma il collegamento.
                  </p>
                </div>
                <div className="space-y-2 text-left">
                  <Label htmlFor="wz-display-emb">Nome visualizzato (opzionale)</Label>
                  <Input
                    id="wz-display-emb"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Bot Cantieri Rossi Srl"
                  />
                </div>
                <WhatsAppEmbeddedSignupButton
                  purpose={purpose}
                  displayName={displayName || undefined}
                  onSuccess={() => {
                    onClose();
                    reset();
                  }}
                  className="w-full"
                />
                <p className="text-[11px] text-muted-foreground">
                  Se non funziona, scegli «Con i codici di Meta».
                </p>
              </div>
            )}

            {mode === "manual" && (
              <>
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Questi dati si trovano in <b>Meta Business Manager → WhatsApp → Configurazione API</b>.
                Per un numero vero conviene il collegamento guidato (la scelta qui sopra).
                Il token viene salvato cifrato sul server.
              </AlertDescription>
            </Alert>
            <div className="space-y-1">
              <Label htmlFor="wz-phone">Numero (con il prefisso, per esempio +39…)</Label>
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
              </>
            )}
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
                  <li>Nome: {displayName || "(vuoto)"}</li>
                </ul>
                <p className="text-xs text-muted-foreground mt-2">
                  Il numero risulta «in attesa di verifica». Quando Meta conferma il collegamento diventa «attivo».
                </p>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep((s) => ((s - 1) as Step))}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Indietro
            </Button>
          )}
          {/* In modalità Embedded a step 2 il CTA è dentro il pannello (FB.login),
              non serve "Avanti". Per gli altri casi mostro Avanti/Connetti. */}
          {!(step === 2 && mode === "embedded") && (
            step < 3 ? (
              <Button disabled={!canNext()} onClick={() => setStep((s) => ((s + 1) as Step))}>
                Avanti
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button disabled={connect.isPending} onClick={submit}>
                {connect.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Connetti
              </Button>
            )
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
