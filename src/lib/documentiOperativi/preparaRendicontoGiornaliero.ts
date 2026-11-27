import { supabase } from "@/integrations/supabase/client";
import { CATEGORIE, importoRiga, leggiRendiconto, type DettaglioRendiconto, type RigaRendiconto } from "@/lib/rendiconti/rendicontiGiornalieri";
import { leggiDestinatarioRapporto } from "./destinatarioRapporto";
import type { DocumentoOperativo } from "./modello";

/** La maggiorazione sta nella descrizione («+25% straord.»); l'importo la include già (importoRiga). */
export const descrizioneRiga = (r: Pick<RigaRendiconto, "descrizione" | "maggiorazione_pct">) =>
  r.maggiorazione_pct > 0 ? `${r.descrizione} (+${String(r.maggiorazione_pct).replace(".", ",")}% straord.)` : r.descrizione;

/**
 * Il rendiconto giornaliero come documento operativo (27/11/2026): testata col committente, righe per
 * categoria con quantità, unità, prezzo e importo, totale, e lo spazio «Per accettazione» che il PDF
 * dell'economia già stampa. Una bozza esce con «BOZZA».
 */
export function documentoDaRendiconto(
  d: DettaglioRendiconto,
  destinatario: DocumentoOperativo["destinatario"],
  commessa: string | null,
): DocumentoOperativo {
  const { testata } = d;
  const righe = CATEGORIE.flatMap((c) =>
    d.righe.filter((r) => r.categoria === c.valore).map((r) => ({
      descrizione: descrizioneRiga(r),
      unita: r.unita,
      quantita: r.quantita,
      prezzo: r.prezzo_unitario,
      importo: importoRiga(r),
      gruppo: c.titolo,
      data: testata.data,
      nota: r.note,
    })),
  );
  const note = [testata.descrizione_lavori, testata.note].filter(Boolean).join("\n") || null;
  return {
    tipo: "economia",
    rendicontoGiornaliero: true,
    numero: String(testata.numero),
    data: testata.data,
    destinatario,
    commessa,
    periodo: testata.data,
    note,
    righe,
    ...(testata.stato === "bozza" ? { bozza: true } : {}),
  };
}

export async function preparaRendicontoGiornaliero(companyId: string, rendicontoId: string): Promise<DocumentoOperativo> {
  const dettaglio = await leggiRendiconto(rendicontoId);
  if (!dettaglio.righe.length) throw new Error("Il rendiconto non ha righe: aggiungine prima di stamparlo.");
  const orderId = dettaglio.testata.order_id;
  const [destinatario, ordine] = await Promise.all([
    leggiDestinatarioRapporto(companyId, orderId),
    supabase.from("orders").select("order_code").eq("id", orderId).maybeSingle(),
  ]);
  return documentoDaRendiconto(dettaglio, destinatario, (ordine.data as { order_code: string | null } | null)?.order_code ?? null);
}
