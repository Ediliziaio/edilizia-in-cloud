import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { PosizioneMappaFv } from "../../../../supabase/functions/_shared/fvMappa";
export function useSatelliteFv(centro: PosizioneMappaFv, zoom: number) {
  const [stato, setStato] = useState<
    { url: string | null; errore: string; chiave: string }
  >({ url: null, errore: "", chiave: "" });
  const [tentativo, setTentativo] = useState(0);
  const chiave = `${centro.lat}:${centro.lng}:${zoom}:${tentativo}`;
  useEffect(() => {
    let attivo = true;
    const controller = new AbortController(),
      timeout = setTimeout(() => controller.abort(), 15000);
    void (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("maps-proxy", {
          body: {
            action: "staticmap",
            lat: centro.lat,
            lng: centro.lng,
            zoom,
            w: 640,
            h: 440,
            solo_google: true,
          },
          signal: controller.signal,
        });
        if (!attivo) return;
        if (
          error || data?.provider !== "google" ||
          typeof data?.dataUrl !== "string" ||
          !/^data:image\/(png|jpeg|webp);base64,/.test(data.dataUrl)
        ) {
          throw Error(
            "Vista Google non disponibile. Puoi inserire misure rilevate o riprovare.",
          );
        }
        setStato({ url: data.dataUrl, errore: "", chiave });
      } catch (e) {
        if (attivo) {
          setStato({
            url: null,
            errore: e instanceof Error
              ? e.message
              : "Mappa non disponibile: continua con le misure manuali.",
            chiave,
          });
        }
      } finally {
        clearTimeout(timeout);
      }
    })();
    return () => {
      attivo = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [centro.lat, centro.lng, zoom, tentativo, chiave]);
  return {
    url: stato.chiave === chiave ? stato.url : null,
    errore: stato.chiave === chiave ? stato.errore : "",
    caricando: stato.chiave !== chiave,
    riprova: () => setTentativo((n) => n + 1),
  };
}
