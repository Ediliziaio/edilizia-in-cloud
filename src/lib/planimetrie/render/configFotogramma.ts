import type { ConfigurazioneStanza } from "@/modules/render-stanza/lib/types";
import type { MetadatiFotogramma } from "../tred/telecamera";
import type { PlanimetriaNelRender } from "./renderDallaPianta";

export function riferimentiFotogramma(f: MetadatiFotogramma): Pick<PlanimetriaNelRender, "inquadrate" | "arredi_inquadrati" | "posizioni_arredi"> {
  return {
    inquadrate: f.aperture_visibili.map(a => ({ id: a.id, posizione: a.posizione, riquadro: a.riquadro, ...(a.ritagliata ? { ritagliata: true } : {}) })),
    arredi_inquadrati: f.arredi_inquadrati,
    posizioni_arredi: f.posizioni_arredi,
  };
}

/** Le tende di uno stile non autorizzano a inventare una finestra fuori campo. */
export function configPerApertureInquadrate(config: ConfigurazioneStanza, metadati: Pick<MetadatiFotogramma, "aperture_visibili">): ConfigurazioneStanza {
  const finestraVisibile = metadati.aperture_visibili.some((a) => a.tipo === "finestra" || a.tipo === "portafinestra");
  return finestraVisibile || !config.tende.attivo ? config : { ...config, tende: { ...config.tende, attivo: false } };
}
