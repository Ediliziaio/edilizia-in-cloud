// src/components/orders/generali/NuovaGeneraleDialog.tsx
// Una schermata, quattro campi: tipo, nome, committente (o società dell'operazione), valore.
// Il resto si completa dopo, dalla pagina della generale.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScegliCliente } from "@/components/orders/generali/ScegliCliente";
import { messaggioGenerale, useCreaGenerale } from "@/hooks/useCommesseGenerali";
import { leggiImporto } from "@/lib/controlloGestione/formatCG";
import { DEFINIZIONI_MODELLI, type ModelloGenerale } from "@/lib/orders/commesseGenerali";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** I modelli accesi dall'azienda; `iniziale` è quello scelto nella finestra precedente. */
  modelli: ModelloGenerale[];
  iniziale: ModelloGenerale | null;
}

export function NuovaGeneraleDialog({ open, onOpenChange, modelli, iniziale }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {/* Il modulo nasce a ogni apertura: si riparte sempre da campi vuoti. */}
        <Modulo onOpenChange={onOpenChange} modelli={modelli} iniziale={iniziale} />
      </DialogContent>
    </Dialog>
  );
}

function Modulo({ onOpenChange, modelli, iniziale }: Omit<Props, "open">) {
  const navigate = useNavigate();
  const crea = useCreaGenerale();
  const [modello, setModello] = useState<ModelloGenerale | null>(iniziale ?? modelli[0] ?? null);
  const [nome, setNome] = useState("");
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [valoreTesto, setValoreTesto] = useState("");

  const def = modello ? DEFINIZIONI_MODELLI[modello] : null;
  const valore = valoreTesto.trim() === "" ? null : leggiImporto(valoreTesto);
  const valoreSbagliato = valoreTesto.trim() !== "" && (valore === null || valore < 0);
  const puoCreare = !!modello && nome.trim().length > 0 && !valoreSbagliato && !crea.isPending;

  const conferma = () => {
    if (!modello || !puoCreare) return;
    crea.mutate(
      { modello, nome: nome.trim(), clienteId, valore },
      {
        onSuccess: (id) => {
          toast.success("Commessa generale creata", { description: `Ora aggiungi ${def?.figlia.tante.toLowerCase()}.` });
          onOpenChange(false);
          navigate(`/azienda/ordini/${id}`);
        },
        onError: (e) => toast.error(messaggioGenerale(e, "la commessa generale")),
      },
    );
  };

  return (
    <>
        <DialogHeader>
          <DialogTitle>Nuova commessa generale</DialogTitle>
          <DialogDescription>Raccoglie più commesse e ne somma i numeri. Le commesse dentro restano commesse normali.</DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => { e.preventDefault(); conferma(); }}
        >
          {modelli.length > 1 && (
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">Tipo</legend>
              <div className="grid gap-1.5 sm:grid-cols-3" role="radiogroup">
                {modelli.map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={modello === m}
                    onClick={() => setModello(m)}
                    className={cn(
                      "rounded-md border px-2.5 py-2 text-left text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      modello === m ? "border-primary bg-primary/5 text-foreground" : "text-muted-foreground hover:border-primary/50",
                    )}
                  >
                    {DEFINIZIONI_MODELLI[m].nome}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          {def && <p className="-mt-1 text-xs text-muted-foreground">{def.perChi}</p>}

          <div className="space-y-1.5">
            <Label htmlFor="generale-nome">Nome</Label>
            <Input id="generale-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder={def?.esempio ?? ""} autoFocus />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="generale-cliente">
              {def?.cliente.etichetta ?? "Cliente"} <span className="font-normal text-muted-foreground">(facoltativo)</span>
            </Label>
            <ScegliCliente id="generale-cliente" valore={clienteId} onCambia={setClienteId} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="generale-valore">
              {def?.valore.etichetta ?? "Valore"} <span className="font-normal text-muted-foreground">(facoltativo, al netto dell'IVA)</span>
            </Label>
            <Input
              id="generale-valore"
              inputMode="decimal"
              value={valoreTesto}
              onChange={(e) => setValoreTesto(e.target.value)}
              placeholder="es. 3.000.000"
              aria-invalid={valoreSbagliato || undefined}
              aria-describedby="generale-valore-aiuto"
            />
            <p id="generale-valore-aiuto" className={cn("text-xs", valoreSbagliato ? "text-destructive" : "text-muted-foreground")}>
              {valoreSbagliato ? "Scrivi un importo, ad esempio 3.000.000 o 2500,50." : def?.valore.aiuto}
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Annulla</Button>
            <Button type="submit" disabled={!puoCreare}>
              {crea.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Crea commessa generale
            </Button>
          </DialogFooter>
        </form>
    </>
  );
}
