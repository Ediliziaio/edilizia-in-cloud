import { supabase } from "@/integrations/supabase/client";
import { CATEGORIE, importoRiga, leggiIvaRendiconto, leggiRendiconto, viaggioInParole, type DettaglioRendiconto, type RigaRendiconto } from "@/lib/rendiconti/rendicontiGiornalieri";
import { leggiDestinatarioRapporto } from "./destinatarioRapporto";
import type { DocumentoOperativo } from "./modello";

/** La maggiorazione sta nella descrizione («+25% straord.»); l'importo la include già (importoRiga). */
export const descrizioneRiga = (r: Pick<RigaRendiconto, "descrizione" | "maggiorazione_pct">) =>
  r.maggiorazione_pct > 0 ? `${r.descrizione} (+${String(r.maggiorazione_pct).replace(".", ",")}% straord.)` : r.descrizione;

/**
 * Un rendiconto di soli trasporti usa il modello PDF dei trasporti (28/11/2026): data, carico →
 * scarico, km, quantità e tariffa, mezzo, DDT, importo. Un giorno misto (manodopera e un viaggio)
 * resta sul modello dell'economia: lì il viaggio si legge nella nota della riga.
 */
export const soloTrasporti = (righe: Array<Pick<RigaRendiconto, "categoria" | "viaggio">>) =>
  righe.length > 0 && righe.every((r) => r.categoria === "trasporto") && righe.some((r) => !!r.viaggio);

const numeroDa = (v: string | undefined) => {
  if (!v?.trim()) return undefined;
  const n = Number(v.trim().replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

/** Una riga di trasporto come la vuole il modello PDF dei trasporti. */
export const rigaTrasporto = (r: RigaRendiconto, data: string) => ({
  descrizione: descrizioneRiga(r),
  unita: r.unita,
  quantita: r.quantita,
  prezzo: r.prezzo_unitario,
  importo: importoRiga(r),
  data,
  carico: r.viaggio?.carico ?? undefined,
  scarico: r.viaggio?.scarico ?? undefined,
  mezzo: r.viaggio?.mezzo ?? undefined,
  ddt: r.viaggio?.ddt ?? undefined,
  km: numeroDa(r.viaggio?.km),
  nota: r.note,
});

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
      // Il viaggio è il contenuto della riga di trasporto: senza, al committente resta «Trasporto».
      nota: [viaggioInParole(r.viaggio), r.note].filter(Boolean).join(" · ") || null,
    })),
  );
  const note = [testata.descrizione_lavori, testata.note].filter(Boolean).join("\n") || null;
  if (soloTrasporti(d.righe)) {
    return {
      tipo: "trasporti",
      rendicontoTrasporti: true,
      rendicontoGiornaliero: true,
      numero: String(testata.numero),
      data: testata.data,
      destinatario,
      commessa,
      periodo: testata.data,
      note,
      righe: d.righe.map((r) => rigaTrasporto(r, testata.data)),
      ...(testata.stato === "bozza" ? { bozza: true } : {}),
    };
  }
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

/**
 * L'IVA del rendiconto (28/11/2026), letta una volta per commessa:
 * - contratto in **inversione contabile** → l'IVA non si applica e il documento stampa la clausola
 *   (altrimenti il committente legge un imponibile e aspetta un'IVA che non arriverà);
 * - **aliquota scelta** sulla commessa → il documento mostra imponibile, IVA e totale, e dice se i
 *   prezzi la comprendono già;
 * - niente di tutto questo → come prima: importi IVA esclusa.
 */
export async function ivaDellaCommessa(orderId: string): Promise<Pick<DocumentoOperativo, "inversioneContabile" | "ivaRendiconto">> {
  try {
    const iva = await leggiIvaRendiconto(orderId);
    if (iva.inversione) return { inversioneContabile: true };
    return iva.iva_pct != null ? { ivaRendiconto: { pct: Number(iva.iva_pct), compresa: !!iva.iva_compresa } } : {};
  } catch {
    return {}; // Il PDF esce lo stesso: senza la scelta si stampa il totale IVA esclusa di sempre.
  }
}

export async function preparaRendicontoGiornaliero(companyId: string, rendicontoId: string): Promise<DocumentoOperativo> {
  const dettaglio = await leggiRendiconto(rendicontoId);
  if (!dettaglio.righe.length) throw new Error("Il rendiconto non ha righe: aggiungine prima di stamparlo.");
  const orderId = dettaglio.testata.order_id;
  const [destinatario, ordine, iva] = await Promise.all([
    leggiDestinatarioRapporto(companyId, orderId),
    supabase.from("orders").select("order_code").eq("id", orderId).maybeSingle(),
    ivaDellaCommessa(orderId),
  ]);
  return { ...documentoDaRendiconto(dettaglio, destinatario, (ordine.data as { order_code: string | null } | null)?.order_code ?? null), ...iva };
}
