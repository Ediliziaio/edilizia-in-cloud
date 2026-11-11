import type { RapportinoCompleto } from "@/hooks/useRapportiniMese";
import type { DocumentoOperativo } from "./modello";
import { statoDi } from "@/lib/orders/rapportiniMese";
import {
  rapportoEconomiaDaRapportini,
  type QuadroPerRapporto,
} from "./rapporti";

/** Riusa i prezzi di vendita registrati, mai i costi. Nessuna scrittura contabile. */
export async function preparaRapportoEconomia(
  righe: RapportinoCompleto[],
  periodo: string,
  leggiQuadro?: (id: string) => Promise<QuadroPerRapporto | null>,
  signal?: AbortSignal,
  leggiDestinatario?: () => Promise<DocumentoOperativo["destinatario"]>,
) {
  const approvati = righe.filter((r) => statoDi(r) === "approvato");
  if (!approvati.length)
    throw new Error(
      "Approva almeno un rapportino per preparare il riepilogo lavori.",
    );
  if (new Set(approvati.map((r) => r.order_id)).size !== 1)
    throw new Error(
      "Scegli un solo cantiere per preparare il riepilogo lavori.",
    );
  const quadri = new Map<string, QuadroPerRapporto>();
  const destinatario = leggiDestinatario ? await leggiDestinatario() : null;
  if (leggiQuadro) {
    // Quattro richieste al massimo, anche selezionando molti mesi.
    for (let i = 0; i < approvati.length; i += 4) {
      if (signal?.aborted)
        throw new DOMException("Preparazione annullata", "AbortError");
      const blocco = await Promise.all(
        approvati
          .slice(i, i + 4)
          .map(async (r) => [r.id, await leggiQuadro(r.id)] as const),
      );
      for (const [id, q] of blocco) if (q) quadri.set(id, q);
    }
  }
  if (signal?.aborted)
    throw new DOMException("Preparazione annullata", "AbortError");
  const documento = rapportoEconomiaDaRapportini(approvati, periodo, quadri);
  if (destinatario) documento.destinatario = destinatario;
  if (!documento.righe.length)
    throw new Error(
      "I rapportini approvati non contengono ancora descrizioni, ore o quantità: completa i dati del lavoro.",
    );
  return documento;
}
