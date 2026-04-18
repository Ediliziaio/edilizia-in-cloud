/**
 * Bottone + AlertDialog per installare il Catalogo Base 20 Tipologie
 * nelle article_families di una company serramentista.
 *
 * Gate: la feature 'listini_serramenti_avanzati' deve essere attiva.
 * In caso contrario il componente non viene renderizzato (gate upstream
 * nei container che montano il bottone).
 *
 * Props:
 *  - companyId: obbligatorio
 *  - onInstalled: callback post-success (es. refetch lista)
 *  - variant/size: override shadcn button props
 *  - className: classi tailwind aggiuntive
 *
 * UX:
 *  - Dialog di conferma con elenco conteggio per categoria
 *  - Loader durante mutation
 *  - Toast success/info/error gestiti dal hook
 *  - Disabilitato durante isPending per evitare doppio-submit
 */

import { useState } from "react";
import { Loader2, Download } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useInstallaCatalogoSerramenti } from "../hooks/useInstallaCatalogoSerramenti";
import {
  CATALOGO_TIPOLOGIE,
  getTipologieCountByCategoria,
} from "../data/tipologie-catalogo";

interface InstallaCatalogoButtonProps {
  companyId: string;
  onInstalled?: () => void;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  label?: string;
}

const CATEGORIA_LABELS: Record<string, string> = {
  finestra: "Finestre / accessori",
  fisso: "Fissi",
  porta_balcone: "Porte balcone",
  porta_ingresso: "Porte d'ingresso",
  scorrevole: "Scorrevoli",
};

export function InstallaCatalogoButton({
  companyId,
  onInstalled,
  variant = "default",
  size = "default",
  className,
  label = "Installa catalogo base (20 tipologie)",
}: InstallaCatalogoButtonProps) {
  const [open, setOpen] = useState(false);
  const mutation = useInstallaCatalogoSerramenti();
  const counts = getTipologieCountByCategoria();

  const handleConfirm = async () => {
    try {
      await mutation.mutateAsync({ companyId });
      setOpen(false);
      onInstalled?.();
    } catch {
      // Errore già gestito dal hook (toast). Teniamo dialog aperto per retry.
    }
  };

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={cn("gap-2", className)}
        onClick={() => setOpen(true)}
        disabled={!companyId || mutation.isPending}
        aria-label={label}
      >
        {mutation.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Download className="h-4 w-4" aria-hidden />
        )}
        {label}
      </Button>

      <AlertDialog open={open} onOpenChange={(o) => !mutation.isPending && setOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Installa catalogo base</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Stai per aggiungere <strong>{CATALOGO_TIPOLOGIE.length} tipologie</strong>{" "}
                  di serramenti standard al tuo catalogo famiglie. Operazione sicura:
                </p>
                <ul className="text-sm space-y-1 pl-4 list-disc">
                  {Object.entries(counts).map(([cat, n]) => (
                    <li key={cat}>
                      <span className="font-medium">{CATEGORIA_LABELS[cat] ?? cat}:</span>{" "}
                      {n} tipologie
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-muted-foreground">
                  Le tipologie già presenti non verranno duplicate. Potrai disattivare o
                  rimuovere quelle che non ti servono dopo l'installazione.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleConfirm();
              }}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Installazione...
                </>
              ) : (
                "Installa ora"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
