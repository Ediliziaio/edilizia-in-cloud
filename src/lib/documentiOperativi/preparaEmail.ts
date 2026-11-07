import { supabase } from "@/integrations/supabase/client";
import { leggiModelloPdf } from "@/lib/modelliPdf/repository";
import { corpoDocumento, erroriDocumento, nomeFileDocumento, TITOLI, type DocumentoOperativo, type AziendaDocumento } from "./modello";
import type { ComposeContext, ComposeAttachment } from "@/pages/azienda/email/components/EmailComposeDialog";

/** Prepara una bozza completa. L'invio resta esclusivamente nel compositore email. */
export async function preparaEmailDocumento({documento:d,azienda,context,modo,userId,signal,originale=d}: {
  documento:DocumentoOperativo;azienda:AziendaDocumento;context:ComposeContext;modo:"testo" | "pdf";
  userId?:string;signal?:AbortSignal;originale?:DocumentoOperativo;
}):Promise<ComposeContext> {
  const problemi=erroriDocumento(d);
  if(problemi.length) throw new Error(problemi.slice(0,4).join(" "));
  signal?.throwIfAborted();
  let uploaded:string | null=null;
  try {
    const modello=await leggiModelloPdf(azienda.id,d.tipo);
    signal?.throwIfAborted();
    const documento={...d,condizioni:d.condizioni?.trim() || modello.condizioni || d.condizioni};
    const allegati:ComposeAttachment[]=[];
    if(modo === "pdf") {
      if(!userId) throw new Error("Accedi di nuovo per preparare l’allegato.");
      const {generaPdfOperativo}=await import("./pdf");
      const blob=await generaPdfOperativo(documento,azienda,modello);
      signal?.throwIfAborted();
      const name=nomeFileDocumento(d);
      const path=`${userId}/tmp/${crypto.randomUUID()}-${name}`;
      const {error}=await supabase.storage.from("email-attachments").upload(path,blob,{contentType:"application/pdf",upsert:false});
      if(error) throw new Error(`PDF non allegato: ${error.message}`);
      uploaded=path;
      signal?.throwIfAborted();
      allegati.push({name,size:blob.size,mime:"application/pdf",storage_path:path});
    }
    return {
      ...context,
      ...(context.procurement?{procurement:{...context.procurement,documento}}:{}),
      initialSubject:d.numero === originale.numero && d.tipo === originale.tipo && context.initialSubject
        ? context.initialSubject : `${TITOLI[d.tipo]} ${d.tipo === "richiesta" ? `[${d.numero}]` : d.numero} | ${azienda.name}`,
      initialTo:d.destinatario.email?.trim() ? [d.destinatario.email.trim()] : d.fornitoreId ? [] : context.initialTo,
      initialBodyHtml:corpoDocumento(documento,azienda,modo === "pdf"),
      initialAttachments:[...(context.initialAttachments ?? []),...allegati],
    };
  } catch(error) {
    if(uploaded) await supabase.storage.from("email-attachments").remove([uploaded]);
    throw error;
  }
}
