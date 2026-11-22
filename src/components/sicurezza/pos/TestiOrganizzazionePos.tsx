import { useState } from "react";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CAMPI = [
  { id: "accessi", label: "Accessi e percorsi", esempio: "Varco di ingresso e percorso pedonale fino alla zona di lavoro" },
  { id: "scarico", label: "Consegne e deposito", esempio: "Area di scarico, deposito e fasce concordate per le consegne" },
  { id: "servizi", label: "Servizi e spazi comuni", esempio: "Posizione dei servizi e modalità di utilizzo degli spazi comuni" },
  { id: "fronti", label: "Coordinamento dei fronti", esempio: "Zone occupate, attività in contemporanea e referente per i passaggi di consegna" },
] as const;

type Valori = Partial<Record<typeof CAMPI[number]["id"], string>>;

export function TestiOrganizzazionePos({ turniPresenti, onInserisci }: {
  turniPresenti: boolean;
  onInserisci: (organizzazione: string[], turni: string) => void;
}) {
  const [aperto, setAperto] = useState(false);
  return (
    <Dialog open={aperto} onOpenChange={setAperto}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="gap-1.5">
          <FileText className="size-4" aria-hidden="true" /> Compila con una traccia
        </Button>
      </DialogTrigger>
      {aperto && <TracciaOrganizzazione turniPresenti={turniPresenti} onInserisci={onInserisci} chiudi={() => setAperto(false)} />}
    </Dialog>
  );
}

function TracciaOrganizzazione({ turniPresenti, onInserisci, chiudi }: {
  turniPresenti: boolean;
  onInserisci: (organizzazione: string[], turni: string) => void;
  chiudi: () => void;
}) {
  const [valori, setValori] = useState<Valori>({});
  const [turni, setTurni] = useState("");
  const testo = CAMPI.flatMap(({ id, label }) => {
    const valore = valori[id]?.trim();
    return valore ? [`${label}: ${valore}`] : [];
  });
  const turniNuovi = turniPresenti ? "" : turni.trim();
  return (
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>Organizzazione e turni</DialogTitle>
        <DialogDescription>Inserisci i dettagli già definiti per questo cantiere. Verranno aggiunti al testo del POS.</DialogDescription>
      </DialogHeader>
      <form className="space-y-4" onSubmit={e => {
        e.preventDefault();
        if (!testo.length && !turniNuovi) return;
        onInserisci(testo, turniNuovi);
        chiudi();
      }}>
        <div className="grid gap-3 sm:grid-cols-2">
          {CAMPI.map(({ id, label, esempio }) => <div key={id} className="min-w-0 space-y-1.5">
            <Label htmlFor={`pos-traccia-${id}`}>{label}</Label>
            <Input id={`pos-traccia-${id}`} aria-describedby={`pos-traccia-hint-${id}`} value={valori[id] ?? ""} maxLength={400}
              onChange={e => setValori(v => ({ ...v, [id]: e.target.value }))} />
            <p id={`pos-traccia-hint-${id}`} className="text-xs text-muted-foreground">{esempio}</p>
          </div>)}
        </div>
        {!turniPresenti && <div className="space-y-1.5">
          <Label htmlFor="pos-traccia-turni">Giorni e orari dei turni</Label>
          <Input id="pos-traccia-turni" value={turni} maxLength={300} onChange={e => setTurni(e.target.value)} />
        </div>}
        {testo.length > 0 && <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <p className="mb-1 font-medium">Testo da inserire</p>
          {testo.map(riga => <p key={riga} className="break-words text-muted-foreground">{riga}</p>)}
        </div>}
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={chiudi}>Annulla</Button>
          <Button type="submit" disabled={!testo.length && !turniNuovi}>Inserisci nel POS</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
