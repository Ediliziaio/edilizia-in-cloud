/**
 * L'immagine da ricalcare sotto la pianta: si carica nel bucket «planimetrie» (cartella
 * dell'azienda, `<azienda>/ricalco/…`) e si legge con un link firmato. Nel documento resta solo
 * il percorso, con posizione e scala (`Livello.ricalco`).
 */
import { supabase } from "@/integrations/supabase/client";

export interface ArchivioRicalco {
  carica: (file: File) => Promise<string>;
  url: (percorso: string) => Promise<string>;
}

const ESTENSIONI: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export function archivioRicalco(companyId: string): ArchivioRicalco {
  return {
    carica: async (file) => {
      const est = ESTENSIONI[file.type];
      if (!est) throw new Error("Formato non supportato: usa PNG, JPG o WEBP.");
      if (file.size > 15 * 1024 * 1024) throw new Error("Immagine troppo grande (massimo 15 MB).");
      const percorso = `${companyId}/ricalco/${crypto.randomUUID()}.${est}`;
      const { error } = await supabase.storage.from("planimetrie").upload(percorso, file, { contentType: file.type, upsert: false });
      if (error) throw new Error("L'immagine non si è caricata: riprova.");
      return percorso;
    },
    url: async (percorso) => {
      const { data, error } = await supabase.storage.from("planimetrie").createSignedUrl(percorso, 60 * 60 * 6);
      if (error || !data?.signedUrl) throw new Error("Immagine da ricalcare non trovata.");
      return data.signedUrl;
    },
  };
}
