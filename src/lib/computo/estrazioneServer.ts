import { supabase } from "@/integrations/supabase/client";
import { computoFileType } from "./uploadFileType";
import type { ComputoExtractionStatus, ComputoVoceEstratta } from "@/types/computo";

/**
 * La lettura sul server (`computo-ai-extract`): scansioni, PDF che non vengono
 * da PriMus, foto, vecchi .xls. Lo stesso giro di `useComputoExtract`, ma come
 * funzione: il popup «Importa voci» legge più file uno dopo l'altro e mostra
 * lo stato vero di ciascuno (pagine lette, analisi), letto dal database.
 */

export interface StatoServer {
  stato: ComputoExtractionStatus;
  /** «3/10 pagine lette; analisi delle voci…», quando la funzione lo scrive. */
  dettaglio?: string;
}

export interface OpzioniServer {
  companyId: string;
  userId: string;
  onStato: (s: StatoServer) => void;
  segnale?: AbortSignal;
  /** Solo per i test: l'attesa tra due letture dello stato. */
  intervalloMs?: number;
}

const interrotto = () => new DOMException("Lettura annullata.", "AbortError");

export async function estraiSulServer(file: File, o: OpzioniServer): Promise<ComputoVoceEstratta[]> {
  const fileType = computoFileType(file);
  o.onStato({ stato: "uploading" });
  const percorso = `${o.companyId}/${Date.now()}-${file.name.replace(/[^\w.\- ]+/g, "_")}`;
  const { error: erroreFile } = await supabase.storage.from("computi").upload(percorso, file);
  if (erroreFile) throw new Error("Il file non si è caricato: controlla la connessione e riprova.");
  if (o.segnale?.aborted) throw interrotto();

  const { data: riga, error: erroreRiga } = await supabase.from("computo_uploads").insert({
    company_id: o.companyId, uploaded_by: o.userId, file_name: file.name, file_type: fileType,
    file_size: file.size, storage_path: percorso, extraction_status: "uploading",
  }).select("id").single();
  if (erroreRiga || !riga) throw new Error("La lettura non è partita: riprova tra poco.");

  // La funzione può rispondere tardi (o andare in timeout) anche dopo aver finito: conta lo stato salvato.
  let finita = false;
  const chiamata = supabase.functions.invoke("computo-ai-extract", { body: { computoUploadId: riga.id } })
    .finally(() => { finita = true; });
  chiamata.catch((): void => undefined);

  const attesa = o.intervalloMs ?? 2000;
  for (let giro = 0; ; giro++) {
    if (o.segnale?.aborted) throw interrotto();
    const { data } = await supabase.from("computo_uploads")
      .select("extraction_status, extraction_error, raw_extracted_json")
      .eq("id", riga.id).eq("company_id", o.companyId).maybeSingle();
    if (data) {
      const stato = data.extraction_status as ComputoExtractionStatus;
      const json = data.raw_extracted_json as { progress?: unknown } | null;
      o.onStato({ stato, dettaglio: typeof json?.progress === "string" ? json.progress : undefined });
      if (stato === "failed") throw new Error(data.extraction_error || "Il file non si è potuto leggere.");
      if (stato === "review" || stato === "completed") break;
    }
    // Funzione finita da un pezzo e stato fermo: non aspettare all'infinito.
    if (finita && giro > 30) throw new Error("La lettura si è fermata senza risultato: riprova.");
    if (giro > 900) throw new Error("La lettura sta durando troppo: riprova con un file più piccolo.");
    await new Promise(r => setTimeout(r, attesa));
  }

  const { data: voci, error } = await supabase.from("computo_voci_estratte").select("*")
    .eq("computo_upload_id", riga.id).order("ordine");
  if (error) throw new Error("Le voci lette non si sono potute scaricare: riprova.");
  return (voci ?? []) as ComputoVoceEstratta[];
}
