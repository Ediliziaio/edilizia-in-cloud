import type { Planimetria } from "../../../shared/planimetrie/modello.ts";
import { ambitoGeometriaDelPiano, materialiDelProgetto } from "../../../shared/planimetrie/materialiProgetto.ts";
import { statoPerAmbito, vincoliDellaStanza } from "../../../shared/render-planimetria/vincoli.ts";
import type { RenderDellaPianta } from "./render/renderDallaPianta";
import { abacoSerramenti, abacoStanze } from "./abachi";

/** Nessuna variante o vecchia versione viene mescolata ai materiali attuali. */
export function contenutoFascicolo(doc: Planimetria, versione: number, ambito: string, renders: RenderDellaPianta[]) {
  return [...doc.livelli].sort((a, b) => a.quota - b.quota).map((livello) => {
    const geometria = ambitoGeometriaDelPiano(doc, livello.id, ambito);
    const stato = statoPerAmbito(doc, livello.id, geometria)!;
    return { livello, geometria, stato, materiali: materialiDelProgetto(doc, ambito),
      serramenti: abacoSerramenti(doc, livello.id, geometria),
      stanze: abacoStanze(doc, livello.id, geometria).map((r) => ({ ...r,
        vincoli: vincoliDellaStanza(doc, { livello_id: livello.id, ambito: geometria, locale_id: r.id })!,
        renders: renders.filter((x) => x.status === "completed" && x.result_urls?.length && x.planimetria?.versione === versione && x.planimetria.livello_id === livello.id && x.planimetria.locale_id === r.id && x.planimetria.ambito === geometria && (x.planimetria.materiali_ambito ?? x.planimetria.ambito) === ambito),
      })),
    };
  });
}
