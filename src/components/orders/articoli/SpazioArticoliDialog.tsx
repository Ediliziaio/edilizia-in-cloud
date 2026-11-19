import type { ReactNode } from "react";
import { Package } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Un solo contenitore per ricerca, preparazione e modifica degli articoli. */
export function SpazioArticoliDialog({ open, onOpenChange, titolo, descrizione, ricerca, children, avviso }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titolo: string;
  descrizione: string;
  ricerca: ReactNode;
  children: ReactNode;
  avviso?: ReactNode;
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex h-[min(880px,92dvh)] max-h-[92dvh] w-[96vw] max-w-[1380px] flex-col gap-0 overflow-hidden p-0 max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-full max-sm:rounded-none">
      <DialogHeader className="shrink-0 border-b px-4 py-4 pr-12 sm:px-6">
        <DialogTitle className="flex items-center gap-2 text-xl"><Package className="h-5 w-5 text-primary" aria-hidden />{titolo}</DialogTitle>
        <DialogDescription>{descrizione}</DialogDescription>
      </DialogHeader>
      {avviso}
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)] lg:overflow-hidden">
        <aside className="min-w-0 border-b bg-muted/20 p-3 lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r sm:p-4" aria-label="Ricerca articoli">{ricerca}</aside>
        <div className="min-w-0 p-4 lg:min-h-0 lg:overflow-y-auto sm:p-6" data-testid="editor-articoli">{children}</div>
      </div>
    </DialogContent>
  </Dialog>;
}
