import { useEffect, useState, type RefObject } from "react";

export type AdattamentoDocumento = "pagina" | "larghezza";
type Dimensioni = { width: number; height: number };
export function useDimensioniDocumento(ref: RefObject<HTMLDivElement>) {
  const [dimensioni, setDimensioni] = useState<Dimensioni>({ width: 0, height: 0 });
  useEffect(() => {
    const elemento = ref.current;
    if (!elemento) return;
    const misura = () => {
      const { clientWidth: width, clientHeight: height } = elemento;
      setDimensioni(precedenti =>
        precedenti.width === width && precedenti.height === height
          ? precedenti
          : { width, height },
      );
    };
    const frame = requestAnimationFrame(misura);
    const osservatore = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(misura);
    osservatore?.observe(elemento);
    return () => {
      cancelAnimationFrame(frame);
      osservatore?.disconnect();
    };
  }, [ref]);
  return dimensioni;
}

/** Otto pixel di respiro su ciascun lato della pagina. */
export function scalaDocumento(pagina: Dimensioni, spazio: Dimensioni, adatta: AdattamentoDocumento) {
  const larghezza = Math.max(1, spazio.width - 16) / pagina.width;
  const altezza = Math.max(1, spazio.height - 16) / pagina.height;
  return adatta === "pagina" ? Math.min(larghezza, altezza) : larghezza;
}
