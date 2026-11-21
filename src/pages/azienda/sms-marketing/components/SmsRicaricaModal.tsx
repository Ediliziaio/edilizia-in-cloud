import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useSmsWallet } from "@/hooks/useSmsWallet";
import { formatCurrency } from "@/lib/formatters";
import { isMobileAppRuntime } from "@/lib/mobile/platform";
import { safeRedirect } from "@/utils/safeRedirect";

interface SmsRicaricaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SmsRicaricaModal({ open, onOpenChange }: SmsRicaricaModalProps) {
  const { pacchetti, isLoadingPacchetti, errorePacchetti, ricaricaPacchetti, creaRicarica, isRicaricando } = useSmsWallet();
  const tentativo = useRef<{ pacchetto: string; id: string } | null>(null);
  const invioInCorso = useRef(false);
  const [pacchettoInAttesa, setPacchettoInAttesa] = useState<string | null>(null);

  async function apriPagamento(pacchetto: string) {
    if (invioInCorso.current) return;
    invioInCorso.current = true;
    setPacchettoInAttesa(pacchetto);
    if (tentativo.current?.pacchetto !== pacchetto) {
      tentativo.current = { pacchetto, id: crypto.randomUUID() };
    }
    try {
      const sessione = await creaRicarica({ pacchetto_id: pacchetto, operazione_id: tentativo.current.id });
      const url = new URL(sessione.url);
      if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com") {
        throw new Error("Indirizzo del pagamento non valido. Riprova.");
      }
      safeRedirect(url.href);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossibile aprire il pagamento. Riprova.");
    } finally {
      invioInCorso.current = false;
      setPacchettoInAttesa(null);
    }
  }

  function cambiaApertura(value: boolean) {
    if (invioInCorso.current) return;
    if (!value) tentativo.current = null;
    onOpenChange(value);
  }

  return (
    <Dialog open={open} onOpenChange={cambiaApertura}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ricarica crediti SMS</DialogTitle>
          <DialogDescription>
            {isMobileAppRuntime
              ? "La ricarica dei crediti SMS è disponibile nell’area riservata sul sito web."
              : "Scegli un pacchetto per pagare su Stripe. Il saldo si aggiorna quando l’accredito è registrato."}
          </DialogDescription>
        </DialogHeader>
        {!isMobileAppRuntime && (
          <div className="space-y-3" aria-busy={isRicaricando}>
            {isLoadingPacchetti && Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-20 w-full" />)}
            {errorePacchetti && (
              <div className="flex items-center justify-between gap-2 text-sm" role="alert">
                <span>Impossibile caricare i pacchetti SMS.</span>
                <Button size="sm" variant="outline" onClick={() => void ricaricaPacchetti()}>Riprova</Button>
              </div>
            )}
            {!isLoadingPacchetti && !errorePacchetti && pacchetti.length === 0 && (
              <p className="text-sm text-muted-foreground">Al momento non ci sono pacchetti disponibili.</p>
            )}
            {pacchetti.map((p) => (
              <button key={p.id} type="button" disabled={isRicaricando} onClick={() => void apriPagamento(p.id)}
                className="flex w-full items-center justify-between gap-4 rounded-lg border bg-background p-4 text-left hover:border-primary/60 disabled:opacity-60">
                <span>
                  <span className="block font-semibold">{p.nome}</span>
                  <span className="block text-xs text-muted-foreground">
                    {p.sms_stimati ? `${p.sms_stimati.toLocaleString("it-IT")} SMS stimati` : "Crediti SMS"}
                    {p.bonus_percentuale > 0 && ` · +${p.bonus_percentuale}% bonus`}
                  </span>
                  {p.evidenziato && <Badge variant="secondary" className="mt-1">Consigliato</Badge>}
                </span>
                <span className="flex flex-col items-end gap-1">
                  <span className="font-semibold">{formatCurrency(p.importo_eur)}</span>
                  {p.sms_stimati && p.sms_stimati > 0 && (
                    <span className="text-xs text-muted-foreground">
                      Circa {(p.importo_eur / p.sms_stimati).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} €/SMS
                    </span>
                  )}
                  {pacchettoInAttesa === p.id && <Loader2 className="h-4 w-4 animate-spin" aria-label="Apertura pagamento" />}
                </span>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
