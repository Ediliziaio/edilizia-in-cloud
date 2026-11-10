import { useState } from "react";
import ReactCrop, { type PercentCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { RitaglioPianta } from "@/lib/planimetrie/documentoImmagine";
import { useBlobRef } from "./useBlobRef";

export default function RitaglioDocumentoPianta({ file, iniziale, onConferma, onChiudi }: { file: Blob; iniziale: RitaglioPianta | null; onConferma: (r: RitaglioPianta | null) => void; onChiudi: () => void }) {
  const immagine = useBlobRef<HTMLImageElement>(file, "src");
  const [crop, setCrop] = useState<PercentCrop | undefined>(iniziale ? { unit: "%", ...iniziale } : undefined);
  return <Dialog open onOpenChange={(open) => { if (!open) onChiudi(); }}><DialogContent className="max-w-3xl">
    <DialogHeader><DialogTitle>Ritaglia il foglio da leggere</DialogTitle><DialogDescription>Trascina un rettangolo intorno al disegno e alle sue quote. Escludi gli altri fogli e lo sfondo. La rotazione viene applicata dopo il ritaglio.</DialogDescription></DialogHeader>
    <div className="flex max-h-[65dvh] justify-center overflow-auto rounded-lg bg-muted p-2">
      <ReactCrop crop={crop} onChange={(_, percent) => setCrop(percent)} minWidth={30} minHeight={30} keepSelection ariaLabels={{ cropArea: "Area del foglio da leggere", nwDragHandle: "Angolo in alto a sinistra", nDragHandle: "Bordo superiore", neDragHandle: "Angolo in alto a destra", eDragHandle: "Bordo destro", seDragHandle: "Angolo in basso a destra", sDragHandle: "Bordo inferiore", swDragHandle: "Angolo in basso a sinistra", wDragHandle: "Bordo sinistro" }}>
        <img ref={immagine} alt="Foto originale da ritagliare" className="w-auto max-w-full object-contain" style={{ maxHeight: "60dvh" }} />
      </ReactCrop>
    </div>
    <DialogFooter className="gap-2"><Button variant="ghost" onClick={() => onConferma(null)}>Usa tutto il foglio</Button><Button variant="outline" onClick={onChiudi}>Annulla</Button><Button disabled={!crop || crop.width < 2 || crop.height < 2} onClick={() => crop && onConferma(crop)}>Applica ritaglio</Button></DialogFooter>
  </DialogContent></Dialog>;
}
