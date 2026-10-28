import type { ReactElement } from "react";
import type { DocumentProps } from "@react-pdf/renderer";
import { ensurePdfBufferCompatibility } from "./ensurePdfBufferCompatibility";

let coda: Promise<void> = Promise.resolve();

/** Condivide il motore e la coda, non il layout o i dati del documento. */
export function generaPdfDocumento(documento: ReactElement): Promise<Blob> {
  const lavoro = coda.then(async () => {
    ensurePdfBufferCompatibility();
    const { pdf } = await import("@react-pdf/renderer");
    return pdf(documento as ReactElement<DocumentProps>).toBlob();
  });
  coda = lavoro.then((): void => undefined, (): void => undefined);
  return lavoro;
}
