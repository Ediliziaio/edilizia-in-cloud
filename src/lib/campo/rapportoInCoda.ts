import { supabase } from "@/integrations/supabase/client";
import type { Json, TablesInsert } from "@/integrations/supabase/types";
import { riferimentoFile } from "@/lib/storage/fileRiservati";
import { withClientTimeout } from "@/lib/query-timeout";
import { hasRapportinoAssignment } from "./rapportinoAssignment";
import { SyncDeferredError, SyncPermanentError, SyncTransientError, type CampoSyncResult } from "./sync-queue";
import type { rigaTimbratura } from "./timbra";

const BUCKET = "campo-rapportini";

export interface AllegatoRapportino {
  percorso: string;
  blob: Blob;
  contentType: string;
}

export interface RapportoInCoda {
  company_id: string;
  user_id: string;
  order_id: string;
  giorno: string;
  roleType: "employee" | "subcontractor";
  campi: Omit<TablesInsert<"campo_rapportini">, "id" | "company_id" | "user_id" | "order_id" | "role_type" | "data_lavoro" | "stato">;
  allegati: AllegatoRapportino[];
  correzione?: { id: string; versione: string | null };
  uscita?: ReturnType<typeof rigaTimbratura>;
  mezzi: Json[];
}

export function erroreInvioCampo(error: unknown): Error {
  if (error instanceof SyncPermanentError || error instanceof SyncDeferredError || error instanceof SyncTransientError) return error;
  const { code, message, status, statusCode } = (error ?? {}) as { code?: string; message?: string; status?: number; statusCode?: string | number };
  const testo = message || "Non riesco a inviare il rapportino.";
  if (code === "PGRST301" || code === "PGRST303" || Number(statusCode ?? status) === 401) return new SyncDeferredError(testo);
  if (code?.startsWith("22") || code?.startsWith("23") || code === "42501" || /permess|not authorized/i.test(testo)) {
    return new SyncPermanentError(testo);
  }
  if (Number(statusCode ?? status) >= 500 || /failed to fetch|load failed|network|timeout|tempo scaduto/i.test(testo)) {
    return new SyncTransientError(testo);
  }
  return new Error(testo);
}

export function riferimentoAllegatoRapportino(percorso: string) {
  return riferimentoFile(BUCKET, percorso);
}

async function caricaAllegato(allegato: AllegatoRapportino, prefisso: string) {
  const { percorso, blob, contentType } = allegato;
  if (typeof percorso !== "string" || !percorso.startsWith(prefisso)
    || !/^(?:firme\/|bozza\/)?[a-f0-9-]+(?:_(?:operaio|cliente))?\.[a-z0-9]+$/i.test(percorso.slice(prefisso.length))
    || !(blob instanceof Blob) || !blob.size || !contentType.startsWith("image/")) {
    throw new SyncPermanentError("Una foto o firma del rapportino non è leggibile sul telefono.");
  }
  const storage = supabase.storage.from(BUCKET);
  const { error } = await withClientTimeout(storage.upload(percorso, blob, { contentType, upsert: false }), "Caricamento foto");
  if (!error) return;
  if (String((error as { statusCode?: string }).statusCode) !== "409" && !/already exists|duplicate/i.test(error.message)) throw erroreInvioCampo(error);
  const { data, error: downloadError } = await withClientTimeout(storage.download(percorso), "Verifica foto");
  if (downloadError) throw erroreInvioCampo(downloadError);
  if (!data) throw new Error("Non riesco a verificare la foto già caricata.");
  const [originale, salvata] = await Promise.all([blob.arrayBuffer(), data.arrayBuffer()]);
  const copia = new Uint8Array(salvata);
  if (originale.byteLength !== salvata.byteLength || !new Uint8Array(originale).every((valore, indice) => valore === copia[indice])) {
    throw new SyncPermanentError("Una foto già presente è diversa da quella salvata sul telefono.");
  }
}

async function registraUscita(uscita: NonNullable<RapportoInCoda["uscita"]>) {
  const { error } = await supabase.from("campo_timbrature").insert(uscita);
  if (!error) return;
  if (error.code === "23505") {
    const { data, error: lettura } = await supabase.from("campo_timbrature").select("id")
      .eq("id", uscita.id).eq("company_id", uscita.company_id).eq("user_id", uscita.user_id)
      .eq("tipo", uscita.tipo).eq("timestamp_evento", uscita.timestamp_evento).maybeSingle();
    if (lettura) throw erroreInvioCampo(lettura);
    if (data) return;
  }
  throw erroreInvioCampo(error);
}

async function inviaRapporto(payload: RapportoInCoda, operationId: string): Promise<CampoSyncResult> {
  const { company_id, order_id, user_id, giorno, roleType, campi, correzione, allegati, uscita, mezzi } = payload;
  const id = correzione?.id ?? operationId;
  const risultato = { tipo: "rapportino", companyId: company_id, orderId: order_id, userId: user_id, id } as const;
  const leggiRicevuta = async () => {
    const { data, error } = await supabase.from("campo_rapportini")
      .select("invio_operazione_id, updated_at, stato, pdf_url, annullato_at")
      .eq("id", id).eq("company_id", company_id).eq("order_id", order_id).eq("user_id", user_id).eq("data_lavoro", giorno)
      .maybeSingle();
    if (error) throw erroreInvioCampo(error);
    return data;
  };
  const ricevuta = await leggiRicevuta();
  if (ricevuta?.invio_operazione_id === operationId && (ricevuta.stato !== "inviato" || ricevuta.annullato_at)) return risultato;
  const inviato = ricevuta?.invio_operazione_id === operationId;
  if (!inviato) {
    if (correzione && (!ricevuta || ricevuta.annullato_at || (ricevuta.updated_at ?? null) !== correzione.versione
      || (ricevuta.stato !== "bozza" && ricevuta.stato !== "rifiutato"))) {
      throw new SyncPermanentError("Il rapportino è cambiato in ufficio. I dati compilati restano sul telefono.");
    }
    if (!await hasRapportinoAssignment(order_id, user_id, company_id)) {
      throw new SyncPermanentError("Non puoi inviare rapportini per un lavoro non assegnato.");
    }
    for (const allegato of allegati) await caricaAllegato(allegato, company_id + "/" + order_id + "/");
    // Mantiene l'ora dell'uscita confermata sul telefono, anche se la rete torna più tardi.
    if (uscita) await registraUscita(uscita);
    const scrittura = { ...campi, stato: "inviato", invio_operazione_id: operationId };
    const aggiornamento = correzione
      ? supabase.from("campo_rapportini")
        .update({ ...scrittura, motivo_rifiuto: null, pdf_url: null, approvato: false })
        .eq("id", id).eq("company_id", company_id).eq("order_id", order_id).eq("user_id", user_id)
        .in("stato", ["bozza", "rifiutato"]).is("annullato_at", null)
      : null;
    const scritta = aggiornamento && correzione
      ? await (correzione.versione === null
        ? aggiornamento.is("updated_at", null) : aggiornamento.eq("updated_at", correzione.versione)).select("id").maybeSingle()
      : await supabase.from("campo_rapportini")
        .insert({ ...scrittura, id, company_id, order_id, user_id, role_type: roleType, data_lavoro: giorno })
        .select("id").maybeSingle();
    if (scritta.error && scritta.error.code !== "23505") throw erroreInvioCampo(scritta.error);
    if (!scritta.data) {
      const conferma = await leggiRicevuta();
      if (conferma?.invio_operazione_id !== operationId) {
        throw new SyncPermanentError("Il rapportino di questa giornata è già presente o è cambiato in ufficio. I dati restano sul telefono.");
      }
      if (conferma.stato !== "inviato" || conferma.annullato_at) return risultato;
    }
  }
  let avvisoMezzi = false;
  if (mezzi.length) {
    try {
      const { error } = await supabase.rpc("campo_mezzi_fine_giornata", {
        p_order_id: order_id, p_giorno: giorno, p_righe: mezzi, p_rapportino_id: id,
      });
      if (error) throw erroreInvioCampo(error);
    } catch (error) {
      // Una richiesta interrotta va ripresa con lo stesso rapporto, senza un secondo inserimento.
      const errore = erroreInvioCampo(error);
      if (errore instanceof SyncTransientError || errore instanceof SyncDeferredError) throw errore;
      avvisoMezzi = true;
    }
  }
  return { ...risultato, pdf: !inviato || !ricevuta?.pdf_url, avvisoMezzi, chiudeGiornata: !!uscita };
}

export async function inviaRapportoInCoda(payload: RapportoInCoda, operationId: string): Promise<CampoSyncResult> {
  try {
    return await inviaRapporto(payload, operationId);
  } catch (error) {
    throw erroreInvioCampo(error);
  }
}
