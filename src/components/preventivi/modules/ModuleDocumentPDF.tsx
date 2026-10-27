import React from "react";
import { createPdfPreviewUrl } from "@/lib/pdfPreviewSource";
import type { ModuleDocument } from "@/lib/moduli-vendita/moduleDocuments";
import { DocumentoEdilePDF } from "../pdf/DocumentoEdilePDF";
import { baseDocumentoEnergia } from "../pdf/adattatoreEnergia";
import { generaPreventivoBlob } from "../pdf/generaPreventivo";

/** Prova del modello: stesso motore, senza importi inventati o accettazione. */
export function datiModelloConfigurabile(d: ModuleDocument) {
  const dati = baseDocumentoEnergia({
    azienda: { nome: d.company.name, telefono: d.company.phone, email: d.company.email },
    cliente: { nome: "Anteprima del modello" },
    preventivo: { codice: "MODELLO", dataIso: new Date().toISOString(), validitaGiorni: 0 },
  }, { prezzo: 0, imponibile: 0, iva: 0 }, d.title);
  dati.azienda.indirizzo = d.company.address;
  dati.modello.colorePrimario = d.color;
  dati.modello.copertina.titolo = d.title;
  dati.modello.copertina.sottotitolo = d.subtitle;
  dati.modello.copertina.immagineUrl = d.image;
  dati.bozzaLocale = { ivaDaDefinire: false, soloConfigurazione: true };
  dati.sezioniTecniche = d.pages.filter(p => p.visible).map(p => ({
    id: p.id, titolo: p.title, testo: p.intro,
    righe: p.items.map(item => ({ etichetta: item.title, valore: item.text })),
  }));
  return dati;
}

export function ModuleDocumentPDF({ document }: { document: ModuleDocument }) {
  return <DocumentoEdilePDF dati={datiModelloConfigurabile(document)} />;
}

export async function renderModuleDocument(d: ModuleDocument): Promise<string> {
  return createPdfPreviewUrl(await generaPreventivoBlob(datiModelloConfigurabile(d)));
}
