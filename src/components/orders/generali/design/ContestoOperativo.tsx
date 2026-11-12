import {
  createContext,
  useContext,
  type ComponentProps,
  type ReactNode,
  type MouseEvent,
} from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Layers3 } from "lucide-react";
import { DialogContent } from "@/components/ui/dialog";
import { SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  documentoDaPercorso,
  useContestoDocumentoPopup,
} from "@/lib/orders/documentoPopup";
import "./commessa-generale.css";
import "./operativo.css";
import "./dialog-generale.css";

interface AspettoOperativo {
  generaleId: string;
  codice?: string | null;
}
const Contesto = createContext<AspettoOperativo | null>(null);
export const AspettoOperativoProvider = Contesto.Provider;
export const useAspettoOperativo = () => useContext(Contesto);

function useIntercettaDocumenti(
  onClickCapture?: (e: MouseEvent<HTMLDivElement>) => void,
) {
  const aspetto = useAspettoOperativo();
  const popup = useContestoDocumentoPopup();
  return (e: MouseEvent<HTMLDivElement>) => {
    onClickCapture?.(e);
    if (
      !aspetto ||
      !popup ||
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey
    )
      return;
    const a = (e.target as HTMLElement).closest?.("a[href]");
    const href = a?.getAttribute("href");
    if (
      href &&
      a?.getAttribute("target") !== "_blank" &&
      documentoDaPercorso(href) &&
      popup.vai(href)
    )
      e.preventDefault();
  };
}

/** I portali conservano il contesto React: lo stile segue anche i dialog annidati. */
export function DialogContentOperativo({
  className,
  onClickCapture,
  children,
  struttura = "libera",
  ampiezza = "spazio",
  ...props
}: ComponentProps<typeof DialogContent>) {
  const aspetto = useAspettoOperativo();
  const intercetta = useIntercettaDocumenti(onClickCapture);
  return (
    <DialogContent
      {...props}
      ampiezza={ampiezza}
      struttura={struttura}
      onClickCapture={intercetta}
      className={cn(
        className,
        aspetto && "generale-design generale-operativo-dialog",
      )}
    >
      {children}
    </DialogContent>
  );
}

export function SheetContentOperativo({
  className,
  onClickCapture,
  side = "right",
  ...props
}: ComponentProps<typeof SheetContent>) {
  const aspetto = useAspettoOperativo();
  const intercetta = useIntercettaDocumenti(onClickCapture);
  return (
    <SheetContent
      {...props}
      side={side}
      data-lato={side}
      onClickCapture={intercetta}
      className={cn(
        className,
        "generale-sheet",
        aspetto && "generale-design generale-operativo-dialog",
      )}
    />
  );
}

/** Solo un percorso interno di documento può trasportare il contesto alla scheda intera. */
export function percorsoDocumentoGenerale(
  percorso: string,
  generaleId?: string,
) {
  if (
    !generaleId ||
    !/^\/azienda\/(ordini-acquisto|ddt)\/[^/?#]+(?:[?#]|$)/.test(percorso)
  )
    return percorso;
  const url = new URL(percorso, "http://localhost");
  url.searchParams.set("commessa-generale", generaleId);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Una scheda aperta separatamente mantiene il contesto visivo e il ritorno al cantiere. */
export function PaginaDocumentoGenerale({ children }: { children: ReactNode }) {
  const esistente = useAspettoOperativo();
  const [parametri] = useSearchParams();
  const id = parametri.get("commessa-generale");
  const aspetto =
    esistente ??
    (id && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(id)
      ? { generaleId: id }
      : null);
  if (!aspetto) return children;
  return (
    <AspettoOperativoProvider value={aspetto}>
      <div className="generale-design generale-documento-pagina space-y-4">
        {!esistente && (
          <div className="generale-documento-context">
            <Link
              to={`/azienda/ordini/${aspetto.generaleId}?scheda=cantiere&vista-cantiere=forniture`}
            >
              <ArrowLeft aria-hidden="true" /> Torna alla commessa generale
            </Link>
            <span>
              <Layers3 aria-hidden="true" /> Documenti del cantiere
            </span>
          </div>
        )}
        {children}
      </div>
    </AspettoOperativoProvider>
  );
}
