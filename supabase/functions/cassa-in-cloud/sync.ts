import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { giornoCassa, spostaGiornoCassa, type EsitoImportCassa } from "../../../shared/cassaInCloud.ts";
import { ClientCassaInCloud, ErroreCassa } from "./client.ts";

export async function partitaIvaCassa(admin: SupabaseClient, companyId: string, vatNumber: string | null) {
  const { data, error } = await admin.from("anagrafica_azienda").select("partita_iva").eq("company_id", companyId).maybeSingle();
  if (error) throw error;
  return [vatNumber, data?.partita_iva ?? null];
}

export async function importaPeriodoCassa(
  admin: SupabaseClient, companyId: string, puntoId: string, partiteIva: Array<string | null>,
  dal: string, al: string, conChiusure: boolean,
): Promise<EsitoImportCassa> {
  const chiavePunto = { p_company_id: companyId, p_punto_vendita_id: puntoId };
  const { data, error } = await admin.rpc("cassa_in_cloud_inizia_import", chiavePunto).maybeSingle();
  if (error) throw error;
  const prenotazione = data as { import_id: string; chiave: string | null } | null;
  if (!prenotazione) throw new ErroreCassa("Il punto vendita è scollegato o ha già un’importazione in corso.", 409);

  let salvato = false;
  try {
    if (!prenotazione.chiave) throw new ErroreCassa("Ricollega il punto vendita con una chiave valida.", 422);
    const client = new ClientCassaInCloud(prenotazione.chiave);
    const punti = await client.puntiVendita(partiteIva);
    if (!punti.some((p) => p.id === puntoId && p.compatibile)) {
      throw new ErroreCassa("La chiave non consente più di importare da questo punto vendita per l’azienda.", 422);
    }
    const [scontrini, chiusure] = await Promise.all([
      client.scontrini(puntoId, dal, al),
      // Una giornata fiscale può essersi chiusa dopo la mezzanotte.
      conChiusure ? client.chiusure(puntoId, dal, al === giornoCassa() ? al : spostaGiornoCassa(al, 1)) : null,
    ]);
    const risultato = await admin.rpc("cassa_in_cloud_salva_periodo", {
      ...chiavePunto, p_import_id: prenotazione.import_id, p_dal: dal, p_al: al, p_righe: scontrini, p_chiusure: chiusure,
    }).maybeSingle();
    if (risultato.error) throw risultato.error;
    if (!risultato.data) throw new ErroreCassa("Il collegamento è cambiato durante l’importazione. Riprova.", 409);
    salvato = true;
    return risultato.data as EsitoImportCassa;
  } finally {
    if (!salvato) {
      await admin.from("cassa_in_cloud_punti_vendita").update({ import_id: null, import_scade: null })
        .eq("company_id", companyId).eq("punto_vendita_id", puntoId).eq("import_id", prenotazione.import_id);
    }
  }
}

export async function sincronizzaPuntiCassa(admin: SupabaseClient) {
  const { data, error } = await admin.rpc("cassa_in_cloud_prossimi_sync");
  if (error) throw error;
  const oggi = giornoCassa();
  const ieri = spostaGiornoCassa(oggi, -1);
  const punti = (data ?? []) as Array<{ company_id: string; punto_vendita_id: string }>;
  const esiti = await Promise.allSettled(punti.map(async ({ company_id, punto_vendita_id }) => {
    const eventiPunto = () => admin.from("cassa_in_cloud_eventi").select("giorno,richiesto_il")
      .eq("company_id", company_id).eq("punto_vendita_id", punto_vendita_id).order("richiesto_il").limit(1).maybeSingle();
    const aggiorna = (campi: Record<string, unknown>) => admin.from("cassa_in_cloud_punti_vendita").update(campi)
      .eq("company_id", company_id).eq("punto_vendita_id", punto_vendita_id).eq("sync_attivo", true);
    try {
      const [azienda, evento] = await Promise.all([
        admin.from("companies").select("vat_number").eq("id", company_id).is("deleted_at", null).maybeSingle(),
        eventiPunto(),
      ]);
      if (azienda.error || !azienda.data || evento.error) throw new Error("Configurazione non disponibile");
      const partiteIva = await partitaIvaCassa(admin, company_id, azienda.data.vat_number);
      const dal = evento.data && evento.data.giorno < ieri ? evento.data.giorno : ieri;
      const al = dal === ieri ? oggi : spostaGiornoCassa(dal, 1);
      await importaPeriodoCassa(admin, company_id, punto_vendita_id, partiteIva, dal, al, true);
      if (evento.data) {
        const rimosso = await admin.from("cassa_in_cloud_eventi").delete()
          .eq("company_id", company_id).eq("punto_vendita_id", punto_vendita_id)
          .eq("giorno", evento.data.giorno).eq("richiesto_il", evento.data.richiesto_il);
        if (rimosso.error) throw rimosso.error;
      }
      const inAttesa = await eventiPunto();
      if (inAttesa.error) throw inAttesa.error;
      const esito = await aggiorna({
        ultimo_sync: new Date().toISOString(), errore_sync: null,
        ...(inAttesa.data && { prossimo_sync: new Date().toISOString() }),
      });
      if (esito.error) throw esito.error;
    } catch (e) {
      const errore = e instanceof ErroreCassa ? e.message : "Sincronizzazione non riuscita. Riprova dall’archivio.";
      await aggiorna({ errore_sync: errore });
      throw new Error("Sincronizzazione non riuscita");
    }
  }));
  return { elaborati: esiti.length, errori: esiti.filter((e) => e.status === "rejected").length };
}
