/**
 * Più rendiconti giornalieri in un documento solo (28/11/2026): «Crea documento PDF» dell'elenco,
 * come il rapporto del periodo dei rapportini. Un blocco per giorno, dentro le righe nell'ordine delle
 * categorie (manodopera, mezzi, trasporti, materiali, altre voci), e in fondo il totale del periodo.
 *
 * Si stampa quello che si vede: i rendiconti passati sono quelli già filtrati nell'elenco. Se dentro
 * c'è una bozza il documento esce con «BOZZA», come il rendiconto del singolo giorno.
 */
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIE, importoRiga, leggiRendiconto, viaggioInParole, type RendicontoGiornaliero } from "@/lib/rendiconti/rendicontiGiornalieri";
import { descrizioneRiga, inversioneDellaCommessa, rigaTrasporto, soloTrasporti } from "./preparaRendicontoGiornaliero";
import { leggiDestinatarioRapporto } from "./destinatarioRapporto";
import type { DocumentoOperativo } from "./modello";

const giornoIt = (d: string) => d.split("-").reverse().join("/");

/** «dal 01/12/2026 al 18/12/2026», o il solo giorno se è uno. */
export function periodoInParole(date: string[]): string {
  const ordinate = [...new Set(date)].sort();
  if (!ordinate.length) return "";
  if (ordinate.length === 1) return giornoIt(ordinate[0]);
  return `dal ${giornoIt(ordinate[0])} al ${giornoIt(ordinate[ordinate.length - 1])}`;
}

export async function preparaRendicontoPeriodo(
  companyId: string,
  orderId: string,
  rendiconti: RendicontoGiornaliero[],
): Promise<DocumentoOperativo> {
  const utili = rendiconti.filter((r) => r.stato !== "annullato" && r.righe > 0)
    .sort((a, b) => a.data.localeCompare(b.data) || a.numero - b.numero);
  if (!utili.length) throw new Error("Nessun rendiconto con righe da stampare.");

  const dettagli = await Promise.all(utili.map((r) => leggiRendiconto(r.id)));
  const righe = dettagli.flatMap((d) => {
    const gruppo = `${giornoIt(d.testata.data)} · ${d.testata.stato === "bozza" ? "bozza " : ""}n. ${d.testata.numero}`;
    return CATEGORIE.flatMap((c) =>
      d.righe.filter((r) => r.categoria === c.valore).map((r) => ({
        descrizione: descrizioneRiga(r),
        unita: r.unita,
        quantita: r.quantita,
        prezzo: r.prezzo_unitario,
        importo: importoRiga(r),
        gruppo,
        data: d.testata.data,
        nota: [viaggioInParole(r.viaggio), r.note].filter(Boolean).join(" · ") || null,
      })),
    );
  });

  const [destinatario, ordine, iva] = await Promise.all([
    leggiDestinatarioRapporto(companyId, orderId),
    supabase.from("orders").select("order_code").eq("id", orderId).maybeSingle(),
    inversioneDellaCommessa(orderId),
  ]);
  const bozza = utili.some((r) => r.stato === "bozza");
  const tutteLeRighe = dettagli.flatMap((d) => d.righe);
  const lavori = dettagli.map((d) => d.testata.descrizione_lavori?.trim()).filter(Boolean);
  const comune = {
    numero: `${utili[0].numero}-${utili[utili.length - 1].numero}`,
    data: utili[utili.length - 1].data,
    destinatario,
    commessa: (ordine.data as { order_code: string | null } | null)?.order_code ?? null,
    periodo: periodoInParole(utili.map((r) => r.data)),
    ...iva,
    note: lavori.join("\n") || null,
    ...(bozza ? { bozza: true } : {}),
  };
  // Tutti trasporti: il modello PDF dei trasporti, con carico, scarico, km, mezzo e DDT in colonna.
  if (soloTrasporti(tutteLeRighe)) {
    return {
      ...comune,
      tipo: "trasporti",
      rendicontoTrasporti: true,
      rendicontoGiornaliero: true,
      righe: dettagli.flatMap((d) => d.righe.map((r) => rigaTrasporto(r, d.testata.data))),
    };
  }
  return {
    ...comune,
    tipo: "economia",
    rendicontoGiornaliero: true,
    righe,
  };
}
