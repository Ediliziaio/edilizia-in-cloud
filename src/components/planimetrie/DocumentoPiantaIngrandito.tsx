import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function DocumentoPiantaIngrandito({ src, onChiudi }: { src: string; onChiudi: () => void }) {
  const [zoom, setZoom] = useState(1);
  return <Dialog open onOpenChange={(open) => { if (!open) onChiudi(); }}><DialogContent className="max-w-5xl">
    <DialogHeader><DialogTitle>Controlla il foglio</DialogTitle><DialogDescription>Ingrandisci per verificare quote, scritte e aperture prima della lettura AI.</DialogDescription></DialogHeader>
    <div className="flex items-center justify-center gap-3"><Button size="icon" variant="outline" aria-label="Riduci documento" disabled={zoom <= 1} onClick={() => setZoom((z) => z - 0.5)}><Minus className="h-4 w-4" /></Button><span className="w-12 text-center text-xs tabular-nums">{zoom * 100}%</span><Button size="icon" variant="outline" aria-label="Ingrandisci documento" disabled={zoom >= 3} onClick={() => setZoom((z) => z + 0.5)}><Plus className="h-4 w-4" /></Button></div>
    <div className="max-h-[65dvh] overflow-auto rounded-lg border bg-muted/30 p-2"><img src={src} alt="Dettaglio del foglio da leggere" className="mx-auto object-contain" style={zoom === 1 ? { maxWidth: "100%", maxHeight: "60dvh" } : { height: `${60 * zoom}dvh`, maxWidth: "none" }} /></div>
  </DialogContent></Dialog>;
}
