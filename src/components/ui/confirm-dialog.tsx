/**
 * useConfirm — conferma promise-based per azioni distruttive.
 *
 * Audit design 2026-06-01: ~80 onClick di delete/remove senza dialog di
 * conferma. Su mobile 4G in cantiere un tap accidentale = dati persi
 * (budget, listini, logo, contatti). Questo hook offre un'API ergonomica
 * per chiedere conferma senza ripetere il boilerplate di AlertDialog:
 *
 *   const confirm = useConfirm();
 *   const onDelete = async () => {
 *     if (await confirm({
 *       title: "Eliminare il budget?",
 *       description: "L'operazione non può essere annullata.",
 *       confirmLabel: "Elimina",
 *       variant: "destructive",
 *     })) {
 *       deleteMutation.mutate(id);
 *     }
 *   };
 *
 * Il provider <ConfirmProvider> va montato UNA volta vicino alla radice.
 */
import { createContext, useCallback, useContext, useRef, useState } from "react";
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

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "destructive" colora il bottone di conferma in rosso (default per delete) */
  variant?: "default" | "destructive";
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    setOpts(options);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    setOpen(false);
    resolverRef.current?.(value);
    resolverRef.current = null;
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={open} onOpenChange={(o) => { if (!o) settle(false); }}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{opts?.title}</AlertDialogTitle>
            {opts?.description && (
              <AlertDialogDescription>{opts.description}</AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settle(false)}>
              {opts?.cancelLabel ?? "Annulla"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => settle(true)}
              className={cn(
                opts?.variant === "destructive" &&
                  "bg-destructive text-destructive-foreground hover:bg-destructive/90",
              )}
            >
              {opts?.confirmLabel ?? "Conferma"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

/**
 * Ritorna la funzione confirm(). Se il provider non è montato, fa fallback al
 * window.confirm nativo (così l'hook non crasha mai e l'azione resta protetta).
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  return useCallback<ConfirmFn>(
    (opts) => {
      if (ctx) return ctx(opts);
      // Fallback nativo: meglio una conferma brutta che nessuna conferma.
      const msg = opts.description ? `${opts.title}\n\n${opts.description}` : opts.title;
      return Promise.resolve(typeof window !== "undefined" ? window.confirm(msg) : true);
    },
    [ctx],
  );
}
