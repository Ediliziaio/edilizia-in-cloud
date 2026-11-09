/**
 * «Prepara dalla giornata»: legge dal browser i dati del giorno, con le regole di
 * accesso di chi preme, e li passa al modulo puro. Quel che l'utente non può
 * leggere non dà errore (le policy rispondono «zero righe»): per questo si avvisa.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  COLONNE_DDT_BOZZA, STATI_DDT_NON_ARRIVATO, STATI_RAPPORTINO_BOZZA, commessaDelDdt, componiBozzaGiornale,
  intervalloGiornoRoma, type BozzaGiornale, type DdtPerBozza, type RapportinoPerBozza, type SegnalazionePerBozza,
} from "../../../supabase/functions/_shared/bozzaGiornale";

export interface PermessiBozza {
  /** Titolare o super amministratore: legge tutte le bolle e le segnalazioni. */
  amministratore: boolean;
  vedeRapportini: boolean;
  vedeSegnalazioni: boolean;
}

export interface BozzaLetta {
  bozza: BozzaGiornale;
  avvisi: string[];
}

type ConAutore = RapportinoPerBozza & { autore?: { first_name?: string | null; last_name?: string | null } | null };

export async function leggiBozzaGiornale(
  db: SupabaseClient,
  { companyId, orderId, data, permessi }: { companyId: string; orderId: string; data: string; permessi: PermessiBozza },
): Promise<BozzaLetta> {
  const { inizio, fine } = intervalloGiornoRoma(data);
  const avvisi: string[] = [];
  if (!permessi.amministratore && !permessi.vedeRapportini) {
    avvisi.push("Il tuo utente non vede i rapportini di tutti: la proposta può essere incompleta.");
  }

  const vedeSegnalazioni = permessi.amministratore || permessi.vedeSegnalazioni;
  if (!vedeSegnalazioni) avvisi.push("Segnalazioni dal campo non riportate: il tuo utente non può leggerle.");
  if (!permessi.amministratore) avvisi.push("Delle bolle sono riportate solo quelle dei magazzini a cui sei assegnato.");

  const [raps, bolle, segnalazioni, foto] = await Promise.all([
    db.from("campo_rapportini")
      .select("id, user_id, stato, ore_lavorate, ore_straordinario, presenze, descrizione_lavori, materiali_usati, mezzi_usati, meteo, percentuale_avanzamento, autore:profiles!campo_rapportini_user_id_fkey(first_name, last_name)")
      .eq("company_id", companyId).eq("order_id", orderId).eq("data_lavoro", data).in("stato", [...STATI_RAPPORTINO_BOZZA]),
    db.from("ddt_ricezione").select(COLONNE_DDT_BOZZA)
      .eq("company_id", companyId).eq("data_ricezione", data)
      .not("stato", "in", `(${STATI_DDT_NON_ARRIVATO.join(",")})`),
    vedeSegnalazioni
      ? db.from("tickets").select("id, titolo, subject, descrizione")
        .eq("company_id", companyId).eq("order_id", orderId).eq("fonte", "campo").gte("created_at", inizio).lte("created_at", fine)
      : Promise.resolve({ data: [] as SegnalazionePerBozza[], error: null }),
    db.from("foto_cantiere").select("id")
      .eq("company_id", companyId).eq("order_id", orderId).gte("taken_at", inizio).lte("taken_at", fine),
  ]);

  // Senza i rapportini non c'è proposta; il resto, se manca, si dice e si va avanti.
  if (raps.error) throw new Error("Non riesco a leggere i rapportini del giorno.");
  if (bolle.error) avvisi.push("Non sono riuscito a leggere le bolle del giorno.");
  if (segnalazioni.error) avvisi.push("Non sono riuscito a leggere le segnalazioni del giorno.");
  if (foto.error) avvisi.push("Non sono riuscito a leggere le foto del giorno.");

  const rapportini = (raps.data ?? []) as unknown as ConAutore[];
  const nomiAutori: Record<string, string> = {};
  for (const r of rapportini) {
    const nome = [r.autore?.first_name, r.autore?.last_name].filter(Boolean).join(" ").trim();
    if (r.user_id && nome) nomiAutori[r.user_id] = nome;
  }

  const bozza = componiBozzaGiornale({
    rapportini,
    ddt: bolle.error ? [] : ((bolle.data ?? []) as unknown as DdtPerBozza[]).filter((d) => commessaDelDdt(d) === orderId),
    segnalazioni: segnalazioni.error ? [] : ((segnalazioni.data ?? []) as SegnalazionePerBozza[]),
    fotoIds: foto.error ? [] : ((foto.data ?? []) as Array<{ id: string }>).map((f) => f.id),
    nomiAutori,
  });
  return { bozza, avvisi };
}
