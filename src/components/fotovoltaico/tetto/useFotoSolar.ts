import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  metriDaCoordinate,
  type PosizioneMappaFv,
} from "../../../../supabase/functions/_shared/fvMappa";
import type { FotoSolarFv } from "../../../../supabase/functions/_shared/fvGoogleSolar";
import type { OrtoRuntime } from "./rilievoLocale";
export function useFotoSolarFv(foto: FotoSolarFv | undefined) {
  const path = foto?.path;
  const [caricata, setCaricata] = useState<
    { path: string; url: string; errore: string } | null
  >(null);
  useEffect(() => {
    if (!path) return;
    let attiva = true, url: string | undefined;
    void supabase.storage.from("fv-progetti").download(path).then(
      ({ data, error }) => {
        if (!attiva) return;
        if (error || !data) {
          setCaricata({
            path,
            url: "",
            errore:
              "La foto Google Solar salvata non si apre. Riprova l’analisi o usa Google Maps.",
          });
          return;
        }
        url = URL.createObjectURL(data);
        setCaricata({ path, url, errore: "" });
      },
    ).catch(() => {
      if (attiva) setCaricata({path, url:"", errore:"La foto Google Solar non si è caricata. Riprova l’analisi o usa Google Maps."});
    });
    return () => {
      attiva = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [path]);
  return caricata?.path === foto?.path ? caricata : null;
}
export function useOrtoSolarFv(
  foto: FotoSolarFv | undefined,
  origine: PosizioneMappaFv | undefined,
) {
  const carica = useFotoSolarFv(foto);
  return useMemo((): OrtoRuntime | null => {
    if (!foto || !origine || !carica?.url) return null;
    const [a, b, c] = foto.angoli.map((p) => metriDaCoordinate(p, origine));
    return {
      nome: `Google Solar · ${foto.data}`,
      url: carica.url,
      larghezza: foto.larghezza,
      altezza: foto.altezza,
      affine: [
        (b.x - a.x) / foto.larghezza,
        (c.x - a.x) / foto.altezza,
        a.x,
        (b.y - a.y) / foto.larghezza,
        (c.y - a.y) / foto.altezza,
        a.y,
      ],
    };
  }, [foto, origine, carica]);
}
