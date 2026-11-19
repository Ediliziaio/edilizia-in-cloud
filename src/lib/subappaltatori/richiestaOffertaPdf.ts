import { testoComprende } from "./contrattoSubappaltoHtml";
import { dataIt, type AziendaDocumento, type DocumentoOperativo, type RigaDocumentoOperativo } from "../documentiOperativi/modello";
import type { RichiestaDaLavorazioni } from "./richiesteDaLavorazioni";

export const riferimentoRichiestaSubappalto = (id: string) => `SUB-${id.slice(0, 8).toUpperCase()}`;

export function documentoRichiestaSubappalto(dati: RichiestaDaLavorazioni): DocumentoOperativo {
  return {
    tipo: "richiesta",
    riguardaLavori: true,
    numero: riferimentoRichiestaSubappalto(dati.id),
    data: dati.creataIl.slice(0, 10),
    destinatario: { ...dati.destinatario, nome: dati.ditta },
    commessa: dati.commessa,
    luogo: dati.luogo,
    periodo: dati.periodo.dal && dati.periodo.al ? `${dataIt(dati.periodo.dal)} – ${dataIt(dati.periodo.al)}` : null,
    inizioLavori: dati.periodo.dal,
    fineLavori: dati.periodo.al,
    scadenzaOfferta: dati.scadenza,
    note: dati.istruzioni,
    righe: dati.righe.map((riga): RigaDocumentoOperativo => ({
      gruppo: riga.fase,
      descrizione: riga.descrizione,
      nota: [riga.sottofase && riga.sottofase !== riga.descrizione ? riga.sottofase : null, testoComprende(riga.comprende)].filter(Boolean).join(" · "),
      quantita: riga.quantita,
      unita: riga.unita ?? "—",
      prezzo: null,
    })),
  };
}

export function nomeComputoRichiesta(dati: RichiestaDaLavorazioni) {
  const codice = String(dati.commessa ?? "").replace(/[^\w-]+/g, "-");
  return `richiesta-offerta-${[codice, riferimentoRichiestaSubappalto(dati.id)].filter(Boolean).join("-")}.pdf`;
}

export async function fileComputoRichiesta(dati: RichiestaDaLavorazioni, azienda: AziendaDocumento) {
  const { generaPdfOperativo } = await import("../documentiOperativi/pdf");
  const pdf = await generaPdfOperativo(documentoRichiestaSubappalto(dati), azienda);
  return new File([pdf], nomeComputoRichiesta(dati), { type: "application/pdf" });
}

export async function scaricaComputoRichiesta(dati: RichiestaDaLavorazioni, azienda: AziendaDocumento) {
  const { scaricaBlob } = await import("@/components/orders/generali/vendita/scarica");
  const file = await fileComputoRichiesta(dati, azienda);
  scaricaBlob(file, file.name);
}
