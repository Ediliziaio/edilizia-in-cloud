import { useId, useState, type ReactNode } from "react";
import { Eye, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type VistaEditorDocumento = "modifica" | "anteprima";

export function SceltaVistaDocumento({ vista, onChange, controls, className }: {
  vista: VistaEditorDocumento;
  onChange: (vista: VistaEditorDocumento) => void;
  controls: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label="Vista del modello" className={cn("flex w-fit max-w-full gap-1 rounded-lg border bg-card p-1", className)}>
      <Button type="button" variant={vista === "modifica" ? "default" : "ghost"} aria-pressed={vista === "modifica"}
        aria-controls={controls} onClick={() => onChange("modifica")} className="min-h-11 flex-1 gap-2">
        <Pencil className="h-4 w-4" aria-hidden="true" /> Modifica
      </Button>
      <Button type="button" variant={vista === "anteprima" ? "default" : "ghost"} aria-pressed={vista === "anteprima"}
        aria-controls={controls} onClick={() => onChange("anteprima")} className="min-h-11 flex-1 gap-2">
        <Eye className="h-4 w-4" aria-hidden="true" /> Anteprima
      </Button>
    </div>
  );
}

/** Entrambi i pannelli restano montati per conservare campi, selezione e zoom. */
export function DocumentEditorWorkspace({ editor, anteprima, affiancaDa = "xl", colonne, previewClassName, selezioneVista }: {
  editor: ReactNode;
  anteprima: ReactNode;
  affiancaDa?: "lg" | "xl";
  colonne?: string;
  previewClassName?: string;
  selezioneVista?: { vista: VistaEditorDocumento; onChange: (vista: VistaEditorDocumento) => void };
}) {
  const id = useId();
  const [vistaLocale, setVistaLocale] = useState<VistaEditorDocumento>("modifica");
  const vista = selezioneVista?.vista ?? vistaLocale;
  const classePannello = affiancaDa === "lg" ? "lg:block" : "xl:block";
  return (
    <div className="min-w-0 space-y-3">
      <SceltaVistaDocumento vista={vista} onChange={selezioneVista?.onChange ?? setVistaLocale} controls={id}
        className={affiancaDa === "lg" ? "lg:hidden" : "xl:hidden"} />
      <div id={id} className={cn("grid min-w-0 items-start gap-4", colonne ?? (affiancaDa === "lg" ? "lg:grid-cols-2" : "xl:grid-cols-2"))}>
        <div className={cn("min-w-0", vista === "anteprima" && "hidden", classePannello)}>{editor}</div>
        <div className={cn("min-w-0", vista === "modifica" && "hidden", classePannello, previewClassName)}>{anteprima}</div>
      </div>
    </div>
  );
}
