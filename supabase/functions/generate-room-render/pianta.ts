// generate-room-render — render della stanza partendo dalla pianta (Planimetrie, fase 5b).
//
// Quando la sessione ha `config.planimetria`, il render conosce la stanza vera: misure,
// pareti, porte e finestre. Le misure NON arrivano dal browser: qui si rilegge la
// versione della pianta dal database, si controlla che sia dell'azienda della sessione e
// si calcolano i vincoli con la stessa libreria del browser
// (shared/render-planimetria). Dal browser arrivano solo le scelte: quale stanza, da
// dove si parte (foto o vista del 3D), quali aperture la vista inquadra e la pianta
// della stanza disegnata come immagine.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { ImageReferenceInput } from "../_shared/ai-provider/image.ts";
import { validaPlanimetria } from "../../../shared/planimetrie/modello.ts";
import { vincoliDellaStanza, type VincoliStanza } from "../../../shared/render-planimetria/vincoli.ts";
import { inquadrateValide, type AperturaInquadrata, type PartenzaRender } from "../../../shared/render-planimetria/prompt.ts";

export interface PiantaDelRender {
  vincoli: VincoliStanza;
  partenza: PartenzaRender;
  inquadrate: AperturaInquadrata[];
  /** La pianta della stanza vista dall'alto, da allegare al modello (null se manca). */
  immagine: ImageReferenceInput | null;
  /** Cosa salvare in config_snapshot per ritrovare da dove viene il render. */
  traccia: Record<string, unknown>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/**
 * I vincoli della pianta per questa sessione, o null se il render non viene da una
 * pianta. Lancia un errore leggibile se il riferimento c'è ma non regge: meglio
 * fermarsi PRIMA di scalare il credito che fare un render che ignora la pianta.
 */
export async function caricaPiantaDelRender(
  supabase: SupabaseClient,
  companyId: string,
  rifGrezzo: unknown,
  log: (entry: Record<string, unknown>) => void,
): Promise<PiantaDelRender | null> {
  if (!rifGrezzo || typeof rifGrezzo !== "object") return null;
  const rif = rifGrezzo as Record<string, unknown>;
  const planimetriaId = typeof rif.planimetria_id === "string" ? rif.planimetria_id : "";
  if (!planimetriaId) return null;
  if (!UUID.test(planimetriaId)) throw new Error("Pianta non valida.");
  const versione = Number(rif.versione);
  const livelloId = typeof rif.livello_id === "string" ? rif.livello_id : "";
  const ambito = typeof rif.ambito === "string" ? rif.ambito : "fatto";
  const localeId = typeof rif.locale_id === "string" ? rif.locale_id : "";
  if (!Number.isInteger(versione) || versione < 1 || !livelloId || !localeId) {
    throw new Error("Stanza della pianta non indicata: riapri la pianta e riprova.");
  }

  const { data: riga, error: rigaErr } = await supabase
    .from("planimetrie")
    .select("id, company_id, deleted_at")
    .eq("id", planimetriaId)
    .maybeSingle();
  if (rigaErr) throw new Error("Pianta non disponibile: riprova tra qualche secondo.");
  if (!riga || riga.deleted_at) throw new Error("Pianta non trovata: forse è stata cancellata.");
  if (riga.company_id !== companyId) throw new Error("forbidden: la pianta non è di questa azienda");

  const { data: ver, error: verErr } = await supabase
    .from("planimetrie_versioni")
    .select("documento")
    .eq("planimetria_id", planimetriaId)
    .eq("numero", versione)
    .maybeSingle();
  if (verErr) throw new Error("Pianta non disponibile: riprova tra qualche secondo.");
  if (!ver) throw new Error("Questa versione della pianta non esiste.");
  const esito = validaPlanimetria(ver.documento);
  if (esito.ok === false) throw new Error("La pianta salvata non si legge: aprila e salvala di nuovo.");

  const vincoli = vincoliDellaStanza(esito.planimetria, { livello_id: livelloId, ambito, locale_id: localeId });
  if (!vincoli) throw new Error("La stanza non c'è più in questa versione della pianta.");

  const partenza: PartenzaRender = rif.partenza === "vista_3d" ? "vista_3d" : "foto";
  const inquadrate = partenza === "vista_3d" ? inquadrateValide(vincoli, rif.inquadrate) : [];

  // La pianta della stanza disegnata dal browser (stesso disegno che vede l'utente,
  // con i nomi in inglese). Solo dalla cartella dell'azienda; se manca si va avanti con
  // le parole del prompt.
  let immagine: ImageReferenceInput | null = null;
  const percorso = typeof rif.pianta_path === "string" ? rif.pianta_path : "";
  if (percorso) {
    if (!percorso.startsWith(`${companyId}/`) || percorso.includes("..")) {
      log({ lvl: "warn", msg: "pianta_path_fuori_azienda" });
    } else {
      try {
        const { data: file, error } = await supabase.storage.from("stanza-originals").download(percorso);
        if (error || !file) throw new Error(error?.message ?? "file assente");
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (bytes.length > 0 && bytes.length < 4_000_000) {
          immagine = {
            label: "FLOOR PLAN OF THIS ROOM, seen from above — position of every door and window (not a product, never show it)",
            dataUrl: `data:${file.type || "image/png"};base64,${bytesToBase64(bytes)}`,
          };
        }
      } catch (e) {
        log({ lvl: "warn", msg: "pianta_immagine_non_letta", error: String((e as Error)?.message ?? e).slice(0, 200) });
      }
    }
  }

  return {
    vincoli,
    partenza,
    inquadrate,
    immagine,
    traccia: {
      planimetria_id: planimetriaId,
      versione,
      livello_id: livelloId,
      ambito,
      locale_id: localeId,
      partenza,
      locale: vincoli.locale,
      aperture: vincoli.aperture.map((a) => ({ id: a.id, etichetta: a.etichetta, parete: a.parete })),
      inquadrate: inquadrate.map((q) => q.id),
      immagine_pianta: immagine !== null,
    },
  };
}
