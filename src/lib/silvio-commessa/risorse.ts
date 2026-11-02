/**
 * I dati veri per le proposte di persone, ditte, mezzi e acquisti (1/11/2026, fase 4).
 * Il conto lo fa `proposteRisorse` (shared/silvio-commessa/risorse.ts); qui solo letture, col
 * client di chi apre il popup: la RLS decide cosa vede. Una lettura che non riesce lascia
 * vuota la sua parte (niente proposta), non ferma il popup.
 *
 * Lo staff arriva da fuori (useCompanyStaffUsers): i clienti sono profili anche loro, e un
 * capomastro si sceglie solo fra lo staff.
 */
import type { ContestoRisorse, RichiestaOfferta } from "../../../shared/silvio-commessa/risorse.ts";
import {
  leggiContestoRisorse as leggiContesto, righe, testo, data, uno, type ClientRisorse, type Riga,
} from "../../../shared/silvio-commessa/contestoRisorse.ts";
import { supabase } from "@/integrations/supabase/client";

export type { ClientRisorse };

/** Il contesto delle proposte, col client di chi apre il popup (fase 5: il conto sta in shared/). */
export function leggiContestoRisorse(
  companyId: string, staff: ContestoRisorse["staff"], orderId: string | null = null,
  db: ClientRisorse = supabase as unknown as ClientRisorse,
): Promise<ContestoRisorse> {
  return leggiContesto(companyId, staff, orderId, db);
}


/** Le richieste d'offerta aperte, fornitore per fornitore: a quale risponde un'offerta caricata. */
export async function elencaRichiesteOfferta(companyId: string, db: ClientRisorse = supabase as unknown as ClientRisorse): Promise<RichiestaOfferta[]> {
  const r = await righe(db.from("supplier_rfq_suppliers")
    .select("id, supplier_id, fornitore:suppliers(name), richiesta:supplier_rfqs!inner(rfq_number, titolo, data_fabbisogno, status, company_id)")
    .eq("richiesta.company_id", companyId).order("created_at", { ascending: false }).limit(200));
  return r
    .map((x) => ({ x, rich: uno(x.richiesta as Riga | Riga[] | null) }))
    .filter(({ rich }) => rich && !/aggiudicat|annullat|chius/i.test(testo(rich.status)))
    .map(({ x, rich }) => ({
      id: x.id as string, supplier_id: x.supplier_id as string,
      fornitore: testo(uno(x.fornitore as Riga | Riga[] | null)?.name) || "Fornitore",
      rfq_number: (rich!.rfq_number as string | null) ?? null, titolo: (rich!.titolo as string | null) ?? null,
      data_fabbisogno: data(rich!.data_fabbisogno),
    }));
}

/** Le quantità delle voci della richiesta, per descrizione: l'offerta dice i prezzi, la richiesta le quantità. */
export async function quantitaRichiesta(rfqSupplierId: string, db: ClientRisorse = supabase as unknown as ClientRisorse): Promise<Record<string, number>> {
  const [riga] = await righe(db.from("supplier_rfq_suppliers").select("rfq_id").eq("id", rfqSupplierId).limit(1));
  if (!riga?.rfq_id) return {};
  const voci = await righe(db.from("supplier_rfq_items").select("descrizione, quantita").eq("rfq_id", riga.rfq_id as string));
  return Object.fromEntries(voci.filter((v) => testo(v.descrizione)).map((v) => [testo(v.descrizione).trim(), Number(v.quantita) || 1]));
}
