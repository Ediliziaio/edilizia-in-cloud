/**
 * Contesto del controllo qualità (QA vision) del render bagno: cosa è stato
 * ordinato e quali violazioni ha senso cercare. Estratto dall'edge
 * generate-bathroom-render per poterlo provare: lì il controllo sul WC sospeso
 * cercava «sospeso» dentro toiletType, che però è la descrizione INGLESE
 * («wall-hung rimless sanitary ware»). Non scattava mai: il QA non cercava la
 * violazione «wallhung_violation» e non diceva che il WC nuovo è sospeso.
 */
import type { BathroomRenderConfig } from "./types.ts";

export interface BathroomQaContext {
  wallHungSelected: boolean;
  tubToShower: boolean;
  showerToTub: boolean;
  /**
   * Cio' che il cliente HA ORDINATO. Senza questo elenco il QA bocciava
   * proprio il lavoro richiesto: sessione 9703a2bd, brief con vasca
   * freestanding al posto della doccia -> "invented_objects: freestanding
   * bathtub not in source", "geometry_change: shower location moved".
   * Stessa classe del falso positivo sul cassonetto infissi. Ogni falso
   * positivo costa una generazione in piu' e ~40s.
   */
  modificheAutorizzate: string[];
}

export function bathroomQaContext(
  config: Pick<BathroomRenderConfig, "technical_specification" | "scene_analysis">,
): BathroomQaContext {
  const qaSpec = config.technical_specification;
  const qaScene = config.scene_analysis;
  // toiletType è la descrizione inglese (SANITARY_TYPE_DESCRIPTIONS); «sospeso» resta
  // per eventuali payload scritti a mano con la chiave italiana.
  const wallHungSelected = qaSpec.sanitaryWare.replace &&
    /wall-hung|sospeso/i.test(String(qaSpec.sanitaryWare.toiletType ?? ""));
  const tubToShower = qaSpec.shower.replace && !qaSpec.bathtub.replace && qaScene.bathtub.present;
  const showerToTub = qaSpec.bathtub.replace && !qaSpec.shower.replace && qaScene.shower.present;

  const modificheAutorizzate: string[] = [];
  if (showerToTub) {
    modificheAutorizzate.push(
      "the existing SHOWER is REMOVED and a NEW BATHTUB" +
        (qaSpec.bathtub.type ? ` (${String(qaSpec.bathtub.type).replace(/_/g, " ")})` : "") +
        " takes its place: the tub is ordered work, never an invented object, and the shower's disappearance is never a geometry change",
    );
  }
  if (tubToShower) {
    modificheAutorizzate.push(
      "the existing BATHTUB is REMOVED and a NEW SHOWER takes its place: the shower is ordered work, never an invented object",
    );
  }
  if (qaSpec.sanitaryWare.replace) {
    modificheAutorizzate.push(
      "the WC" + (wallHungSelected ? " (now WALL-HUNG)" : "") +
        " and the other sanitary ware are REPLACED one-for-one with new models",
    );
  }
  // L'azione sul bidet vale solo se i sanitari si cambiano: prima un «aggiungi»
  // rimasto nel form con la sezione spenta autorizzava un bidet che il prompt non chiede.
  const bidetAction = qaSpec.sanitaryWare.replace ? String(qaSpec.sanitaryWare.bidetAction ?? "") : "";
  if (bidetAction === "aggiungi") {
    modificheAutorizzate.push(
      "a NEW BIDET is ADDED beside the WC: a bidet is NOT a second toilet and must never be reported as a duplicated fixture",
    );
  } else if (bidetAction === "rimuovi") {
    modificheAutorizzate.push("the existing BIDET is REMOVED");
  } else if (bidetAction === "sostituisci" || qaScene.sanitaryWare.bidetPresent) {
    modificheAutorizzate.push(
      "a bidet is present beside the WC (as in the source, or replaced): a bidet is NOT a second toilet",
    );
  }
  if (qaSpec.vanity.replace) modificheAutorizzate.push("the VANITY/washbasin unit is replaced");
  if (qaSpec.wallTiles.replace) modificheAutorizzate.push("the WALL TILES/cladding are replaced");
  if (qaSpec.floor.replace) modificheAutorizzate.push("the FLOOR finish is replaced");
  if (qaSpec.faucets.replace) modificheAutorizzate.push("taps and fittings are replaced");
  if (qaSpec.lighting.replace) modificheAutorizzate.push("the lighting fixtures are replaced");
  // Elementi aggiunti dal form: oggetti nuovi che il QA non deve chiamare «inventati».
  const tw = qaSpec.towelWarmer;
  if (tw?.replace) {
    modificheAutorizzate.push(
      tw.action === "rimuovi"
        ? "the existing TOWEL WARMER / radiator is REMOVED"
        : `the TOWEL WARMER is ${tw.action === "aggiungi" ? "ADDED" : "REPLACED"}: a towel radiator on the wall is ordered work, never an invented object`,
    );
  }
  if (qaSpec.shower.replace && qaSpec.shower.wallNicheRule && qaSpec.shower.wallNiche) {
    modificheAutorizzate.push("a recessed NICHE is built into the shower wall: it is ordered work, never an invented object");
  }
  if (qaSpec.bathtub.replace && qaSpec.bathtub.screenRule && !/^no bath screen/i.test(qaSpec.bathtub.screenRule)) {
    modificheAutorizzate.push("a GLASS BATH SCREEN is fitted on the bathtub rim: it is ordered work, not a second shower");
  }

  return { wallHungSelected, tubToShower, showerToTub, modificheAutorizzate };
}
