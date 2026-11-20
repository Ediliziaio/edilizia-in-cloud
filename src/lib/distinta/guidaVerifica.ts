import type { MaterialeFase } from "@/hooks/useMaterialiPerFase";
import { verificaDelMateriale } from "./verificaAcquisto";

export function guidaVerifica(m: Pick<MaterialeFase, "name" | "origini">) {
  const verifica = verificaDelMateriale(m);
  const campi = new Set(verifica?.campi_mancanti ?? []);
  const dati = m.origini?.flatMap(o => "dati_documentali" in o && o.dati_documentali ? [o.dati_documentali] : [])[0];
  const azioni: { titolo: string; dettaglio: string; fonte: string }[] = [];
  const abaco = ["abaco", "misure", "larghezza", "altezza", "pezzi"].some(c => campi.has(c));
  if (abaco) azioni.push({ titolo: "Completa pezzi e misure", dettaglio: "Abbina ogni vano al prodotto e alle sue dimensioni. Una superficie totale non basta per ordinare i singoli pezzi.", fonte: "Rilievo o abaco del progetto" });
  if (["modello", "specifiche", "inclusioni", "compatibilita", "corrente_nominale"].some(c => campi.has(c))) {
    azioni.push({ titolo: "Conferma il prodotto e cosa comprende", dettaglio: "Indica modello, caratteristiche e accessori inclusi nella fornitura.", fonte: "Offerta o scheda tecnica del fornitore" });
  }
  if (["quantita", "unita", "resa", "confezione", "sfrido"].some(c => campi.has(c))) {
    azioni.push({ titolo: campi.has("quantita") || campi.has("resa") ? "Verifica quanto comprare" : "Conferma l'unità d'acquisto",
      dettaglio: abaco ? "Usa i pezzi dell'abaco verificato, senza trasformare automaticamente i m² in pezzi."
        : campi.has("resa") ? "Usa la resa del prodotto, le mani o gli strati e il contenuto della confezione per calcolare il quantitativo."
        : "Controlla che quantità e unità si riferiscano al prodotto da acquistare e non alla sola lavorazione.",
      fonte: "Scheda del prodotto e quantità di lavoro" });
  }
  if (!azioni.length && verifica?.stato === "da_verificare") azioni.push({ titolo: "Conferma i dati del materiale", dettaglio: "Verifica prodotto, quantità e unità con la fonte più adatta prima di salvare.", fonte: "Documento, rilievo o fornitore" });
  const tipoQuantita = dati?.quantita === "documentata" ? "Quantità letta dal documento" : dati?.quantita === "ricostruita" ? "Quantità ricostruita dai dati"
    : dati?.quantita === "stimata" ? "Quantità proposta da una ricetta" : "Quantità da confermare";
  return { dati, azioni, tipoQuantita };
}
