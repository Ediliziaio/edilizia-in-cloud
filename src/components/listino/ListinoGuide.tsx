/**
 * «Come funziona» del listino: un bottone nell'intestazione che apre la
 * spiegazione. Prima era un riquadro sempre presente sopra i prodotti, che
 * spingeva il listino più in basso a ogni visita per una cosa che si legge
 * una volta.
 */
import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const LIVELLI: Array<{ nome: string; testo: string }> = [
  {
    nome: "Area",
    testo:
      "Serramenti, Fotovoltaico, Bagni. Decide in quale preventivatore compaiono i prodotti: una tipologia dell'area Serramenti la ritrovi nel preventivatore serramenti.",
  },
  {
    nome: "Tipologia",
    testo:
      "Cosa vendi dentro l'area: serramenti, tapparelle, zanzariere, cassonetti, persiane, porte. Le tipologie standard si aggiungono in un clic dalla colonna a sinistra.",
  },
  {
    nome: "Linea",
    testo:
      "Come si divide una tipologia. Le serie di profilo (Salamander, Aluplast) hanno gli stessi modelli con un prezzo diverso e si aggiungono da «Importa → Serie di profilo». Le linee di prodotti (tapparelle in PVC o in alluminio, linea vasca tipo 1 e tipo 2) raccolgono prodotti diversi e si creano con «+ Linea».",
  },
  {
    nome: "Prodotti",
    testo:
      "Ognuno col prezzo della sua linea, il costo e il margine. Colore, vetro e apertura sono variabili: si scelgono nel preventivo e possono cambiare il prezzo.",
  },
];

export function ListinoGuide() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
          <HelpCircle className="h-4 w-4" aria-hidden="true" />
          Come funziona
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Come funziona il listino</DialogTitle>
          <DialogDescription>Quattro livelli, dal più generale al prezzo.</DialogDescription>
        </DialogHeader>
        <ol className="space-y-3">
          {LIVELLI.map((livello, i) => (
            <li key={livello.nome} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {i + 1}
              </span>
              <p className="text-sm leading-relaxed">
                <strong>{livello.nome}.</strong> <span className="text-muted-foreground">{livello.testo}</span>
              </p>
            </li>
          ))}
        </ol>
        <div className="space-y-1 rounded-md bg-muted/50 p-3 text-sm">
          <p className="font-medium">Scheda tecnica e variabili</p>
          <p className="text-muted-foreground">
            La scheda tecnica descrive il modello e non cambia (vetro, trasmittanza, materiale): i suoi campi si
            impostano una volta per tipologia da «Tipologie». Le variabili invece cambiano da un preventivo all'altro.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
