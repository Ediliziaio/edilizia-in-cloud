import { useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ComandiDocumentoContext } from "./contestoConfrontoDocumenti";

/** Le fasce dei due documenti condividono le stesse righe della griglia. */
export function ConfrontoDocumentiLayout({ children }: { children: ReactNode }) {
  return <div data-confronto-allineato className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-2 lg:grid-rows-[auto_auto_auto_minmax(0,1fr)_auto] lg:overflow-hidden">{children}</div>;
}

export function PannelloDocumento({ nome, lato, attivo, testata, viste, children, note, rigaSelezionata }: {
  nome: string;
  lato: "sinistra" | "destra";
  attivo: boolean;
  testata: ReactNode;
  viste: ReactNode;
  children: ReactNode;
  note?: ReactNode;
  rigaSelezionata?: string;
}) {
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  const documento = useRef<HTMLDivElement>(null);
  const context = useMemo(() => ({ target }), [target]);
  useLayoutEffect(() => {
    const body = documento.current;
    if (!body || !rigaSelezionata) return;
    const riga = Array.from(body.querySelectorAll<HTMLElement>("[data-confronto-riga]")).find(el => el.dataset.confrontoRiga === rigaSelezionata);
    if (!riga) return;
    body.scrollTop += riga.getBoundingClientRect().top - body.getBoundingClientRect().top - 16;
  }, [rigaSelezionata]);
  return <ComandiDocumentoContext.Provider value={context}>
    <section aria-label={nome} data-confronto-pannello={lato} className={`${attivo ? "flex" : "hidden"} h-full min-h-0 min-w-0 flex-col border-b lg:row-span-5 lg:grid lg:h-auto lg:[grid-template-rows:subgrid] lg:border-b-0 ${lato === "sinistra" ? "lg:col-start-1 lg:row-start-1 lg:border-r" : "lg:col-start-2 lg:row-start-1"}`}>
      <div data-confronto-testata className="min-w-0 [&>div]:h-full">{testata}</div>
      <div data-confronto-viste className="min-w-0">{viste}</div>
      <div data-confronto-comandi ref={setTarget} className="flex min-w-0 shrink-0 flex-col gap-2 px-4 pb-2 empty:pb-0 sm:px-5" />
      <div data-confronto-documento ref={documento} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">{children}</div>
      <div data-confronto-note className="min-w-0 empty:hidden">{note}</div>
    </section>
  </ComandiDocumentoContext.Provider>;
}

/** I controlli restano sopra la superficie, anche quando provengono da un visualizzatore annidato. */
export function ComandiDocumento({ children, ordine = 0 }: { children: ReactNode; ordine?: number }) {
  const context = useContext(ComandiDocumentoContext);
  if (!context?.target) return <>{children}</>;
  return createPortal(<div className={`min-w-0 shrink-0 ${ordine >= 20 ? "mt-auto" : ""}`} style={{ order: ordine }}>{children}</div>, context.target);
}
