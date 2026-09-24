/**
 * Registra una fattura ricevuta in fatture_ricevute, con il file originale
 * nello storage. Una sola strada per il caricamento a mano, il webhook e
 * l'importazione da openapi (24/09/2026): prima ricevi-sdi ne aveva due copie,
 * e l'importazione da openapi sarebbe stata la terza.
 *
 * Cosa fa, nell'ordine:
 *   1. cerca un doppione (id openapi, identificativo SDI, fornitore + numero +
 *      data). Se lo trova non scrive niente; al più gli aggancia l'id openapi,
 *      così il giro dopo non lo riscarica;
 *   2. salva il file COSÌ COM'È ARRIVATO (anche il .p7m firmato): è quello
 *      che ha valore legale e che il commercialista vuole;
 *   3. scrive la riga con l'XML in chiaro, per l'anteprima e per i conti.
 *
 * Il file va in un percorso che non si ripete: prima era IT<piva>_<numero>.xml,
 * e la fattura «1» del 2026 di un fornitore sovrascriveva nello storage la sua
 * fattura «1» del 2025.
 */
import type { FatturaRicevutaLetta } from "./fatturaRicevutaXml.ts";
import { percorsoOriginale } from "./ricevuteOpenapi.ts";

export interface FatturaDaSalvare {
  companyId: string;
  /** L'XML in chiaro: se il file era firmato, il suo contenuto. */
  xml: string;
  letta: FatturaRicevutaLetta;
  /** Il file ricevuto, byte per byte. Se manca si salva l'XML in chiaro. */
  originale?: Uint8Array | null;
  /** Il nome che lo SDI ha dato al file, se si conosce. */
  nomeFileSdi?: string | null;
  openapiId?: string | null;
  /** IdentificativoSdI della consegna (non è dentro l'XML). */
  identificativoSdi?: string | null;
  /**
   * Quando lo SDI l'ha consegnata al nostro canale. È la data che conta per
   * detrarre l'IVA (art. 19 DPR 633/72 e art. 1 DPR 100/1998), non quella
   * scritta dal fornitore. La sa solo chi riceve dallo SDI: openapi sì, il
   * caricamento a mano di un XML no.
   */
  ricevutaIl?: string | null;
}

export interface EsitoSalvataggio {
  id: string | null;
  doppione: boolean;
  errore?: string;
  percorso?: string;
}

// deno-lint-ignore no-explicit-any
type Client = any;

async function cercaDoppione(supabase: Client, f: FatturaDaSalvare, idSdi: string | null) {
  if (f.openapiId) {
    const { data } = await supabase.from("fatture_ricevute").select("id, openapi_id")
      .eq("company_id", f.companyId).eq("openapi_id", f.openapiId).limit(1).maybeSingle();
    if (data?.id) return data as { id: string; openapi_id: string | null };
  }
  if (idSdi) {
    const { data } = await supabase.from("fatture_ricevute").select("id, openapi_id")
      .eq("company_id", f.companyId).eq("sdi_id_trasmissione", idSdi).limit(1).maybeSingle();
    if (data?.id) return data as { id: string; openapi_id: string | null };
  }
  const l = f.letta;
  if (l.cedente_piva && l.numero_fattura && l.data_fattura) {
    const { data } = await supabase.from("fatture_ricevute").select("id, openapi_id")
      .eq("company_id", f.companyId)
      .eq("cedente_piva", l.cedente_piva)
      .eq("numero_fattura", l.numero_fattura)
      .eq("data_fattura", l.data_fattura)
      .limit(1).maybeSingle();
    if (data?.id) return data as { id: string; openapi_id: string | null };
  }
  return null;
}

export async function salvaFatturaRicevuta(supabase: Client, f: FatturaDaSalvare): Promise<EsitoSalvataggio> {
  const l = f.letta;
  const idSdi = (f.identificativoSdi || l.sdi_id_trasmissione || "").trim() || null;

  const doppione = await cercaDoppione(supabase, f, idSdi);
  if (doppione) {
    // Già registrata a mano o da un altro canale: la si riconosce, non la si
    // riscrive (il contenuto di una fattura ricevuta non si modifica).
    if (f.openapiId && !doppione.openapi_id) {
      await supabase.from("fatture_ricevute").update({ openapi_id: f.openapiId }).eq("id", doppione.id);
    }
    return { id: doppione.id, doppione: true };
  }

  const firmata = (!!f.originale && f.originale[0] === 0x30) || /\.p7m$/i.test(f.nomeFileSdi ?? "");
  const percorso = percorsoOriginale(
    f.companyId,
    f.nomeFileSdi ?? null,
    l.cedente_piva || l.cedente_cf || "SCONOSCIUTO",
    l.numero_fattura,
    l.data_fattura,
    firmata,
  );
  const contenuto = f.originale ?? new TextEncoder().encode(f.xml);
  const { error: erroreFile } = await supabase.storage
    .from("fatture-xml")
    .upload(percorso, new Blob([new Uint8Array(contenuto)], { type: firmata ? "application/pkcs7-mime" : "application/xml" }), {
      upsert: true,
    });
  if (erroreFile) {
    // Senza il file originale la riga c'è lo stesso: l'XML è in xml_raw.
    console.warn(`[salvaFatturaRicevuta] storage ${percorso}: ${erroreFile.message}`);
  }

  const { data: inserita, error } = await supabase
    .from("fatture_ricevute")
    .insert({
      company_id: f.companyId,
      sdi_id_trasmissione: idSdi,
      sdi_progressivo: l.sdi_progressivo || null,
      cedente_piva: l.cedente_piva,
      cedente_cf: l.cedente_cf,
      cedente_ragione_sociale: l.cedente_ragione_sociale,
      cedente_paese: l.cedente_paese,
      cedente_indirizzo: l.cedente_indirizzo,
      cedente_cap: l.cedente_cap,
      cedente_comune: l.cedente_comune,
      cedente_provincia: l.cedente_provincia,
      tipo_documento: l.tipo_documento,
      numero_fattura: l.numero_fattura,
      data_fattura: l.data_fattura,
      imponibile_totale: l.imponibile_totale,
      iva_totale: l.iva_totale,
      totale_documento: l.totale_documento,
      righe: l.righe,
      riepilogo_iva: l.riepilogo_iva,
      xml_raw: f.xml,
      xml_url: erroreFile ? null : percorso,
      openapi_id: f.openapiId ?? null,
      data_ricezione_sdi: f.ricevutaIl ?? null,
      note: l.fatture_nel_file > 1
        ? `Il file contiene ${l.fatture_nel_file} fatture (un lotto): qui c'è la prima. Le altre vanno registrate a mano dal file originale.`
        : null,
      stato: "non_letta",
    })
    .select("id")
    .single();

  if (error) {
    // 23505: un altro giro (o un'altra strada) l'ha appena registrata.
    if ((error as { code?: string }).code === "23505") return { id: null, doppione: true };
    return { id: null, doppione: false, errore: error.message, percorso };
  }
  return { id: inserita?.id ?? null, doppione: false, percorso };
}

/** Avviso in app agli amministratori dell'azienda: è arrivata una fattura. */
export async function avvisaFatturaRicevuta(
  supabase: Client,
  companyId: string,
  id: string,
  l: FatturaRicevutaLetta,
): Promise<void> {
  try {
    // Gli amministratori dell'azienda: profilo dell'azienda + ruolo company_admin.
    // user_roles non ha company_id: la versione di prima (ripresa da ricevi-sdi)
    // filtrava su una colonna che non esiste, falliva e l'avviso non partiva mai.
    const { data: profili } = await supabase
      .from("profiles")
      .select("id")
      .eq("company_id", companyId)
      .is("deleted_at", null);
    const ids = ((profili ?? []) as Array<{ id: string }>).map((p) => p.id);
    if (ids.length === 0) return;
    const { data: ruoli } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("user_id", ids)
      .eq("role", "company_admin");
    const destinatari = [...new Set(((ruoli ?? []) as Array<{ user_id: string }>).map((r) => r.user_id))];
    if (destinatari.length === 0) return;
    await supabase.from("notifications").insert(destinatari.map((userId) => ({
      company_id: companyId,
      user_id: userId,
      type: "fattura_ricevuta",
      title: "Nuova fattura passiva ricevuta",
      body: `Fattura ${l.numero_fattura} da ${l.cedente_ragione_sociale} — €${l.totale_documento.toFixed(2)}`,
      entity_type: "fattura_ricevuta",
      entity_id: id,
      action_url: "/azienda/documenti/fatture-ricevute",
    })));
  } catch (e) {
    // L'avviso non è la fattura: se non parte, la fattura resta registrata.
    console.warn("[avvisaFatturaRicevuta]", e);
  }
}
