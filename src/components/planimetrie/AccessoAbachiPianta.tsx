import { AppWindow, Grid3x3, Ruler } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Planimetria } from "../../../shared/planimetrie/modello.ts";
import type { MappaQuantita } from "../../../shared/planimetrie/quantita.ts";
import { AbachiPianta } from "./AbachiPianta";

const ACCESSI = [
  { scheda: "finestre", nome: "Finestre", icona: AppWindow },
  { scheda: "stanze", nome: "Pavimenti", icona: Grid3x3 },
  { scheda: "pareti", nome: "Pareti", icona: Ruler },
] as const;

export function AccessoAbachiPianta({ documento, livelloId, ambito, nomeContesto, quantita }: {
  documento: Planimetria;
  livelloId: string;
  ambito: string;
  nomeContesto: string;
  quantita?: MappaQuantita;
}) {
  return <div role="group" aria-label="Misure e abachi" className="flex flex-wrap items-center gap-1">
    {ACCESSI.map(({ scheda, nome, icona: Icona }) => <Dialog key={scheda}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline"><Icona />{nome}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88dvh] w-[calc(100%_-_1.5rem)] max-w-6xl overflow-y-auto overscroll-contain p-3 sm:p-5">
        <DialogHeader className="pr-7">
          <DialogTitle>Misure e abachi</DialogTitle>
          <DialogDescription>{nomeContesto}</DialogDescription>
        </DialogHeader>
        <AbachiPianta documento={documento} livelloId={livelloId} ambito={ambito} titolo={documento.titolo ?? "pianta"}
          quantita={quantita} iniziale={scheda} inDialogo />
      </DialogContent>
    </Dialog>)}
  </div>;
}
