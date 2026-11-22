import { supabase } from "@/integrations/supabase/client";
import { withAbortableClientTimeout, withClientTimeout } from "@/lib/query-timeout";
import { oggettoGiaCaricato } from "@/lib/commesse/caricaAllegatoConProgresso";
import { MAX_COMPRESSA_BYTES } from "./preparaFoto";
import { MAX_FOTO_TECNICHE, TIPI_FOTO_TECNICHE, valoreAttualeAvanzamento, valoreBozzaAvanzamento, type DatiBozzaTecnica, type FotoTecnica } from "./bozzaTecnica";
import { FOTO_AVANZAMENTO_BUCKET, FOTO_RILIEVO_BUCKET } from "./schedaCantiere";
import { erroreInvioCampo } from "./rapportoInCoda";
import { SyncDeferredError, SyncPermanentError, SyncTransientError, type CampoSyncResult } from "./sync-queue";

const nomeFoto = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/;
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

function erroreTecnico(error: unknown) {
  const { code, message, statusCode, status } = (error ?? {}) as {
    code?: string; message?: string; statusCode?: string | number; status?: number;
  };
  if (code === "PT409") return new SyncDeferredError("Accedi con l’autore della registrazione per sincronizzarla.");
  if (code === "40001") {
    return message?.startsWith("Il valore è cambiato.")
      ? new SyncPermanentError("L’avanzamento è cambiato. Rileggi il valore prima di inviare.", "avanzamento-cambiato")
      : new SyncTransientError("Sto aspettando la conferma dell’aggiornamento.");
  }
  if (code === "42501" || Number(statusCode ?? status) === 403) {
    return new SyncPermanentError("Il cantiere o il permesso di registrazione non è più disponibile.", "permesso");
  }
  return erroreInvioCampo(error, "Non riesco a inviare la registrazione. I dati restano sul telefono.");
}

function argomenti(dati: DatiBozzaTecnica, id: string) {
  return { p_azienda: dati.company_id, p_ordine: dati.order_id, p_operazione: id, p_autore: dati.user_id };
}

export async function statoInvioTecnico(dati: DatiBozzaTecnica, id: string, signal?: AbortSignal) {
  const { data, error } = await withAbortableClientTimeout(abort => supabase.rpc("campo_stato_invio_tecnico", {
    ...argomenti(dati, id), p_tipo: dati.tipo,
    p_fase: dati.tipo === "avanzamento" ? dati.target.faseId : null,
    p_sottofase: dati.tipo === "avanzamento" ? dati.target.sottofaseId ?? null : null,
  }).abortSignal(abort), "Verifica accesso al cantiere", undefined, signal);
  if (error) throw erroreTecnico(error);
  return data === true;
}

async function caricaFoto(bucket: string, percorso: string, foto: FotoTecnica) {
  const storage = supabase.storage.from(bucket);
  const { error } = await withClientTimeout(
    storage.upload(percorso, foto.bytes, { contentType: foto.contentType, upsert: false }),
    "Caricamento foto", 25_000,
  );
  if (!error) return;
  if (!oggettoGiaCaricato(error)) throw erroreTecnico(error);

  const { data, error: lettura } = await withAbortableClientTimeout(
    signal => storage.download(percorso, {}, { signal }), "Verifica foto",
  );
  if (lettura) throw erroreTecnico(lettura);
  if (!data) throw new SyncTransientError("Sto verificando la foto già caricata.");
  const locale = foto.bytes;
  const remoto = await data.arrayBuffer();
  const copia = new Uint8Array(remoto);
  if (locale.byteLength !== remoto.byteLength || !new Uint8Array(locale).every((byte, i) => byte === copia[i])) {
    throw new SyncPermanentError("Il file ricevuto è diverso dalla foto salvata sul telefono.");
  }
}

export async function inviaTecnicaInCoda(dati: DatiBozzaTecnica, id: string): Promise<CampoSyncResult> {
  const { tipo, company_id, user_id, order_id, foto } = dati;
  const risultato = { tipo, companyId: company_id, userId: user_id, orderId: order_id, id };
  if (![id, company_id, user_id, order_id].every(valore => uuid.test(valore))) {
    throw new SyncPermanentError("Impossibile identificare il cantiere e l’autore della registrazione.");
  }
  if (await statoInvioTecnico(dati, id)) return risultato;
  if (!Array.isArray(foto) || foto.length > MAX_FOTO_TECNICHE || foto.some(f =>
    !(f?.bytes instanceof ArrayBuffer) || !f.bytes.byteLength || f.bytes.byteLength > MAX_COMPRESSA_BYTES
      || !nomeFoto.test(f.nomeFile) || !TIPI_FOTO_TECNICHE.includes(f.contentType)
  ) || new Set(foto.map(f => f.nomeFile)).size !== foto.length) {
    throw new SyncPermanentError("Controlla le foto. Gli originali restano sul telefono.");
  }

  const bucket = tipo === "avanzamento" ? FOTO_AVANZAMENTO_BUCKET : FOTO_RILIEVO_BUCKET;
  const prefisso = tipo === "avanzamento" ? `${company_id}/${order_id}/${user_id}/${id}`
    : `${company_id}/${id}/visite-campo/${order_id}/${user_id}`;
  const percorsi = foto.map(f => `${prefisso}/${f.nomeFile}`);
  try {
    for (const [i, file] of foto.entries()) await caricaFoto(bucket, percorsi[i], file);
  } catch (error) {
    // A retry in another tab may have committed while this one was uploading.
    if (await statoInvioTecnico(dati, id).catch(() => false)) return risultato;
    throw error;
  }

  const comune = { ...argomenti(dati, id), p_note: dati.note.trim() || null, p_foto: percorsi };
  const { data, error } = dati.tipo === "avanzamento"
    ? await withClientTimeout(supabase.rpc("campo_invia_avanzamento", {
      ...comune, p_fase: dati.target.faseId, p_sottofase: dati.target.sottofaseId ?? null,
      p_avanzamento: valoreBozzaAvanzamento(dati).avanzamento,
      p_precedente: valoreAttualeAvanzamento(dati.target), p_previsto: dati.target.misura?.totale ?? null,
    }), "Invio avanzamento")
    : await withClientTimeout(supabase.rpc("campo_registra_visita_con_foto", {
      ...comune, p_tipo: dati.visita, p_giorno: dati.giorno, p_misure: dati.misure.trim() || null,
    }), "Invio visita");
  if (error) throw erroreTecnico(error);
  if (data !== id) throw new SyncTransientError("Sto aspettando la conferma dell’invio.");
  return risultato;
}
