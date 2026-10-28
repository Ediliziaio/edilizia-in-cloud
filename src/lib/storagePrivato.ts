import { supabase } from "@/integrations/supabase/client";
/** Keep the user gesture for Safari; access still depends on bucket RLS. */
export async function apriFileRiservato(bucket: string, path: string) {
  const finestra = window.open("about:blank", "_blank");
  if (!finestra)
    throw new Error(
      "Il browser ha bloccato l’apertura. Consenti la nuova scheda e riprova.",
    );
  finestra.opener = null;
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, 300);
    if (error || !data?.signedUrl)
      throw error ?? new Error("File non disponibile.");
    finestra.location.href = data.signedUrl;
  } catch (error) {
    finestra.close();
    throw error;
  }
}
