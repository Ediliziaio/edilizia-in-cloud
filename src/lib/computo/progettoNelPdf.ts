import { caricaPlanimetria, caricaVersione } from "@/lib/planimetrie/archivio";
import { allegatoPreventivo } from "@/lib/planimetrie/esporta/allegato";
import { vistaDaPlanimetria } from "@/lib/planimetrie/esporta/adattatore";
import type { DatiCartiglio } from "@/lib/planimetrie/esporta/tipi";
import { esigiVerificaDocumento } from "../../../shared/planimetrie/verificaDocumento";
import type { AllegatoPdfComputo } from "./allegatiLocali";
import type { OrigineComputoPianta } from "./computoDallaPianta";

/** L'allegato viene dalla versione confermata nella bozza, anche se il disegno è già avanzato. */
export async function allegatoProgettoComputo(
  companyId: string,
  collegamento: OrigineComputoPianta,
  scelta: "tavola" | "fascicolo",
  cartiglio: DatiCartiglio,
): Promise<AllegatoPdfComputo> {
  const { riga, versione } = await caricaPlanimetria(collegamento.id);
  if (riga.company_id !== companyId) throw new Error("La planimetria del computo non è disponibile per questa azienda.");
  const salvata = versione.numero === collegamento.versione ? versione : await caricaVersione(riga.id, collegamento.versione);
  const documento = salvata.documento;
  const piano = documento.livelli.find(l => l.id === collegamento.livelloId);
  const proposta = piano?.proposte.find(p => p.id === collegamento.propostaId);
  if (!piano || (collegamento.propostaId && !proposta)) throw new Error("Il piano o la proposta della versione collegata non è disponibile.");
  esigiVerificaDocumento(documento, "pdf");
  const datiCartiglio = { ...cartiglio, versione: `v${salvata.numero}`, oggetto: proposta?.nome ?? "Stato di fatto" };
  let dati: Uint8Array;
  if (scelta === "fascicolo") {
    const [{ esportaFascicolo }, { renderPerFascicolo, campioniPersonaliPerFascicolo }] = await Promise.all([
      import("@/lib/planimetrie/fascicoloPdf"), import("@/lib/planimetrie/fascicoloDati"),
    ]);
    const renders = await renderPerFascicolo(companyId, riga.id);
    ({ dati } = await esportaFascicolo({
      documento, titolo: collegamento.titolo, versione: salvata.numero,
      ambito: proposta ? `progetto:${proposta.id}` : "fatto", cartiglio: datiCartiglio,
      renders, renderDaIncludere: "ultimi",
      leggiCampioniPersonali: render => campioniPersonaliPerFascicolo(companyId, render.scelte),
    }));
  } else {
    const vista = vistaDaPlanimetria(documento, { livelloId: piano.id, propostaId: proposta?.id, modo: proposta ? "confronto" : "fatto" });
    ({ dati } = await allegatoPreventivo(vista, datiCartiglio));
  }
  return {
    nome: `${scelta === "fascicolo" ? "Fascicolo" : "Tavola"} · ${collegamento.titolo} · v${salvata.numero}.pdf`,
    tipo: "planimetria", blob: new Blob([new Uint8Array(dati)], { type: "application/pdf" }), conservaScala: true,
  };
}
