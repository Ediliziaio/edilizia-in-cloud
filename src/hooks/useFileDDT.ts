import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { DDTRicezione } from "./useDDTRicezione";

/** In archivio si conserva il percorso, mai un link firmato destinato a scadere. */
export function useFileDDT(ddt: DDTRicezione | null | undefined) {
  return useQuery({
    queryKey: [
      "ddt-file",
      ddt?.company_id,
      ddt?.id,
      ddt?.ddt_file_bucket,
      ddt?.ddt_file_url,
    ],
    enabled: !!ddt?.ddt_file_url,
    staleTime: 40 * 60 * 1000,
    queryFn: async () => {
      const path = ddt!.ddt_file_url!;
      if (!ddt!.ddt_file_bucket) return path;
      if (
        !["ddt-documenti", "whatsapp-media", "ddt-allegati"].includes(
          ddt!.ddt_file_bucket!,
        ) ||
        !path.startsWith(`${ddt!.company_id}/`) ||
        /[%?#\\]|(^|\/)\.\.?(\/|$)/.test(path)
      )
        throw new Error("Percorso documento non valido");
      const { data, error } = await supabase.storage
        .from(ddt!.ddt_file_bucket!)
        .createSignedUrl(path, 3600);
      if (error || !data?.signedUrl)
        throw new Error("Originale non disponibile");
      return data.signedUrl;
    },
  });
}
