/**
 * Modal acquisto crediti SMS via Stripe.
 * Mostra pacchetti, processa pagamento, polling conferma.
 */
import { useState } from "react";
import { CheckCircle2, Loader2, Zap } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useSmsWallet } from "@/hooks/useSmsWallet";
import type { SmsPacchettoCrediti } from "@/types/sms-marketing";

interface SmsRicaricaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type RicaricaStep = "selezione" | "pagamento" | "conferma";

export function SmsRicaricaModal({ open, onOpenChange }: SmsRicaricaModalProps) {
  const { pacchetti, isLoadingPacchetti, creaRicarica, isRicaricando, wallet, pollingWalletAggiornato, refetchWallet } = useSmsWallet();

  const [step, setStep] = useState<RicaricaStep>("selezione");
  const [pacchettoScelto, setPacchettoScelto] = useState<SmsPacchettoCrediti | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [creditiAccreditati, setCreditiAccreditati] = useState<number>(0);
  const [isPrimaRicarica, setIsPrimaricarica] = useState(false);

  const handleSelezionaPacchetto = async (pacchetto: SmsPacchettoCrediti) => {
    setPacchettoScelto(pacchetto);
    try {
      const res = await creaRicarica(pacchetto.id);
      setClientSecret(res.client_secret);
      setCreditiAccreditati(res.crediti_da_accreditare);
      setIsPrimaricarica(!wallet?.ultima_ricarica_at);
      setStep("pagamento");
    } catch {
      // errore gestito dal hook
    }
  };

  // In produzione: usa Stripe Elements per il pagamento
  // Per demo/sviluppo: simuliamo il completamento
  const handleSimulaPagamento = async () => {
    if (!pacchettoScelto) return;
    toast.info("In produzione qui apparirà il form Stripe. Simulando accredito...");

    // Polling per vedere se i crediti vengono aggiornati
    const creditiAttuali = (wallet?.crediti ?? 0) + creditiAccreditati;
    const ok = await pollingWalletAggiornato(creditiAttuali);

    if (!ok) {
      // In sviluppo forziamo il refresh manuale
      refetchWallet();
    }
    setStep("conferma");
  };

  const handleClose = () => {
    setStep("selezione");
    setPacchettoScelto(null);
    setClientSecret(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ricarica crediti SMS</DialogTitle>
        </DialogHeader>

        {/* Step 1: Selezione pacchetto */}
        {step === "selezione" && (
          <div className="space-y-3">
            {isLoadingPacchetti ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
            ) : (
              pacchetti.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleSelezionaPacchetto(p)}
                  disabled={isRicaricando}
                  className={`w-full border rounded-lg p-4 text-left hover:bg-muted/50 transition-colors relative ${
                    p.evidenziato ? "border-primary" : ""
                  }`}
                >
                  {p.evidenziato && (
                    <Badge className="absolute -top-2 right-3 text-[10px] bg-primary">Consigliato</Badge>
                  )}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{p.nome}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {p.sms_stimati?.toLocaleString("it-IT")} SMS stimati
                        {p.bonus_percentuale > 0 && ` · +${p.bonus_percentuale}% bonus`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold">
                        {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(p.importo_eur)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        ≈ €{(p.importo_eur / (p.sms_stimati ?? 1)).toFixed(4)}/SMS
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        {/* Step 2: Pagamento (Stripe) */}
        {step === "pagamento" && pacchettoScelto && (
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pacchetto</span>
                <span className="font-medium">{pacchettoScelto.nome}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Crediti da accreditare</span>
                <span className="font-medium">
                  {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(creditiAccreditati)}
                </span>
              </div>
              <div className="border-t pt-2 flex justify-between">
                <span className="text-muted-foreground">Totale</span>
                <span className="font-bold">
                  {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(pacchettoScelto.importo_eur)}
                </span>
              </div>
            </div>
            <div className="border rounded-lg p-4 text-center text-sm text-muted-foreground bg-muted/30">
              <p className="font-medium mb-1">Form pagamento Stripe</p>
              <p className="text-xs">In produzione qui appare il form carta di credito</p>
              <p className="text-xs font-mono mt-1 break-all opacity-50">{clientSecret?.slice(0, 30)}...</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep("selezione")}>
                Indietro
              </Button>
              <Button className="flex-1" onClick={handleSimulaPagamento} disabled={isRicaricando}>
                {isRicaricando ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Paga {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(pacchettoScelto.importo_eur)}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Conferma */}
        {step === "conferma" && (
          <div className="text-center space-y-4 py-2">
            <div className="mx-auto w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7 text-emerald-600" />
            </div>
            <div>
              <p className="text-lg font-bold">Crediti accreditati!</p>
              <p className="text-muted-foreground text-sm mt-1">
                {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(creditiAccreditati)} aggiunti al tuo wallet
              </p>
            </div>
            {isPrimaRicarica && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-2 text-amber-700 text-sm">
                <Zap className="h-4 w-4 shrink-0" />
                <span>Hai ricevuto i crediti bonus per il primo acquisto!</span>
              </div>
            )}
            <Button className="w-full" onClick={handleClose}>
              Ottimo, chiudi
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
