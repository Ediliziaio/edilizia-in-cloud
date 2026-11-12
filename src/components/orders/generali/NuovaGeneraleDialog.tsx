// src/components/orders/generali/NuovaGeneraleDialog.tsx
// Una schermata: tipo, nome, committente (o società dell'operazione), valore. Si può partire già
// pronti: unità preparate e piano con le voci tipiche. Il resto si completa dalla pagina della generale.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogContentGenerale as DialogContent } from "@/components/orders/generali/design/DialogGenerale";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScegliCliente } from "@/components/orders/generali/ScegliCliente";
import { Switch } from "@/components/ui/switch";
import { useAvviaGenerale } from "@/hooks/useAvviaGenerale";
import { usePermissions } from "@/hooks/usePermissions";
import { messaggioGenerale } from "@/hooks/useCommesseGenerali";
import { leggiQuanteUnita, meseCorrente, unitaDiPartenza } from "@/lib/orders/generali/avvio";
import { vociDiPartenza } from "@/lib/orders/generali/pianoCategorie";
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
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        {/* Il modulo nasce a ogni apertura: si riparte sempre da campi vuoti. */}
        <Modulo onOpenChange={onOpenChange} modelli={modelli} iniziale={iniziale} />
      </DialogContent>
    </Dialog>
  );
}

function Modulo({ onOpenChange, modelli, iniziale }: Omit<Props, "open">) {
  const navigate = useNavigate();
  const crea = useAvviaGenerale();
  // Il piano è dentro il permesso sui margini: chi non lo ha non può prepararlo.
  const permessi = usePermissions();
  const puoFarePiano = !!permessi.canViewMargins || !!permessi.isAdmin;
  const [modello, setModello] = useState<ModelloGenerale | null>(iniziale ?? modelli[0] ?? null);
  const [nome, setNome] = useState("");
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [valoreTesto, setValoreTesto] = useState("");
  const [quanteTesto, setQuanteTesto] = useState("");
  const [conPiano, setConPiano] = useState(true);
  const [originePiano, setOriginePiano] = useState<"tipiche" | "excel">("tipiche");
  const [importaContratto, setImportaContratto] = useState(false);

  const def = modello ? DEFINIZIONI_MODELLI[modello] : null;
  const valore = valoreTesto.trim() === "" ? null : leggiImporto(valoreTesto);
  const valoreSbagliato = valoreTesto.trim() !== "" && (valore === null || valore < 0);
  const conUnita = modello === "sviluppo" || modello === "compravendita";
  const quante = conUnita ? leggiQuanteUnita(quanteTesto) : 0;
  const puoCreare = !!modello && nome.trim().length > 0 && !valoreSbagliato && quante !== null && !crea.isPending;

  const conferma = () => {
    if (!modello || !puoCreare) return;
    crea.mutate(
      {
        nuova: { modello, nome: nome.trim(), clienteId, valore },
        unita: unitaDiPartenza(quante ?? 0),
        voci: conPiano && puoFarePiano && originePiano === "tipiche" ? vociDiPartenza(modello, meseCorrente(), valore) : null,
      },
      {
        onSuccess: ({ id, rimasti }) => {
          if (rimasti.length > 0) {
            toast.warning("Commessa generale creata", { description: `Non sono riuscito a preparare ${rimasti.map((x) => (x === "unita" ? "le unità" : "il piano")).join(" e ")}: fallo dalla sua pagina.` });
          } else {
            toast.success("Commessa generale creata");
          }
          onOpenChange(false);
          navigate(`/azienda/ordini/${id}${modello === "appalto" && importaContratto ? "?scheda=contratto&importa-contratto=1" : conPiano && puoFarePiano && originePiano === "excel" ? "?scheda=piano&importa=1" : ""}`);
        },
        onError: (e) => toast.error(messaggioGenerale(e, "la commessa generale")),
      },
    );
  };

  return (
    <>
        <DialogHeader>
          <DialogTitle>Nuova commessa generale</DialogTitle>
          <DialogDescription>Gestisci budget, documenti e lavoro dell'intera operazione. Puoi aggiungere le unità o collegare le commesse anche in seguito.</DialogDescription>
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
            {conUnita && <p className="text-xs text-muted-foreground">È un riferimento dell'anagrafica clienti. La commessa e i documenti appartengono all'azienda attiva nel gestionale.</p>}
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

          {conUnita && (
            <div className="space-y-1.5">
              <Label htmlFor="generale-quante">Quante unità? <span className="font-normal text-muted-foreground">(facoltativo)</span></Label>
              <Input
                id="generale-quante"
                inputMode="numeric"
                value={quanteTesto}
                onChange={(e) => setQuanteTesto(e.target.value)}
                placeholder="es. 6"
                className="w-28"
                aria-invalid={quante === null || undefined}
                aria-describedby="generale-quante-aiuto"
              />
              <p id="generale-quante-aiuto" className={cn("text-xs", quante === null ? "text-destructive" : "text-muted-foreground")}>
                {quante === null ? "Scrivi un numero da 1 a 100." : quante > 0 ? `Le prepariamo come A1…A${quante}: nomi e prezzi li completi dopo.` : "Le puoi aggiungere dopo. Costi e rapportini possono stare sulla generale."}
              </p>
            </div>
          )}

          {modello === "appalto" && <label className="flex items-start gap-2 rounded-lg border p-3 text-sm"><input type="checkbox" checked={importaContratto} onChange={e => setImportaContratto(e.target.checked)} className="mt-1"/><span>Importa il contratto con l’AI dopo la creazione<span className="mt-1 block text-xs text-muted-foreground">PDF o immagine, poi verifica i dati in Contratto e SAL prima di salvarli.</span></span></label>}
          {puoFarePiano && <div className="flex items-center gap-2">
            <Switch id="generale-con-piano" checked={conPiano} onCheckedChange={setConPiano} />
            <Label htmlFor="generale-con-piano" className="text-sm font-normal">Prepara il piano economico</Label>
          </div>}
          {puoFarePiano && conPiano && <fieldset className="space-y-2 rounded-lg border p-3">
            <legend className="px-1 text-xs font-medium">Da dove vuoi partire?</legend>
            <label className="flex items-start gap-2 text-sm"><input type="radio" name="origine-piano" value="tipiche" checked={originePiano === "tipiche"} onChange={() => setOriginePiano("tipiche")} /><span>Voci tipiche da compilare</span></label>
            <label className="flex items-start gap-2 text-sm"><input type="radio" name="origine-piano" value="excel" checked={originePiano === "excel"} onChange={() => setOriginePiano("excel")} /><span>Ho già un business plan Excel o PDF<span className="mt-0.5 block text-xs text-muted-foreground">Dopo la creazione scegli il file e lo scenario. Le voci tipiche non vengono aggiunte.</span></span></label>
          </fieldset>}

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
