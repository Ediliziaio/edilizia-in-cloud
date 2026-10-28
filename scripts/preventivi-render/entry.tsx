import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { DocumentoEdilePDF } from "../../src/components/preventivi/pdf/DocumentoEdilePDF";
import { preparaImmaginiPreventivo } from "../../src/components/preventivi/pdf/generaPreventivo";
import { datiGenerici } from "../../src/components/preventivi/pdf/adattatoreGenerico";
import type { DocEdileDati } from "../../src/components/preventivi/pdf/documentoEdileTipi";
import { validaPreventivo } from "../../src/components/preventivi/pdf/validaPreventivo";

async function render(dati: DocEdileDati): Promise<Uint8Array> {
  validaPreventivo(dati);
  const pronto = await preparaImmaginiPreventivo(dati);
  return new Uint8Array(await renderToBuffer(<DocumentoEdilePDF dati={pronto} />));
}
export const renderGenerico = (input: Parameters<typeof datiGenerici>[0]) => render(datiGenerici(input));
