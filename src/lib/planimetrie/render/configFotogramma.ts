import type { ConfigurazioneStanza } from "@/modules/render-stanza/lib/types";
import type { MetadatiFotogramma } from "../tred/telecamera";

/** Le tende di uno stile non autorizzano a inventare una finestra fuori campo. */
export function configPerApertureInquadrate(config: ConfigurazioneStanza, metadati: Pick<MetadatiFotogramma, "aperture_visibili">): ConfigurazioneStanza {
  const finestraVisibile = metadati.aperture_visibili.some((a) => a.tipo === "finestra" || a.tipo === "portafinestra");
  return finestraVisibile || !config.tende.attivo ? config : { ...config, tende: { ...config.tende, attivo: false } };
}
