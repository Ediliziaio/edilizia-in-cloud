import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { DocumentoEdilePDF } from "../../src/components/preventivi/pdf/DocumentoEdilePDF";
import { preparaImmaginiPreventivo } from "../../src/components/preventivi/pdf/generaPreventivo";
import { datiGenerici } from "../../src/components/preventivi/pdf/adattatoreGenerico";
import type { DocEdileDati } from "../../src/components/preventivi/pdf/documentoEdileTipi";
import { validaPreventivo } from "../../src/components/preventivi/pdf/validaPreventivo";
import { clausoleStampateEdile } from "../../src/lib/fea/clausoleDelDocumento";

async function render(dati: DocEdileDati): Promise<Uint8Array> {
  validaPreventivo(dati);
  const pronto = await preparaImmaginiPreventivo(dati);
  return new Uint8Array(await renderToBuffer(<DocumentoEdilePDF dati={pronto} />));
}
export const renderGenerico = (input: Parameters<typeof datiGenerici>[0]) => render(datiGenerici(input));
/** Il PDF e le clausole che stampa nel riquadro «Approvazione specifica»: la pagina di firma fa approvare quelle (31/10/2026). */
export async function renderGenericoConClausole(input: Parameters<typeof datiGenerici>[0]): Promise<{ pdf: Uint8Array; clausole: string[] }> {
  const dati = datiGenerici(input);
  return { pdf: await render(dati), clausole: clausoleStampateEdile(dati) };
}
