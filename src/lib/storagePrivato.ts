import { supabase } from "@/integrations/supabase/client";
import { apriDocumentoDaRichiesta } from "@/lib/campo/apriDocumento";
/** Keep the user gesture for Safari; access still depends on bucket RLS. */
export async function apriFileRiservato(bucket: string, path: string, pagina?: number) {
  await apriDocumentoDaRichiesta(async () => {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, 300);
    if (error || !data?.signedUrl)
      throw error ?? new Error("File non disponibile.");
    return pagina && Number.isSafeInteger(pagina) && pagina > 0 ? `${data.signedUrl}#page=${pagina}` : data.signedUrl;
  }, path.split("/").pop());
}
