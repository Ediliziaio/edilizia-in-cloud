import { useState } from "react";
import ReactCrop, { type PercentCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { RitaglioPianta } from "@/lib/planimetrie/documentoImmagine";
import { useBlobRef } from "./useBlobRef";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export default function RitaglioDocumentoPianta({ file, iniziale, onConferma, onChiudi }: { file: Blob; iniziale: RitaglioPianta | null; onConferma: (r: RitaglioPianta | null) => void; onChiudi: () => void }) {
  const t = useT();
  const immagine = useBlobRef<HTMLImageElement>(file, "src");
  const [crop, setCrop] = useState<PercentCrop | undefined>(iniziale ? { unit: "%", ...iniziale } : undefined);
  return <Dialog open onOpenChange={(open) => { if (!open) onChiudi(); }}><DialogContent className="max-w-3xl">
    <DialogHeader><DialogTitle>{t("Ritaglia il foglio da leggere")}</DialogTitle><DialogDescription>{t("Trascina un rettangolo intorno al disegno e alle sue quote. Escludi gli altri fogli e lo sfondo. La rotazione viene applicata dopo il ritaglio.")}</DialogDescription></DialogHeader>
    <div className="flex max-h-[65dvh] justify-center overflow-auto rounded-lg bg-muted p-2">
      <ReactCrop crop={crop} onChange={(_, percent) => setCrop(percent)} minWidth={30} minHeight={30} keepSelection ariaLabels={{ cropArea: t("Area del foglio da leggere"), nwDragHandle: t("Angolo in alto a sinistra"), nDragHandle: t("Bordo superiore"), neDragHandle: t("Angolo in alto a destra"), eDragHandle: t("Bordo destro"), seDragHandle: t("Angolo in basso a destra"), sDragHandle: t("Bordo inferiore"), swDragHandle: t("Angolo in basso a sinistra"), wDragHandle: t("Bordo sinistro") }}>
        <img ref={immagine} alt={t("Foto originale da ritagliare")} className="w-auto max-w-full object-contain" style={{ maxHeight: "60dvh" }} />
      </ReactCrop>
    </div>
    <DialogFooter className="gap-2"><Button variant="ghost" onClick={() => onConferma(null)}>{t("Usa tutto il foglio")}</Button><Button variant="outline" onClick={onChiudi}>{t("Annulla")}</Button><Button disabled={!crop || crop.width < 2 || crop.height < 2} onClick={() => crop && onConferma(crop)}>{t("Applica ritaglio")}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
