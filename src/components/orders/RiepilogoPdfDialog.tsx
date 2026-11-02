import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { GRUPPI_RIEPILOGO, GRUPPI_SINTETICO, type GruppoRiepilogo } from "@/lib/orders/riepilogoCommessaDati";
import { AnteprimaPdfDialog } from "./AnteprimaPdfDialog";

export interface SceltaRiepilogo {
  perCliente: boolean;
  gruppi: GruppoRiepilogo[] | null;
}
type Versione = "completa" | "sintetica" | "cliente";
type FilePdf = { blob: Blob; filename: string };

const VERSIONI: Array<{ id: Versione; nome: string; testo: string }> = [
  { id: "completa", nome: "Completa", testo: "Tutto quello che c'è sulla commessa e che puoi vedere." },
  { id: "sintetica", nome: "Sintetica", testo: "Cronoprogramma, grafici, conti, fatture e SAL." },
  { id: "cliente", nome: "Per il cliente", testo: "Senza costi, margini, fornitori e dati interni." },
];

interface Props {
  open: boolean;
  onOpenChange: (aperto: boolean) => void;
  occupato: boolean;
  /** Prepara il PDF senza scaricarlo. */
  onPrepara: (scelta: SceltaRiepilogo) => Promise<FilePdf | null>;
}

const scarica = ({ blob, filename }: FilePdf) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

/** Cosa mettere nel Riepilogo commessa, prima di generarlo. */
export function RiepilogoPdfDialog({ open, onOpenChange, occupato, onPrepara }: Props) {
  const [versione, setVersione] = useState<Versione>("completa");
  const [tolti, setTolti] = useState<Set<GruppoRiepilogo>>(new Set());
  const [anteprima, setAnteprima] = useState<FilePdf | null>(null);

  const scelta = (): SceltaRiepilogo => {
    const base = versione === "sintetica" ? GRUPPI_SINTETICO : GRUPPI_RIEPILOGO.map((g) => g.id);
    const gruppi = base.filter((g) => !tolti.has(g));
    return { perCliente: versione === "cliente", gruppi: gruppi.length === GRUPPI_RIEPILOGO.length ? null : gruppi };
  };
  const inVersione = (g: GruppoRiepilogo) => versione !== "sintetica" || GRUPPI_SINTETICO.includes(g);
  const chiudi = () => { setAnteprima(null); onOpenChange(false); };

  const genera = async (dopo: (f: FilePdf) => void) => {
    const f = await onPrepara(scelta());
    if (f) dopo(f);
  };

  return (
    <>
      <Dialog open={open && !anteprima} onOpenChange={(aperto) => { if (!aperto) chiudi(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Riepilogo commessa</DialogTitle>
            <DialogDescription>Scegli la versione e cosa includere.</DialogDescription>
          </DialogHeader>
          <RadioGroup value={versione} onValueChange={(v) => { setVersione(v as Versione); setTolti(new Set()); }} className="gap-1.5">
            {VERSIONI.map((v) => (
              <Label key={v.id} htmlFor={`riepilogo-${v.id}`} className="flex cursor-pointer items-start gap-2 rounded border p-2 font-normal">
                <RadioGroupItem id={`riepilogo-${v.id}`} value={v.id} className="mt-0.5" />
                <span>
                  <span className="block text-sm font-medium">{v.nome}</span>
                  <span className="block text-xs text-muted-foreground">{v.testo}</span>
                </span>
              </Label>
            ))}
          </RadioGroup>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {GRUPPI_RIEPILOGO.filter((g) => inVersione(g.id)).map((g) => (
              <Label key={g.id} className="flex cursor-pointer items-center gap-2 py-0.5 text-xs font-normal">
                <Checkbox
                  checked={!tolti.has(g.id)}
                  onCheckedChange={(c) => setTolti((prima) => {
                    const dopo = new Set(prima);
                    if (c) dopo.delete(g.id); else dopo.add(g.id);
                    return dopo;
                  })}
                />
                {g.label}
              </Label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={occupato} onClick={() => { void genera(setAnteprima); }}>Anteprima</Button>
            <Button disabled={occupato} onClick={() => { void genera((f) => { scarica(f); chiudi(); }); }}>
              {occupato && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Scarica PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AnteprimaPdfDialog
        file={anteprima}
        titolo="Anteprima del riepilogo"
        descrizione={versione === "cliente" ? "Versione per il cliente: controlla che sia tutto giusto." : "Controlla il documento prima di scaricarlo."}
        azione="Scarica PDF"
        onConferma={() => { if (anteprima) scarica(anteprima); chiudi(); }}
        onChiudi={() => setAnteprima(null)}
      />
    </>
  );
}
